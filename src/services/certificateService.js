const CertificateModel = require("../models/certificateModel");
const CertificateLogModel = require("../models/certificateLogModel");
const CertificateMigrationModel = require("../models/certificateMigrationModel");
const MedalStockModel = require("../models/medalStockModel");
const BranchModel = require("../models/branchModel");
const { query, getClient } = require("../config/database");
const PaginationHelper = require("../utils/paginationHelper");

class CertificateService {
  // ─── Helpers ──────────────────────────────────────────────────────────────

  static _formatCertificateNumber(num) {
    return `No. ${String(num).padStart(6, "0")}`;
  }

  static _parseCertificateNumber(certNumber) {
    return parseInt(certNumber.replace(/\D/g, ""), 10);
  }

  static async _validateAdminHeadBranch(adminId) {
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can perform this action");
    }

    if (!branch.is_active) {
      throw new Error("Branch is inactive");
    }

    return { admin, branch };
  }

  // ─── Bulk Create Certificates ─────────────────────────────────────────────

  static async bulkCreateCertificates({ startNumber, endNumber }, adminId) {
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can create certificates");
    }

    if (!branch.is_active) {
      throw new Error("Branch is inactive");
    }

    if (startNumber < 1 || endNumber < 1) {
      throw new Error("Certificate numbers must be positive");
    }

    if (startNumber > endNumber) {
      throw new Error("Start number must be less than or equal to end number");
    }

    const count = endNumber - startNumber + 1;
    if (count > 10000) {
      throw new Error("Maximum 10,000 certificates per batch");
    }

    const startCertNumber = this._formatCertificateNumber(
      this._parseCertificateNumber(String(startNumber)),
    );
    const endCertNumber = this._formatCertificateNumber(
      this._parseCertificateNumber(String(endNumber)),
    );

    const existingCount = await CertificateModel.countInRange(
      startCertNumber,
      endCertNumber,
      branch.id,
    );

    if (existingCount > 0) {
      throw new Error(
        `Certificate numbers in range ${startCertNumber} to ${endCertNumber} already exist`,
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const certificates = [];
      for (let i = startNumber; i <= endNumber; i++) {
        certificates.push({
          certificate_number: this._formatCertificateNumber(i),
          head_branch_id: branch.id,
          current_branch_id: branch.id,
          created_by: adminId,
        });
      }

      const created = await CertificateModel.bulkCreate(certificates, client);

      await CertificateLogModel.create(
        {
          action_type: "bulk_create",
          actor_id: adminId,
          actor_role: admin.role,
          to_branch_id: branch.id,
          metadata: {
            start_number: startCertNumber,
            end_number: endCertNumber,
            count: created.length,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: `Successfully created ${created.length} certificates`,
        range: {
          start: startCertNumber,
          end: endCertNumber,
        },
        count: created.length,
        branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Bulk Add Medals ──────────────────────────────────────────────────────

  static async bulkAddMedals({ quantity }, adminId) {
    const { admin, branch } = await this._validateAdminHeadBranch(adminId);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }

    if (quantity > 10000) {
      throw new Error("Maximum 10,000 medals per batch");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updated = await MedalStockModel.addStock(
        branch.id,
        quantity,
        client,
      );

      await MedalStockModel.createLog(
        {
          branch_id: branch.id,
          action_type: "add",
          quantity,
          actor_id: adminId,
          notes: `Bulk add ${quantity} medals to ${branch.code}`,
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: `Successfully added ${quantity} medals`,
        branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name,
        },
        quantity_added: quantity,
        new_total: updated.quantity,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Migrate Medals ───────────────────────────────────────────────────────

  static async migrateMedals({ toBranchId, quantity }, adminId) {
    const { admin, branch: fromBranch } =
      await this._validateAdminHeadBranch(adminId);

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }

    const toBranch = await BranchModel.findById(toBranchId);
    if (!toBranch) throw new Error("Target branch not found");
    if (toBranch.is_head_branch)
      throw new Error("Cannot migrate medals to another head branch");
    if (toBranch.parent_id !== fromBranch.id) {
      throw new Error("Target branch must be a sub branch of your head branch");
    }
    if (!toBranch.is_active) throw new Error("Target branch is inactive");

    // Cek stock cukup sebelum transaction
    const currentStock = await MedalStockModel.findByBranch(fromBranch.id);
    if (!currentStock || currentStock.quantity < quantity) {
      throw new Error(
        `Insufficient medal stock. Available: ${currentStock ? currentStock.quantity : 0}, requested: ${quantity}`,
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const transferred = await MedalStockModel.transferStock(
        fromBranch.id,
        toBranchId,
        quantity,
        client,
      );

      // Race condition guard
      if (!transferred) {
        throw new Error(
          `Insufficient medal stock. Cannot migrate ${quantity} medals.`,
        );
      }

      // Log migrate_out dari head branch
      await MedalStockModel.createLog(
        {
          branch_id: fromBranch.id,
          action_type: "migrate_out",
          quantity,
          actor_id: adminId,
          notes: `Migrated ${quantity} medals to ${toBranch.code}`,
        },
        client,
      );

      // Log migrate_in ke sub branch
      await MedalStockModel.createLog(
        {
          branch_id: toBranchId,
          action_type: "migrate_in",
          quantity,
          actor_id: adminId,
          notes: `Received ${quantity} medals from ${fromBranch.code}`,
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: `Successfully migrated ${quantity} medals`,
        from_branch: {
          id: fromBranch.id,
          code: fromBranch.code,
          name: fromBranch.name,
          remaining_stock: transferred.from.quantity,
        },
        to_branch: {
          id: toBranch.id,
          code: toBranch.code,
          name: toBranch.name,
          new_stock: transferred.to.quantity,
        },
        quantity_migrated: quantity,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Get Certificates ─────────────────────────────────────────────────────

  static async getCertificates(
    adminId,
    {
      status,
      currentBranchId,
      search,
      sortBy = "certificate_number",
      order = "desc",
      page = 1,
      limit = 50,
    } = {},
  ) {
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can view certificates");
    }

    const normalizedStatus =
      status && status.trim() !== "" ? status : undefined;
    const normalizedBranchId =
      currentBranchId && parseInt(currentBranchId, 10) > 0
        ? parseInt(currentBranchId, 10)
        : undefined;
    const normalizedSearch =
      search && search.trim() !== "" ? search.trim() : undefined;

    const allowedSortFields = [
      "certificate_number",
      "status",
      "created_at",
      "updated_at",
    ];
    const validSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "certificate_number";
    const validOrder = order?.toLowerCase() === "asc" ? "asc" : "desc";

    const {
      page: validPage,
      limit: validLimit,
      offset,
    } = PaginationHelper.calculateOffset(page, limit);

    const totalCount = await CertificateModel.countByHeadBranch(branch.id, {
      status: normalizedStatus,
      currentBranchId: normalizedBranchId,
      search: normalizedSearch,
    });

    const certificates = await CertificateModel.findByHeadBranch(branch.id, {
      status: normalizedStatus,
      currentBranchId: normalizedBranchId,
      search: normalizedSearch,
      sortBy: validSortBy,
      order: validOrder,
      limit: validLimit,
      offset,
    });

    return {
      certificates,
      pagination: PaginationHelper.buildResponse(
        validPage,
        validLimit,
        totalCount,
      ),
    };
  }

  // ─── Get Stock Summary ────────────────────────────────────────────────────

  static async getStockSummary(adminId) {
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const headBranch = await BranchModel.findById(admin.branch_id);
    if (!headBranch || !headBranch.is_head_branch) {
      throw new Error("Only head branch admins can view stock summary");
    }

    // Certificate stock
    const headCertStock = await CertificateModel.getStockCount(headBranch.id);

    // Medal stock
    const headMedalStock = await MedalStockModel.findByBranch(headBranch.id);

    const subBranches = await BranchModel.findSubBranches(headBranch.id, {
      includeInactive: false,
    });

    const subBranchStock = [];
    for (const subBranch of subBranches) {
      const certStock = await CertificateModel.getStockCount(subBranch.id);
      const medalStock = await MedalStockModel.findByBranch(subBranch.id);

      subBranchStock.push({
        branch_id: subBranch.id,
        branch_code: subBranch.code,
        branch_name: subBranch.name,
        certificate_stock: certStock,
        medal_stock: medalStock ? medalStock.quantity : 0,
        // Selisih antara sertif in_stock dan medal (indikator imbalance)
        imbalance:
          parseInt(certStock.in_stock, 10) -
          (medalStock ? medalStock.quantity : 0),
      });
    }

    return {
      head_branch: {
        id: headBranch.id,
        code: headBranch.code,
        name: headBranch.name,
        certificate_stock: headCertStock,
        medal_stock: headMedalStock ? headMedalStock.quantity : 0,
        imbalance:
          parseInt(headCertStock.in_stock, 10) -
          (headMedalStock ? headMedalStock.quantity : 0),
      },
      sub_branches: subBranchStock,
    };
  }

  // ─── Migrate Certificates ─────────────────────────────────────────────────

  static async migrateCertificates(
    { startNumber, endNumber, toBranchId },
    adminId,
  ) {
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const fromBranch = await BranchModel.findById(admin.branch_id);
    if (!fromBranch || !fromBranch.is_head_branch) {
      throw new Error("Only head branch admins can migrate certificates");
    }

    const toBranch = await BranchModel.findById(toBranchId);
    if (!toBranch) throw new Error("Target branch not found");
    if (toBranch.is_head_branch)
      throw new Error("Cannot migrate to another head branch");
    if (toBranch.parent_id !== fromBranch.id) {
      throw new Error("Target branch must be a sub branch of your head branch");
    }
    if (!toBranch.is_active) throw new Error("Target branch is inactive");

    const startCertNumber = this._formatCertificateNumber(
      this._parseCertificateNumber(String(startNumber)),
    );
    const endCertNumber = this._formatCertificateNumber(
      this._parseCertificateNumber(String(endNumber)),
    );

    const certificates = await CertificateModel.findByRange(
      startCertNumber,
      endCertNumber,
      fromBranch.id,
    );

    if (certificates.length === 0) {
      throw new Error(
        `No certificates found in range ${startCertNumber} to ${endCertNumber}`,
      );
    }

    const nonStockCerts = certificates.filter((c) => c.status !== "in_stock");
    if (nonStockCerts.length > 0) {
      throw new Error(
        `Cannot migrate: ${nonStockCerts.length} certificate(s) are not in stock status`,
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const migrations = [];
      for (const cert of certificates) {
        await CertificateModel.updateLocation(cert.id, toBranchId, client);

        migrations.push({
          certificate_id: cert.id,
          from_branch_id: fromBranch.id,
          to_branch_id: toBranchId,
          migrated_by: adminId,
        });
      }

      await CertificateMigrationModel.bulkCreate(migrations, client);

      await CertificateLogModel.create(
        {
          action_type: "migrate",
          actor_id: adminId,
          actor_role: admin.role,
          from_branch_id: fromBranch.id,
          to_branch_id: toBranchId,
          metadata: {
            start_number: startCertNumber,
            end_number: endCertNumber,
            count: certificates.length,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: `Successfully migrated ${certificates.length} certificates`,
        from_branch: {
          id: fromBranch.id,
          code: fromBranch.code,
          name: fromBranch.name,
        },
        to_branch: {
          id: toBranch.id,
          code: toBranch.code,
          name: toBranch.name,
        },
        range: {
          start: startCertNumber,
          end: endCertNumber,
        },
        count: certificates.length,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Get Stock Alerts ─────────────────────────────────────────────────────

  static async getStockAlerts(adminId, threshold = 10) {
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const headBranch = await BranchModel.findById(admin.branch_id);
    if (!headBranch || !headBranch.is_head_branch) {
      throw new Error("Only head branch admins can view stock alerts");
    }

    const allBranches = [headBranch];
    const subBranches = await BranchModel.findSubBranches(headBranch.id, {
      includeInactive: false,
    });
    allBranches.push(...subBranches);

    const certAlerts = [];
    const medalAlerts = [];
    let totalCertInStock = 0;
    let totalMedalStock = 0;

    for (const branch of allBranches) {
      // ── Certificate alerts ──
      const certStock = await CertificateModel.getStockCount(branch.id);
      const inStockCount = parseInt(certStock.in_stock, 10);
      totalCertInStock += inStockCount;

      const certSeverity = this._getSeverity(inStockCount, threshold);
      if (certSeverity) {
        certAlerts.push({
          branch_id: branch.id,
          branch_code: branch.code,
          branch_name: branch.name,
          is_head_branch: branch.is_head_branch,
          stock: {
            in_stock: inStockCount,
            reserved: parseInt(certStock.reserved, 10),
            printed: parseInt(certStock.printed, 10),
            total: parseInt(certStock.total, 10),
          },
          severity: certSeverity,
          message: this._getCertAlertMessage(branch, inStockCount),
        });
      }

      // ── Medal alerts ──
      const medalStock = await MedalStockModel.findByBranch(branch.id);
      const medalCount = medalStock ? medalStock.quantity : 0;
      totalMedalStock += medalCount;

      const medalSeverity = this._getSeverity(medalCount, threshold);
      if (medalSeverity) {
        medalAlerts.push({
          branch_id: branch.id,
          branch_code: branch.code,
          branch_name: branch.name,
          is_head_branch: branch.is_head_branch,
          medal_stock: medalCount,
          severity: medalSeverity,
          message: this._getMedalAlertMessage(branch, medalCount),
        });
      }
    }

    const severityOrder = { critical: 1, high: 2, medium: 3 };
    certAlerts.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );
    medalAlerts.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    return {
      certificate_alerts: certAlerts,
      medal_alerts: medalAlerts,
      summary: {
        total_cert_alerts: certAlerts.length,
        total_medal_alerts: medalAlerts.length,
        cert_critical: certAlerts.filter((a) => a.severity === "critical")
          .length,
        cert_high: certAlerts.filter((a) => a.severity === "high").length,
        cert_medium: certAlerts.filter((a) => a.severity === "medium").length,
        medal_critical: medalAlerts.filter((a) => a.severity === "critical")
          .length,
        medal_high: medalAlerts.filter((a) => a.severity === "high").length,
        medal_medium: medalAlerts.filter((a) => a.severity === "medium").length,
        total_cert_in_stock: totalCertInStock,
        total_medal_stock: totalMedalStock,
        threshold,
      },
      head_branch: {
        id: headBranch.id,
        code: headBranch.code,
        name: headBranch.name,
      },
    };
  }

  // ─── Medal Stock Logs ─────────────────────────────────────────────────────

  static async getMedalLogs(
    adminId,
    { actionType, startDate, endDate, page = 1, limit = 20 } = {},
  ) {
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can view medal logs");
    }

    const offset = (page - 1) * limit;

    const logs = await MedalStockModel.findLogsByHeadBranch(branch.id, {
      actionType,
      startDate,
      endDate,
      limit,
      offset,
    });

    const total = await MedalStockModel.countLogsByHeadBranch(branch.id, {
      actionType,
    });

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  static _getSeverity(count, threshold) {
    if (count === 0) return "critical";
    if (count <= 5) return "high";
    if (count <= threshold) return "medium";
    return null;
  }

  static _getCertAlertMessage(branch, count) {
    const type = branch.is_head_branch ? "Head Branch" : "Sub Branch";
    if (count === 0)
      return `${type} ${branch.code} is OUT OF STOCK! Immediate action required.`;
    if (count <= 5)
      return `${type} ${branch.code} has only ${count} certificate(s) remaining.`;
    return `${type} ${branch.code} certificate stock is running low (${count}).`;
  }

  static _getMedalAlertMessage(branch, count) {
    const type = branch.is_head_branch ? "Head Branch" : "Sub Branch";
    if (count === 0)
      return `${type} ${branch.code} has NO medals! Prints will be blocked.`;
    if (count <= 5)
      return `${type} ${branch.code} has only ${count} medal(s) remaining.`;
    return `${type} ${branch.code} medal stock is running low (${count}).`;
  }
}

module.exports = CertificateService;

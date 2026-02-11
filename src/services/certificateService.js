const CertificateModel = require("../models/certificateModel");
const CertificateLogModel = require("../models/certificateLogModel");
const CertificateMigrationModel = require("../models/certificateMigrationModel");
const BranchModel = require("../models/branchModel");
const { getClient } = require("../config/database");

class CertificateService {
  /**
   * Format certificate number with zero padding
   * @param {number} num
   * @returns {string} e.g., "No. 000001"
   */
  static _formatCertificateNumber(num) {
    return `No. ${String(num).padStart(6, "0")}`;
  }

  /**
   * Parse certificate number to integer
   * @param {string} certNumber - e.g., "No. 000001"
   * @returns {number}
   */
  static _parseCertificateNumber(certNumber) {
    return parseInt(certNumber.replace(/\D/g, ""), 10);
  }

  /**
   * Bulk create certificates (Admin - Head Branch only)
   * @param {Object} data
   * @param {number} data.startNumber - e.g., 1
   * @param {number} data.endNumber - e.g., 50
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async bulkCreateCertificates({ startNumber, endNumber }, adminId) {
    // Get admin's branch
    const { query } = require("../config/database");
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Validate branch is head branch
    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can create certificates");
    }

    if (!branch.is_active) {
      throw new Error("Branch is inactive");
    }

    // Validate numbers
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

    // Check for duplicates
    const startCertNumber = this._formatCertificateNumber(startNumber);
    const endCertNumber = this._formatCertificateNumber(endNumber);

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

      // Generate certificates
      const certificates = [];
      for (let i = startNumber; i <= endNumber; i++) {
        certificates.push({
          certificate_number: this._formatCertificateNumber(i),
          head_branch_id: branch.id,
          current_branch_id: branch.id,
          created_by: adminId,
          medal_included: true,
        });
      }

      const created = await CertificateModel.bulkCreate(certificates, client);

      // Create log entry
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

  /**
   * Get certificates in head branch with filters
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getCertificates(
    adminId,
    { status, currentBranchId, page = 1, limit = 50 } = {},
  ) {
    const { query } = require("../config/database");
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

    const offset = (page - 1) * limit;

    const certificates = await CertificateModel.findByHeadBranch(branch.id, {
      status,
      currentBranchId,
      limit,
      offset,
    });

    // Get stock count
    const stockCount = await CertificateModel.getStockCount(branch.id);

    return {
      certificates,
      pagination: {
        page,
        limit,
        total: certificates.length,
      },
      stock: stockCount,
    };
  }

  /**
   * Get stock summary for all branches under head branch
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getStockSummary(adminId) {
    const { query } = require("../config/database");
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

    // Get head branch stock
    const headStock = await CertificateModel.getStockCount(headBranch.id);

    // Get sub branches stock
    const subBranches = await BranchModel.findSubBranches(headBranch.id, {
      includeInactive: false,
    });

    const subBranchStock = [];
    for (const subBranch of subBranches) {
      const stock = await CertificateModel.getStockCount(subBranch.id);
      subBranchStock.push({
        branch_id: subBranch.id,
        branch_code: subBranch.code,
        branch_name: subBranch.name,
        stock,
      });
    }

    return {
      head_branch: {
        id: headBranch.id,
        code: headBranch.code,
        name: headBranch.name,
        stock: headStock,
      },
      sub_branches: subBranchStock,
    };
  }

  /**
   * Migrate certificates to sub branch
   * @param {Object} data
   * @param {string} data.startNumber - e.g., "No. 000010"
   * @param {string} data.endNumber - e.g., "No. 000030"
   * @param {number} data.toBranchId
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async migrateCertificates(
    { startNumber, endNumber, toBranchId },
    adminId,
  ) {
    const { query } = require("../config/database");
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Validate source branch (head branch)
    const fromBranch = await BranchModel.findById(admin.branch_id);
    if (!fromBranch || !fromBranch.is_head_branch) {
      throw new Error("Only head branch admins can migrate certificates");
    }

    // Validate target branch (must be sub branch under same head)
    const toBranch = await BranchModel.findById(toBranchId);
    if (!toBranch) {
      throw new Error("Target branch not found");
    }

    if (toBranch.is_head_branch) {
      throw new Error("Cannot migrate to another head branch");
    }

    if (toBranch.parent_id !== fromBranch.id) {
      throw new Error("Target branch must be a sub branch of your head branch");
    }

    if (!toBranch.is_active) {
      throw new Error("Target branch is inactive");
    }

    // Get certificates in range
    const certificates = await CertificateModel.findByRange(
      startNumber,
      endNumber,
      fromBranch.id,
    );

    if (certificates.length === 0) {
      throw new Error(
        `No certificates found in range ${startNumber} to ${endNumber}`,
      );
    }

    // Validate all certificates are in_stock
    const nonStockCerts = certificates.filter((c) => c.status !== "in_stock");
    if (nonStockCerts.length > 0) {
      throw new Error(
        `Cannot migrate: ${nonStockCerts.length} certificate(s) are not in stock status`,
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Update certificate locations
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

      // Create migration records
      await CertificateMigrationModel.bulkCreate(migrations, client);

      // Create log entry
      await CertificateLogModel.create(
        {
          action_type: "migrate",
          actor_id: adminId,
          actor_role: admin.role,
          from_branch_id: fromBranch.id,
          to_branch_id: toBranchId,
          metadata: {
            start_number: startNumber,
            end_number: endNumber,
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
          start: startNumber,
          end: endNumber,
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

  // src/services/certificateService.js

  /**
   * Get stock alerts for branches with low inventory
   * @param {number} adminId
   * @param {number} threshold - Default 10 certificates
   * @returns {Promise<Object>}
   */
  static async getStockAlerts(adminId, threshold = 10) {
    const { query } = require("../config/database");

    // Get admin's branch
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Validate head branch
    const headBranch = await BranchModel.findById(admin.branch_id);
    if (!headBranch || !headBranch.is_head_branch) {
      throw new Error("Only head branch admins can view stock alerts");
    }

    // Get all branches (head + subs)
    const allBranches = [headBranch];
    const subBranches = await BranchModel.findSubBranches(headBranch.id, {
      includeInactive: false,
    });
    allBranches.push(...subBranches);

    // Check stock for each branch
    const alerts = [];
    let totalInStock = 0;

    for (const branch of allBranches) {
      const stock = await CertificateModel.getStockCount(branch.id);
      const inStockCount = parseInt(stock.in_stock, 10);
      totalInStock += inStockCount;

      // Determine severity
      let severity = null;
      if (inStockCount === 0) {
        severity = "critical"; // Out of stock
      } else if (inStockCount <= 5) {
        severity = "high"; // Very low
      } else if (inStockCount <= threshold) {
        severity = "medium"; // Low
      }

      if (severity) {
        alerts.push({
          branch_id: branch.id,
          branch_code: branch.code,
          branch_name: branch.name,
          is_head_branch: branch.is_head_branch,
          stock: {
            in_stock: inStockCount,
            reserved: parseInt(stock.reserved, 10),
            printed: parseInt(stock.printed, 10),
            total: parseInt(stock.total, 10),
          },
          severity,
          message: this._getAlertMessage(branch, inStockCount),
        });
      }
    }

    // Sort by severity (critical > high > medium)
    const severityOrder = { critical: 1, high: 2, medium: 3 };
    alerts.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
    );

    return {
      alerts,
      summary: {
        total_alerts: alerts.length,
        critical_count: alerts.filter((a) => a.severity === "critical").length,
        high_count: alerts.filter((a) => a.severity === "high").length,
        medium_count: alerts.filter((a) => a.severity === "medium").length,
        total_in_stock: totalInStock,
        threshold,
      },
      head_branch: {
        id: headBranch.id,
        code: headBranch.code,
        name: headBranch.name,
      },
    };
  }

  /**
   * Helper: Generate alert message based on stock level
   * @private
   */
  static _getAlertMessage(branch, inStockCount) {
    const branchType = branch.is_head_branch ? "Head Branch" : "Sub Branch";

    if (inStockCount === 0) {
      return `${branchType} ${branch.code} is OUT OF STOCK! Immediate action required.`;
    } else if (inStockCount <= 5) {
      return `${branchType} ${branch.code} has only ${inStockCount} certificate(s) remaining. Please restock soon.`;
    } else {
      return `${branchType} ${branch.code} stock is running low (${inStockCount} certificates).`;
    }
  }
}

module.exports = CertificateService;

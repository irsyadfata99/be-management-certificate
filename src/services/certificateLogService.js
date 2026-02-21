const { query, pool } = require("../config/database");
const CertificateLogModel = require("../models/certificateLogModel");
const CertificateMigrationModel = require("../models/certificateMigrationModel");
const ExcelJS = require("exceljs");

class CertificateLogService {
  static async _getAdminContext(adminId) {
    const result = await query("SELECT branch_id, role FROM users WHERE id = $1", [adminId]);
    const admin = result.rows[0];

    if (!admin) throw new Error("User not found");

    const isSuperAdmin = admin.role === "superAdmin";
    if (!isSuperAdmin && !admin.branch_id) throw new Error("Admin does not have an assigned branch");

    return { isSuperAdmin, branchId: admin.branch_id };
  }

  static _buildLogFilters({ headBranchId = null, actionType, actorId, startDate, endDate, certificateNumber } = {}, startIndex = 1) {
    const params = [];
    const clauses = [];
    let idx = startIndex;

    if (headBranchId !== null) {
      params.push(headBranchId, headBranchId, headBranchId);
      clauses.push(`(
        cl.from_branch_id IN (SELECT id FROM branches WHERE id = $${idx} OR parent_id = $${idx + 1})
        OR cl.to_branch_id IN (SELECT id FROM branches WHERE id = $${idx} OR parent_id = $${idx + 1})
        OR c.head_branch_id = $${idx + 2}
      )`);
      idx += 3;
    }

    if (actionType) {
      clauses.push(`cl.action_type = $${idx++}`);
      params.push(actionType);
    }
    if (actorId) {
      clauses.push(`cl.actor_id = $${idx++}`);
      params.push(actorId);
    }
    if (startDate) {
      clauses.push(`cl.created_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      clauses.push(`cl.created_at <= $${idx++}`);
      params.push(endDate);
    }
    if (certificateNumber) {
      clauses.push(`c.certificate_number ILIKE $${idx++}`);
      params.push(`%${certificateNumber}%`);
    }

    return { clauses, params, nextIdx: idx };
  }

  static _buildMigrationFilters({ headBranchId = null, startDate, endDate, fromBranchId, toBranchId } = {}, startIndex = 1) {
    const params = [];
    const clauses = [];
    let idx = startIndex;

    if (headBranchId !== null) {
      clauses.push(`c.head_branch_id = $${idx++}`);
      params.push(headBranchId);
    }

    if (startDate) {
      clauses.push(`cm.migrated_at >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      clauses.push(`cm.migrated_at <= $${idx++}`);
      params.push(endDate);
    }
    if (fromBranchId) {
      clauses.push(`cm.from_branch_id = $${idx++}`);
      params.push(fromBranchId);
    }
    if (toBranchId) {
      clauses.push(`cm.to_branch_id = $${idx++}`);
      params.push(toBranchId);
    }

    return { clauses, params, nextIdx: idx };
  }

  // ─── Admin Logs ───────────────────────────────────────────────────────────

  static async getAdminLogs(adminId, { actionType, actorId, startDate, endDate, certificateNumber, page = 1, limit = 20 } = {}) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);
    const offset = (page - 1) * limit;

    // FIX: superAdmin → headBranchId = null (tidak difilter per branch)
    //      admin biasa → headBranchId = branchId
    const { clauses, params, nextIdx } = this._buildLogFilters({
      headBranchId: isSuperAdmin ? null : branchId,
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
    });

    const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const logSql = `
      SELECT
        cl.id, cl.certificate_id, c.certificate_number,
        cl.action_type, cl.actor_id,
        u.username AS actor_username, u.full_name AS actor_name,
        cl.actor_role,
        cl.from_branch_id, fb.code AS from_branch_code, fb.name AS from_branch_name,
        cl.to_branch_id, tb.code AS to_branch_code, tb.name AS to_branch_name,
        cl.metadata, cl.created_at AS "createdAt"
      FROM certificate_logs cl
      LEFT JOIN certificates c ON cl.certificate_id = c.id
      JOIN users u ON cl.actor_id = u.id
      LEFT JOIN branches fb ON cl.from_branch_id = fb.id
      LEFT JOIN branches tb ON cl.to_branch_id = tb.id
      ${whereStr}
      ORDER BY cl.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    const countSql = `
      SELECT COUNT(*) FROM certificate_logs cl
      LEFT JOIN certificates c ON cl.certificate_id = c.id
      ${whereStr}
    `;

    const [logsResult, countResult] = await Promise.all([query(logSql, [...params, limit, offset]), query(countSql, params)]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      logs: logsResult.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Teacher Logs ─────────────────────────────────────────────────────────

  static async getTeacherLogs(teacherId, { startDate, endDate, certificateNumber, page = 1, limit = 20 } = {}) {
    const offset = (page - 1) * limit;

    const logs = await CertificateLogModel.findByTeacher(teacherId, {
      startDate,
      endDate,
      certificateNumber,
      limit,
      offset,
    });

    const total = await CertificateLogModel.countByTeacher(teacherId);

    return {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Export Admin Logs (Streaming) ────────────────────────────────────────

  static async exportAdminLogsToExcel(adminId, { actionType, actorId, startDate, endDate, certificateNumber } = {}, res) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    const { clauses, params } = this._buildLogFilters({
      headBranchId: isSuperAdmin ? null : branchId,
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
    });

    const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const cursorSql = `
      SELECT
        cl.id, c.certificate_number, cl.action_type,
        u.full_name AS actor_name, cl.actor_role,
        fb.code AS from_branch_code, fb.name AS from_branch_name,
        tb.code AS to_branch_code, tb.name AS to_branch_name,
        cl.metadata, cl.created_at
      FROM certificate_logs cl
      LEFT JOIN certificates c ON cl.certificate_id = c.id
      JOIN users u ON cl.actor_id = u.id
      LEFT JOIN branches fb ON cl.from_branch_id = fb.id
      LEFT JOIN branches tb ON cl.to_branch_id = tb.id
      ${whereStr}
      ORDER BY cl.created_at DESC
    `;

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const sheet = workbook.addWorksheet("Certificate Logs");

    sheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Certificate Number", key: "certificate_number", width: 20 },
      { header: "Action Type", key: "action_type", width: 15 },
      { header: "Actor", key: "actor_name", width: 25 },
      { header: "Actor Role", key: "actor_role", width: 15 },
      { header: "Student Name", key: "student_name", width: 30 },
      { header: "Module", key: "module_name", width: 30 },
      { header: "PTC Date", key: "ptc_date", width: 15 },
      { header: "From Branch", key: "from_branch", width: 22 },
      { header: "To Branch", key: "to_branch", width: 22 },
      { header: "Date & Time", key: "createdAt", width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    headerRow.commit();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DECLARE log_cursor CURSOR FOR ${cursorSql}`, params);

      while (true) {
        const batch = await client.query("FETCH 500 FROM log_cursor");
        if (batch.rows.length === 0) break;

        for (const log of batch.rows) {
          const metadata = log.metadata || {};
          const row = sheet.addRow({
            id: log.id,
            certificate_number: log.certificate_number || "N/A",
            action_type: log.action_type,
            actor_name: log.actor_name,
            actor_role: log.actor_role,
            student_name: metadata.student_name || "N/A",
            module_name: metadata.module_name || "N/A",
            ptc_date: metadata.ptc_date || "N/A",
            from_branch: log.from_branch_name ? `${log.from_branch_code} - ${log.from_branch_name}` : "N/A",
            to_branch: log.to_branch_name ? `${log.to_branch_code} - ${log.to_branch_name}` : "N/A",
            createdAt: new Date(log.created_at).toLocaleString("id-ID"),
          });
          row.commit();
        }
      }

      await client.query("CLOSE log_cursor");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await workbook.commit();
  }

  // ─── Export Teacher Logs (Streaming) ──────────────────────────────────────

  static async exportTeacherLogsToExcel(teacherId, { startDate, endDate, certificateNumber, studentName, moduleId } = {}, res) {
    const whereClauses = ["cp.teacher_id = $1"];
    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      whereClauses.push(`cp.ptc_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`cp.ptc_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (certificateNumber) {
      whereClauses.push(`c.certificate_number ILIKE $${paramIndex++}`);
      params.push(`%${certificateNumber}%`);
    }
    if (studentName) {
      whereClauses.push(`(s.name ILIKE $${paramIndex} OR cp.student_name ILIKE $${paramIndex})`);
      params.push(`%${studentName}%`);
      paramIndex++;
    }
    if (moduleId) {
      whereClauses.push(`cp.module_id = $${paramIndex++}`);
      params.push(moduleId);
    }

    const whereStr = whereClauses.join(" AND ");

    const cursorSql = `
      SELECT
        cp.id, c.certificate_number,
        COALESCE(s.name, cp.student_name) AS student_name,
        m.module_code, m.name AS module_name,
        cp.ptc_date, cp.is_reprint,
        b.code AS branch_code, b.name AS branch_name,
        cp.printed_at
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      LEFT JOIN students s ON cp.student_id = s.id
      JOIN modules m ON cp.module_id = m.id
      JOIN branches b ON cp.branch_id = b.id
      WHERE ${whereStr}
      ORDER BY cp.printed_at DESC
    `;

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
    const sheet = workbook.addWorksheet("My Print History");

    sheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Certificate Number", key: "certificate_number", width: 20 },
      { header: "Student Name", key: "student_name", width: 30 },
      { header: "Module Code", key: "module_code", width: 15 },
      { header: "Module Name", key: "module_name", width: 30 },
      { header: "PTC Date", key: "ptc_date", width: 15 },
      { header: "Is Reprint", key: "is_reprint", width: 12 },
      { header: "Branch", key: "branch", width: 25 },
      { header: "Printed At", key: "printed_at", width: 22 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    headerRow.commit();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DECLARE print_cursor CURSOR FOR ${cursorSql}`, params);

      while (true) {
        const batch = await client.query("FETCH 500 FROM print_cursor");
        if (batch.rows.length === 0) break;

        for (const print of batch.rows) {
          const row = sheet.addRow({
            id: print.id,
            certificate_number: print.certificate_number,
            student_name: print.student_name || "N/A",
            module_code: print.module_code,
            module_name: print.module_name,
            ptc_date: print.ptc_date ? new Date(print.ptc_date).toLocaleDateString("id-ID") : "N/A",
            is_reprint: print.is_reprint ? "Ya" : "Tidak",
            branch: `${print.branch_code} - ${print.branch_name}`,
            printed_at: new Date(print.printed_at).toLocaleString("id-ID"),
          });
          row.commit();
        }
      }

      await client.query("CLOSE print_cursor");
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    await workbook.commit();
  }

  // ─── Print Statistics ─────────────────────────────────────────────────────

  static async getPrintStatistics(adminId, { startDate, endDate } = {}) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    const params = [];
    const clauses = [];
    let idx = 1;

    if (!isSuperAdmin) {
      clauses.push(`c.head_branch_id = $${idx++}`);
      params.push(branchId);
    }

    if (startDate) {
      clauses.push(`cp.ptc_date >= $${idx++}`);
      params.push(startDate);
    }
    if (endDate) {
      clauses.push(`cp.ptc_date <= $${idx++}`);
      params.push(endDate);
    }

    const certJoin = isSuperAdmin ? "" : `JOIN certificates c ON cp.certificate_id = c.id`;

    const whereBase = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const studentClauses = [...clauses, "cp.student_id IS NOT NULL"];
    const whereStudent = `WHERE ${studentClauses.join(" AND ")}`;

    const [statsResult, byBranchResult, byModuleResult, byStudentResult] = await Promise.all([
      query(
        `SELECT
             COUNT(*) AS total_prints,
             COUNT(DISTINCT cp.student_id) AS unique_students,
             COUNT(DISTINCT cp.teacher_id) AS unique_teachers,
             COUNT(DISTINCT cp.module_id) AS unique_modules
           FROM certificate_prints cp
           ${certJoin}
           ${whereBase}`,
        params,
      ),
      query(
        `SELECT b.id, b.code AS branch_code, b.name AS branch_name, COUNT(*) AS count
           FROM certificate_prints cp
           ${certJoin}
           JOIN branches b ON cp.branch_id = b.id
           ${whereBase}
           GROUP BY b.id, b.code, b.name
           ORDER BY count DESC`,
        params,
      ),
      query(
        `SELECT m.id, m.module_code, m.name AS module_name, COUNT(*) AS count
           FROM certificate_prints cp
           ${certJoin}
           JOIN modules m ON cp.module_id = m.id
           ${whereBase}
           GROUP BY m.id, m.module_code, m.name
           ORDER BY count DESC`,
        params,
      ),
      query(
        `SELECT s.id, s.name AS student_name, COUNT(*) AS certificate_count
           FROM certificate_prints cp
           ${certJoin}
           JOIN students s ON cp.student_id = s.id
           ${whereStudent}
           GROUP BY s.id, s.name
           ORDER BY certificate_count DESC
           LIMIT 10`,
        params,
      ),
    ]);

    return {
      summary: {
        total_prints: parseInt(statsResult.rows[0].total_prints, 10),
        unique_students: parseInt(statsResult.rows[0].unique_students, 10),
        unique_teachers: parseInt(statsResult.rows[0].unique_teachers, 10),
        unique_modules: parseInt(statsResult.rows[0].unique_modules, 10),
      },
      by_branch: byBranchResult.rows.map((r) => ({
        branch_id: r.id,
        branch_code: r.branch_code,
        branch_name: r.branch_name,
        count: parseInt(r.count, 10),
      })),
      by_module: byModuleResult.rows.map((r) => ({
        module_id: r.id,
        module_code: r.module_code,
        module_name: r.module_name,
        count: parseInt(r.count, 10),
      })),
      by_student: byStudentResult.rows.map((r) => ({
        student_id: r.id,
        student_name: r.student_name,
        certificate_count: parseInt(r.certificate_count, 10),
      })),
    };
  }

  // ─── Migration History ────────────────────────────────────────────────────

  static async getMigrationHistory(adminId, { startDate, endDate, fromBranchId, toBranchId, page = 1, limit = 20 } = {}) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);
    const offset = (page - 1) * limit;

    // FIX: Hilangkan duplikasi blok if (isSuperAdmin) dengan _buildMigrationFilters
    const { clauses, params, nextIdx } = this._buildMigrationFilters({
      headBranchId: isSuperAdmin ? null : branchId,
      startDate,
      endDate,
      fromBranchId,
      toBranchId,
    });

    const whereStr = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const migrationSql = `
      SELECT
        cm.id, cm.certificate_id, c.certificate_number,
        cm.from_branch_id, fb.code AS from_branch_code, fb.name AS from_branch_name,
        cm.to_branch_id, tb.code AS to_branch_code, tb.name AS to_branch_name,
        cm.migrated_by, u.username AS migrated_by_username, u.full_name AS migrated_by_name,
        cm.migrated_at, cm.created_at AS "createdAt"
      FROM certificate_migrations cm
      JOIN certificates c ON cm.certificate_id = c.id
      JOIN branches fb ON cm.from_branch_id = fb.id
      JOIN branches tb ON cm.to_branch_id = tb.id
      JOIN users u ON cm.migrated_by = u.id
      ${whereStr}
      ORDER BY cm.migrated_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}
    `;

    const countSql = `
      SELECT COUNT(*) FROM certificate_migrations cm
      JOIN certificates c ON cm.certificate_id = c.id
      ${whereStr}
    `;

    const [migrationsResult, countResult] = await Promise.all([query(migrationSql, [...params, limit, offset]), query(countSql, params)]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      migrations: migrationsResult.rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = CertificateLogService;

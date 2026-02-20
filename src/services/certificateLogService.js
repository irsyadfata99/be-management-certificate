const { query, pool } = require("../config/database");
const CertificateLogModel = require("../models/certificateLogModel");
const CertificatePrintModel = require("../models/certificatePrintModel");
const CertificateMigrationModel = require("../models/certificateMigrationModel");
const ExcelJS = require("exceljs");

class CertificateLogService {
  static async _getAdminContext(adminId) {
    const result = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = result.rows[0];

    if (!admin) throw new Error("User not found");

    const isSuperAdmin = admin.role === "superAdmin";
    if (!isSuperAdmin && !admin.branch_id)
      throw new Error("Admin does not have an assigned branch");

    return { isSuperAdmin, branchId: admin.branch_id };
  }

  static async getAdminLogs(
    adminId,
    {
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
      page = 1,
      limit = 20,
    } = {},
  ) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    const offset = (page - 1) * limit;

    if (isSuperAdmin) {
      let sql = `
        SELECT
          cl.id,
          cl.certificate_id,
          c.certificate_number,
          cl.action_type,
          cl.actor_id,
          u.username AS actor_username,
          u.full_name AS actor_name,
          cl.actor_role,
          cl.from_branch_id,
          fb.code AS from_branch_code,
          fb.name AS from_branch_name,
          cl.to_branch_id,
          tb.code AS to_branch_code,
          tb.name AS to_branch_name,
          cl.metadata,
          cl.created_at AS "createdAt"
        FROM certificate_logs cl
        LEFT JOIN certificates c ON cl.certificate_id = c.id
        JOIN users u ON cl.actor_id = u.id
        LEFT JOIN branches fb ON cl.from_branch_id = fb.id
        LEFT JOIN branches tb ON cl.to_branch_id = tb.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (actionType) {
        sql += ` AND cl.action_type = $${paramIndex++}`;
        params.push(actionType);
      }
      if (actorId) {
        sql += ` AND cl.actor_id = $${paramIndex++}`;
        params.push(actorId);
      }
      if (startDate) {
        sql += ` AND cl.created_at >= $${paramIndex++}`;
        params.push(startDate);
      }
      if (endDate) {
        sql += ` AND cl.created_at <= $${paramIndex++}`;
        params.push(endDate);
      }
      if (certificateNumber) {
        sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
        params.push(`%${certificateNumber}%`);
      }

      sql += ` ORDER BY cl.created_at DESC`;
      sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const logsResult = await query(sql, params);

      let countSql = `
        SELECT COUNT(*) FROM certificate_logs cl
        LEFT JOIN certificates c ON cl.certificate_id = c.id
        WHERE 1=1
      `;
      const countParams = [];
      let countIndex = 1;

      if (actionType) {
        countSql += ` AND cl.action_type = $${countIndex++}`;
        countParams.push(actionType);
      }
      if (actorId) {
        countSql += ` AND cl.actor_id = $${countIndex++}`;
        countParams.push(actorId);
      }
      if (startDate) {
        countSql += ` AND cl.created_at >= $${countIndex++}`;
        countParams.push(startDate);
      }
      if (endDate) {
        countSql += ` AND cl.created_at <= $${countIndex++}`;
        countParams.push(endDate);
      }
      if (certificateNumber) {
        countSql += ` AND c.certificate_number ILIKE $${countIndex++}`;
        countParams.push(`%${certificateNumber}%`);
      }

      const countResult = await query(countSql, countParams);
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

    const logs = await CertificateLogModel.findByHeadBranch(branchId, {
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
      limit,
      offset,
    });

    const total = await CertificateLogModel.countByHeadBranch(branchId, {
      actionType,
      actorId,
    });

    return {
      logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  static async getTeacherLogs(
    teacherId,
    { startDate, endDate, certificateNumber, page = 1, limit = 20 } = {},
  ) {
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
  //
  // CHANGELOG [excel-streaming]:
  //   Sebelumnya: query LIMIT 100000 → simpan semua di RAM → writeBuffer()
  //   Sekarang:   PostgreSQL cursor → baca 500 baris per batch → stream ke response
  //
  // Cara penggunaan di controller:
  //   res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  //   res.setHeader('Content-Disposition', 'attachment; filename="certificate-logs.xlsx"');
  //   await CertificateLogService.exportAdminLogsToExcel(adminId, filters, res);
  //
  // Parameter `res` adalah Express Response object.
  // Function ini menulis langsung ke stream, tidak return buffer.

  static async exportAdminLogsToExcel(
    adminId,
    { actionType, actorId, startDate, endDate, certificateNumber } = {},
    res,
  ) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    // Build WHERE clause dan params
    const whereClauses = ["1=1"];
    const params = [];
    let paramIndex = 1;

    if (!isSuperAdmin) {
      // Filter by head branch via JOIN ke certificates
      // Ditangani di cursor SQL di bawah — branchId di-pass sebagai param pertama
    }

    if (actionType) {
      whereClauses.push(`cl.action_type = $${paramIndex++}`);
      params.push(actionType);
    }
    if (actorId) {
      whereClauses.push(`cl.actor_id = $${paramIndex++}`);
      params.push(actorId);
    }
    if (startDate) {
      whereClauses.push(`cl.created_at >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      whereClauses.push(`cl.created_at <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (certificateNumber) {
      whereClauses.push(`c.certificate_number ILIKE $${paramIndex++}`);
      params.push(`%${certificateNumber}%`);
    }

    const whereStr = whereClauses.join(" AND ");

    // Base query — berbeda antara superAdmin dan admin biasa
    let cursorSql;
    if (isSuperAdmin) {
      cursorSql = `
        SELECT
          cl.id, c.certificate_number, cl.action_type,
          u.full_name AS actor_name, cl.actor_role,
          fb.code AS from_branch_code, fb.name AS from_branch_name,
          tb.code AS to_branch_code,  tb.name AS to_branch_name,
          cl.metadata, cl.created_at
        FROM certificate_logs cl
        LEFT JOIN certificates c ON cl.certificate_id = c.id
        JOIN users u ON cl.actor_id = u.id
        LEFT JOIN branches fb ON cl.from_branch_id = fb.id
        LEFT JOIN branches tb ON cl.to_branch_id = tb.id
        WHERE ${whereStr}
        ORDER BY cl.created_at DESC
      `;
    } else {
      // Admin biasa: filter berdasarkan head_branch_id
      // branchId di-inject langsung (tidak lewat params cursor karena
      // DECLARE CURSOR tidak support parameterized query di semua PG versi)
      cursorSql = `
        SELECT
          cl.id, c.certificate_number, cl.action_type,
          u.full_name AS actor_name, cl.actor_role,
          fb.code AS from_branch_code, fb.name AS from_branch_name,
          tb.code AS to_branch_code,  tb.name AS to_branch_name,
          cl.metadata, cl.created_at
        FROM certificate_logs cl
        LEFT JOIN certificates c ON cl.certificate_id = c.id
        JOIN users u ON cl.actor_id = u.id
        LEFT JOIN branches fb ON cl.from_branch_id = fb.id
        LEFT JOIN branches tb ON cl.to_branch_id = tb.id
        WHERE (c.head_branch_id = ${parseInt(branchId, 10)} OR cl.to_branch_id = ${parseInt(branchId, 10)})
          AND ${whereStr}
        ORDER BY cl.created_at DESC
      `;
    }

    // Setup streaming workbook — tulis langsung ke response stream
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

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };
    headerRow.commit();

    // Stream dari DB menggunakan cursor — tidak load semua data ke RAM
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DECLARE log_cursor CURSOR FOR ${cursorSql}`, params);

      let hasMore = true;
      while (hasMore) {
        const batch = await client.query("FETCH 500 FROM log_cursor");

        if (batch.rows.length === 0) {
          hasMore = false;
          break;
        }

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
            from_branch: log.from_branch_name
              ? `${log.from_branch_code} - ${log.from_branch_name}`
              : "N/A",
            to_branch: log.to_branch_name
              ? `${log.to_branch_code} - ${log.to_branch_name}`
              : "N/A",
            createdAt: new Date(log.created_at).toLocaleString("id-ID"),
          });
          // .commit() penting untuk streaming — flush baris ke response segera
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

    // Finalisasi workbook — flush sisa data ke stream dan tutup
    await workbook.commit();
  }

  // ─── Export Teacher Logs (Streaming) ──────────────────────────────────────
  //
  // CHANGELOG [excel-streaming]:
  //   Sama seperti exportAdminLogsToExcel — diganti ke streaming mode.
  //   Parameter `res` adalah Express Response object.

  static async exportTeacherLogsToExcel(
    teacherId,
    { startDate, endDate, certificateNumber, studentName, moduleId } = {},
    res,
  ) {
    // Build WHERE clause
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
      whereClauses.push(
        `(s.name ILIKE $${paramIndex} OR cp.student_name ILIKE $${paramIndex})`,
      );
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
      await client.query(
        `DECLARE print_cursor CURSOR FOR ${cursorSql}`,
        params,
      );

      let hasMore = true;
      while (hasMore) {
        const batch = await client.query("FETCH 500 FROM print_cursor");

        if (batch.rows.length === 0) {
          hasMore = false;
          break;
        }

        for (const print of batch.rows) {
          const row = sheet.addRow({
            id: print.id,
            certificate_number: print.certificate_number,
            student_name: print.student_name || "N/A",
            module_code: print.module_code,
            module_name: print.module_name,
            ptc_date: print.ptc_date
              ? new Date(print.ptc_date).toLocaleDateString("id-ID")
              : "N/A",
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

  static async getPrintStatistics(adminId, { startDate, endDate } = {}) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    let dateFilter = "";
    const params = [];
    let paramIndex = 1;

    if (startDate) {
      dateFilter += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (isSuperAdmin) {
      const statsResult = await query(
        `SELECT
           COUNT(*) AS total_prints,
           COUNT(DISTINCT cp.student_id) AS unique_students,
           COUNT(DISTINCT cp.teacher_id) AS unique_teachers,
           COUNT(DISTINCT cp.module_id) AS unique_modules
         FROM certificate_prints cp
         WHERE 1=1 ${dateFilter}`,
        params,
      );

      const byBranchResult = await query(
        `SELECT b.id, b.code AS branch_code, b.name AS branch_name, COUNT(*) AS count
         FROM certificate_prints cp
         JOIN branches b ON cp.branch_id = b.id
         WHERE 1=1 ${dateFilter}
         GROUP BY b.id, b.code, b.name
         ORDER BY count DESC`,
        params,
      );

      const byModuleResult = await query(
        `SELECT m.id, m.module_code, m.name AS module_name, COUNT(*) AS count
         FROM certificate_prints cp
         JOIN modules m ON cp.module_id = m.id
         WHERE 1=1 ${dateFilter}
         GROUP BY m.id, m.module_code, m.name
         ORDER BY count DESC`,
        params,
      );

      const byStudentResult = await query(
        `SELECT s.id, s.name AS student_name, COUNT(*) AS certificate_count
         FROM certificate_prints cp
         JOIN students s ON cp.student_id = s.id
         WHERE cp.student_id IS NOT NULL ${dateFilter}
         GROUP BY s.id, s.name
         ORDER BY certificate_count DESC
         LIMIT 10`,
        params,
      );

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

    params.unshift(branchId);
    paramIndex++;

    const statsResult = await query(
      `SELECT
         COUNT(*) AS total_prints,
         COUNT(DISTINCT cp.student_id) AS unique_students,
         COUNT(DISTINCT cp.teacher_id) AS unique_teachers,
         COUNT(DISTINCT cp.module_id) AS unique_modules
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE c.head_branch_id = $1 ${dateFilter}`,
      params,
    );

    const byBranchResult = await query(
      `SELECT b.id, b.code AS branch_code, b.name AS branch_name, COUNT(*) AS count
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN branches b ON cp.branch_id = b.id
       WHERE c.head_branch_id = $1 ${dateFilter}
       GROUP BY b.id, b.code, b.name
       ORDER BY count DESC`,
      params,
    );

    const byModuleResult = await query(
      `SELECT m.id, m.module_code, m.name AS module_name, COUNT(*) AS count
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN modules m ON cp.module_id = m.id
       WHERE c.head_branch_id = $1 ${dateFilter}
       GROUP BY m.id, m.module_code, m.name
       ORDER BY count DESC`,
      params,
    );

    const byStudentResult = await query(
      `SELECT s.id, s.name AS student_name, COUNT(*) AS certificate_count
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       LEFT JOIN students s ON cp.student_id = s.id
       WHERE c.head_branch_id = $1
           AND cp.student_id IS NOT NULL
           ${dateFilter}
       GROUP BY s.id, s.name
       ORDER BY certificate_count DESC
       LIMIT 10`,
      params,
    );

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

  static async getMigrationHistory(
    adminId,
    { startDate, endDate, fromBranchId, toBranchId, page = 1, limit = 20 } = {},
  ) {
    const { isSuperAdmin, branchId } = await this._getAdminContext(adminId);

    const offset = (page - 1) * limit;

    if (isSuperAdmin) {
      let sql = `
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
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (startDate) {
        sql += ` AND cm.migrated_at >= $${paramIndex++}`;
        params.push(startDate);
      }
      if (endDate) {
        sql += ` AND cm.migrated_at <= $${paramIndex++}`;
        params.push(endDate);
      }
      if (fromBranchId) {
        sql += ` AND cm.from_branch_id = $${paramIndex++}`;
        params.push(fromBranchId);
      }
      if (toBranchId) {
        sql += ` AND cm.to_branch_id = $${paramIndex++}`;
        params.push(toBranchId);
      }

      sql += ` ORDER BY cm.migrated_at DESC`;
      sql += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
      params.push(limit, offset);

      const migrationsResult = await query(sql, params);

      let countSql = `SELECT COUNT(*) FROM certificate_migrations cm WHERE 1=1`;
      const countParams = [];
      let countIndex = 1;

      if (startDate) {
        countSql += ` AND cm.migrated_at >= $${countIndex++}`;
        countParams.push(startDate);
      }
      if (endDate) {
        countSql += ` AND cm.migrated_at <= $${countIndex++}`;
        countParams.push(endDate);
      }
      if (fromBranchId) {
        countSql += ` AND cm.from_branch_id = $${countIndex++}`;
        countParams.push(fromBranchId);
      }
      if (toBranchId) {
        countSql += ` AND cm.to_branch_id = $${countIndex++}`;
        countParams.push(toBranchId);
      }

      const countResult = await query(countSql, countParams);
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

    const migrations = await CertificateMigrationModel.findByHeadBranch(
      branchId,
      {
        startDate,
        endDate,
        fromBranchId,
        toBranchId,
        limit,
        offset,
      },
    );

    const total = await CertificateMigrationModel.countByHeadBranch(branchId);

    return {
      migrations,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }
}

module.exports = CertificateLogService;

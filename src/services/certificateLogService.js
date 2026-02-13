const CertificateLogModel = require("../models/certificateLogModel");
const CertificatePrintModel = require("../models/certificatePrintModel");
const CertificateMigrationModel = require("../models/certificateMigrationModel");
const ExcelJS = require("exceljs");

class CertificateLogService {
  /**
   * Get logs for admin (all logs in head branch)
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getAdminLogs(
    adminId,
    {
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
      page = 1,
      limit = 50,
    } = {},
  ) {
    const { query } = require("../config/database");

    // Get admin's head branch and role
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin) {
      throw new Error("User not found");
    }

    // ✅ FIX: SuperAdmin tidak butuh branch_id, return empty logs
    if (admin.role === "superAdmin") {
      return {
        logs: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
        },
      };
    }

    // ✅ FIX: Admin biasa harus punya branch_id
    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const offset = (page - 1) * limit;

    const logs = await CertificateLogModel.findByHeadBranch(admin.branch_id, {
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
      limit,
      offset,
    });

    const total = await CertificateLogModel.countByHeadBranch(admin.branch_id, {
      actionType,
      actorId,
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

  /**
   * Get logs for teacher (own prints only)
   * @param {number} teacherId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
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
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Export admin logs to Excel
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Buffer>} Excel file buffer
   */
  static async exportAdminLogsToExcel(
    adminId,
    { actionType, actorId, startDate, endDate, certificateNumber } = {},
  ) {
    const { query } = require("../config/database");

    // Get admin's head branch and role
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin) {
      throw new Error("User not found");
    }

    // ✅ FIX: SuperAdmin return empty Excel
    if (admin.role === "superAdmin") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Certificate Logs");
      worksheet.columns = [{ header: "No Data", key: "message", width: 30 }];
      worksheet.addRow({ message: "No logs available for Super Admin" });
      const buffer = await workbook.xlsx.writeBuffer();
      return buffer;
    }

    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Get all logs without pagination
    const logs = await CertificateLogModel.findByHeadBranch(admin.branch_id, {
      actionType,
      actorId,
      startDate,
      endDate,
      certificateNumber,
      limit: 100000, // Large limit for export
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Certificate Logs");

    // Set column headers
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Certificate Number", key: "certificate_number", width: 20 },
      { header: "Action Type", key: "action_type", width: 15 },
      { header: "Actor", key: "actor_name", width: 25 },
      { header: "Actor Role", key: "actor_role", width: 15 },
      { header: "Student Name", key: "student_name", width: 30 },
      { header: "Module", key: "module_name", width: 30 },
      { header: "PTC Date", key: "ptc_date", width: 15 },
      { header: "From Branch", key: "from_branch", width: 20 },
      { header: "To Branch", key: "to_branch", width: 20 },
      { header: "Date & Time", key: "createdAt", width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    // Add data rows
    logs.forEach((log) => {
      const metadata = log.metadata || {};
      worksheet.addRow({
        id: log.id,
        certificate_number: log.certificate_number || "N/A",
        action_type: log.action_type,
        actor_name: log.actor_name || log.actor_username,
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
        createdAt: new Date(log.createdAt).toLocaleString("id-ID"),
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Export teacher logs to Excel
   * @param {number} teacherId
   * @param {Object} filters
   * @returns {Promise<Buffer>} Excel file buffer
   */
  static async exportTeacherLogsToExcel(
    teacherId,
    { startDate, endDate, certificateNumber, studentName, moduleId } = {},
  ) {
    const { query } = require("../config/database");

    // Get teacher's print history with filters
    let sql = `
      SELECT
        cp.id,
        c.certificate_number,
        s.name AS student_name,
        cp.student_name AS legacy_student_name,
        m.module_code,
        m.name AS module_name,
        cp.ptc_date,
        b.code AS branch_code,
        b.name AS branch_name,
        cp.printed_at
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      LEFT JOIN students s ON cp.student_id = s.id
      JOIN modules m ON cp.module_id = m.id
      JOIN branches b ON cp.branch_id = b.id
      WHERE cp.teacher_id = $1
    `;

    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (certificateNumber) {
      sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
      params.push(`%${certificateNumber}%`);
    }

    if (studentName) {
      sql += ` AND (s.name ILIKE $${paramIndex++} OR cp.student_name ILIKE $${paramIndex - 1})`;
      params.push(`%${studentName}%`);
    }

    if (moduleId) {
      sql += ` AND cp.module_id = $${paramIndex++}`;
      params.push(moduleId);
    }

    sql += ` ORDER BY cp.printed_at DESC LIMIT 100000`;

    const result = await query(sql, params);
    const prints = result.rows;

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("My Print History");

    // Set column headers
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Certificate Number", key: "certificate_number", width: 20 },
      { header: "Student Name", key: "student_name", width: 30 },
      { header: "Module Code", key: "module_code", width: 15 },
      { header: "Module Name", key: "module_name", width: 30 },
      { header: "PTC Date", key: "ptc_date", width: 15 },
      { header: "Branch", key: "branch", width: 25 },
      { header: "Printed At", key: "printed_at", width: 20 },
    ];

    // Style header row
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFD3D3D3" },
    };

    // Add data rows
    prints.forEach((print) => {
      worksheet.addRow({
        id: print.id,
        certificate_number: print.certificate_number,
        student_name: print.student_name || print.legacy_student_name || "N/A",
        module_code: print.module_code,
        module_name: print.module_name,
        ptc_date: print.ptc_date
          ? new Date(print.ptc_date).toLocaleDateString("id-ID")
          : "N/A",
        branch: `${print.branch_code} - ${print.branch_name}`,
        printed_at: new Date(print.printed_at).toLocaleString("id-ID"),
      });
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  }

  /**
   * Get print statistics for admin
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getPrintStatistics(adminId, { startDate, endDate } = {}) {
    const { query } = require("../config/database");

    // Get admin's head branch and role
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin) {
      throw new Error("User not found");
    }

    // ✅ FIX: SuperAdmin return empty statistics
    if (admin.role === "superAdmin") {
      return {
        summary: {
          total_prints: 0,
          unique_students: 0,
          unique_teachers: 0,
          unique_modules: 0,
        },
        by_branch: [],
        by_module: [],
        by_student: [],
      };
    }

    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Build filter conditions
    let dateFilter = "";
    const params = [admin.branch_id];
    let paramIndex = 2;

    if (startDate) {
      dateFilter += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      dateFilter += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    // Get print statistics
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

    // Group by branch
    const byBranchResult = await query(
      `SELECT
         b.id,
         b.code AS branch_code,
         b.name AS branch_name,
         COUNT(*) AS count
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN branches b ON cp.branch_id = b.id
       WHERE c.head_branch_id = $1 ${dateFilter}
       GROUP BY b.id, b.code, b.name
       ORDER BY count DESC`,
      params,
    );

    // Group by module
    const byModuleResult = await query(
      `SELECT
         m.id,
         m.module_code,
         m.name AS module_name,
         COUNT(*) AS count
       FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       JOIN modules m ON cp.module_id = m.id
       WHERE c.head_branch_id = $1 ${dateFilter}
       GROUP BY m.id, m.module_code, m.name
       ORDER BY count DESC`,
      params,
    );

    // Group by student (top 10)
    const byStudentResult = await query(
      `SELECT
         s.id,
         s.name AS student_name,
         COUNT(*) AS certificate_count
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

  /**
   * Get migration history for admin
   * @param {number} adminId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getMigrationHistory(
    adminId,
    { startDate, endDate, fromBranchId, toBranchId, page = 1, limit = 50 } = {},
  ) {
    const { query } = require("../config/database");

    // Get admin's head branch and role
    const adminResult = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin) {
      throw new Error("User not found");
    }

    // ✅ FIX: SuperAdmin return empty migrations
    if (admin.role === "superAdmin") {
      return {
        migrations: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
        },
      };
    }

    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const offset = (page - 1) * limit;

    const migrations = await CertificateMigrationModel.findByHeadBranch(
      admin.branch_id,
      {
        startDate,
        endDate,
        fromBranchId,
        toBranchId,
        limit,
        offset,
      },
    );

    const total = await CertificateMigrationModel.countByHeadBranch(
      admin.branch_id,
    );

    return {
      migrations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = CertificateLogService;

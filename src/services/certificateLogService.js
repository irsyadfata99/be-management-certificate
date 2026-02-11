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

    // Get admin's head branch
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
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

    // Get admin's head branch
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
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
      { header: "From Branch", key: "from_branch", width: 20 },
      { header: "To Branch", key: "to_branch", width: 20 },
      { header: "Metadata", key: "metadata", width: 40 },
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
      worksheet.addRow({
        id: log.id,
        certificate_number: log.certificate_number || "N/A",
        action_type: log.action_type,
        actor_name: log.actor_name || log.actor_username,
        actor_role: log.actor_role,
        from_branch: log.from_branch_name
          ? `${log.from_branch_code} - ${log.from_branch_name}`
          : "N/A",
        to_branch: log.to_branch_name
          ? `${log.to_branch_code} - ${log.to_branch_name}`
          : "N/A",
        metadata: log.metadata ? JSON.stringify(log.metadata) : "",
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
    { startDate, endDate, certificateNumber } = {},
  ) {
    // Get all teacher logs
    const logs = await CertificateLogModel.findByTeacher(teacherId, {
      startDate,
      endDate,
      certificateNumber,
      limit: 100000,
    });

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("My Print History");

    // Set column headers
    worksheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Certificate Number", key: "certificate_number", width: 20 },
      { header: "Action Type", key: "action_type", width: 15 },
      { header: "Branch", key: "branch", width: 20 },
      { header: "Student Name", key: "student_name", width: 30 },
      { header: "Module", key: "module", width: 30 },
      { header: "PTC Date", key: "ptc_date", width: 15 },
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
        branch: log.to_branch_name
          ? `${log.to_branch_code} - ${log.to_branch_name}`
          : "N/A",
        student_name: metadata.student_name || "N/A",
        module: metadata.module_name || "N/A",
        ptc_date: metadata.ptc_date || "N/A",
        createdAt: new Date(log.createdAt).toLocaleString("id-ID"),
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

    // Get admin's head branch
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Get print statistics
    const prints = await CertificatePrintModel.findByHeadBranch(
      admin.branch_id,
      {
        startDate,
        endDate,
        limit: 100000,
      },
    );

    // Calculate statistics
    const totalPrints = prints.length;
    const uniqueStudents = new Set(prints.map((p) => p.student_name)).size;
    const uniqueTeachers = new Set(prints.map((p) => p.teacher_id)).size;

    // Group by branch
    const byBranch = {};
    prints.forEach((p) => {
      const key = p.branch_id;
      if (!byBranch[key]) {
        byBranch[key] = {
          branch_code: p.branch_code,
          branch_name: p.branch_name,
          count: 0,
        };
      }
      byBranch[key].count++;
    });

    // Group by module
    const byModule = {};
    prints.forEach((p) => {
      const key = p.module_id;
      if (!byModule[key]) {
        byModule[key] = {
          module_code: p.module_code,
          module_name: p.module_name,
          count: 0,
        };
      }
      byModule[key].count++;
    });

    return {
      summary: {
        total_prints: totalPrints,
        unique_students: uniqueStudents,
        unique_teachers: uniqueTeachers,
      },
      by_branch: Object.values(byBranch),
      by_module: Object.values(byModule),
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

    // Get admin's head branch
    const adminResult = await query(
      "SELECT branch_id FROM users WHERE id = $1",
      [adminId],
    );
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
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

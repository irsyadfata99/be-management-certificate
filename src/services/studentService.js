const StudentModel = require("../models/studentModel");
const BranchModel = require("../models/branchModel");
const { getClient, query } = require("../config/database");
const PaginationHelper = require("../utils/paginationHelper");

class StudentService {
  /**
   * Get admin's head branch ID
   * SuperAdmin returns null to get ALL branches
   * @param {number} userId
   * @returns {Promise<number|null>}
   */
  static async _getHeadBranchId(userId) {
    const result = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [userId],
    );
    const user = result.rows[0];

    if (!user) {
      throw new Error("User not found");
    }

    // SuperAdmin can access ALL branches
    if (user.role === "superAdmin") {
      return null;
    }

    if (!user.branch_id) {
      throw new Error("User does not have an assigned branch");
    }

    // For admin, branch_id is always head branch
    // For teacher, we need to find the head branch
    if (user.role === "admin") {
      return user.branch_id;
    }

    // For teacher, get head branch
    const branch = await BranchModel.findById(user.branch_id);
    if (!branch) {
      throw new Error("Branch not found");
    }

    return branch.is_head_branch ? branch.id : branch.parent_id;
  }

  /**
   * Search students (autocomplete)
   * @param {number} userId
   * @param {string} searchTerm
   * @returns {Promise<Array>}
   */
  static async searchStudents(userId, searchTerm) {
    if (!searchTerm || searchTerm.trim().length < 2) {
      return [];
    }

    const headBranchId = await this._getHeadBranchId(userId);

    // SuperAdmin: Search across ALL branches
    if (headBranchId === null) {
      const result = await query(
        `SELECT 
           s.id,
           s.name,
           s.head_branch_id,
           b.code AS head_branch_code,
           b.name AS head_branch_name
         FROM students s
         JOIN branches b ON s.head_branch_id = b.id
         WHERE s.is_active = true
           AND s.name ILIKE $1
         ORDER BY s.name ASC
         LIMIT 20`,
        [`%${searchTerm.trim()}%`],
      );

      return result.rows.map((s) => ({
        id: s.id,
        name: s.name,
        head_branch_id: s.head_branch_id,
        head_branch_code: s.head_branch_code,
        head_branch_name: s.head_branch_name,
      }));
    }

    // Regular user: Search within head branch
    const students = await StudentModel.searchByName(
      headBranchId,
      searchTerm.trim(),
      20,
    );

    return students.map((s) => ({
      id: s.id,
      name: s.name,
      head_branch_id: s.head_branch_id,
      head_branch_code: s.head_branch_code,
    }));
  }

  /**
   * Get all students (with pagination)
   * @param {number} userId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getAllStudents(
    userId,
    { search = null, page = 1, limit = 20, includeInactive = false } = {},
  ) {
    const headBranchId = await this._getHeadBranchId(userId);
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    // SuperAdmin: Get students from ALL branches
    if (headBranchId === null) {
      let sql = `
        SELECT
          s.id,
          s.name,
          s.head_branch_id,
          b.code AS head_branch_code,
          b.name AS head_branch_name,
          s.is_active,
          s."createdAt",
          s."updatedAt"
        FROM students s
        JOIN branches b ON s.head_branch_id = b.id
        WHERE 1=1
      `;
      const params = [];
      let paramIndex = 1;

      if (!includeInactive) {
        sql += ` AND s.is_active = true`;
      }

      if (search) {
        sql += ` AND s.name ILIKE $${paramIndex++}`;
        params.push(`%${search}%`);
      }

      sql += ` ORDER BY s.name ASC`;

      if (l) {
        sql += ` LIMIT $${paramIndex++}`;
        params.push(l);
      }

      if (offset) {
        sql += ` OFFSET $${paramIndex++}`;
        params.push(offset);
      }

      const result = await query(sql, params);

      // Count total
      let countSql = `SELECT COUNT(*) FROM students s WHERE 1=1`;
      const countParams = [];
      let countIndex = 1;

      if (!includeInactive) {
        countSql += ` AND s.is_active = true`;
      }

      if (search) {
        countSql += ` AND s.name ILIKE $${countIndex++}`;
        countParams.push(`%${search}%`);
      }

      const countResult = await query(countSql, countParams);
      const total = parseInt(countResult.rows[0].count, 10);

      return {
        students: result.rows,
        pagination: PaginationHelper.buildResponse(p, l, total),
      };
    }

    // Regular user: Get students within head branch
    const students = await StudentModel.findByHeadBranch(headBranchId, {
      includeInactive,
      search,
      limit: l,
      offset,
    });

    const total = await StudentModel.countByHeadBranch(headBranchId, {
      search,
    });

    return {
      students,
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  /**
   * Get student by ID
   * @param {number} studentId
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  static async getStudentById(studentId, userId) {
    const headBranchId = await this._getHeadBranchId(userId);
    const student = await StudentModel.findById(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    // SuperAdmin can access any student
    if (headBranchId === null) {
      return student;
    }

    // Regular user: Check head branch match
    if (student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return student;
  }

  /**
   * Get student's certificate print history
   * @param {number} studentId
   * @param {number} userId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getStudentHistory(
    studentId,
    userId,
    { startDate, endDate, page = 1, limit = 20 } = {},
  ) {
    const headBranchId = await this._getHeadBranchId(userId);
    const student = await StudentModel.findById(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    // SuperAdmin can access any student
    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    const history = await StudentModel.getPrintHistory(studentId, {
      startDate,
      endDate,
      limit: l,
      offset,
    });

    const statistics = await StudentModel.getStatistics(studentId);

    return {
      student: {
        id: student.id,
        name: student.name,
        head_branch_code: student.head_branch_code,
        head_branch_name: student.head_branch_name,
      },
      history,
      statistics: {
        total_certificates: parseInt(statistics.total_certificates, 10),
        unique_modules: parseInt(statistics.unique_modules, 10),
        first_ptc_date: statistics.first_ptc_date,
        latest_ptc_date: statistics.latest_ptc_date,
      },
      pagination: PaginationHelper.buildResponse(p, l, history.length),
    };
  }

  /**
   * Create or get existing student
   * Used internally when printing certificate
   * @param {string} studentName
   * @param {number} headBranchId
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async createOrGetStudent(studentName, headBranchId, client = null) {
    // Try to find existing student
    const existing = await StudentModel.findByNameAndBranch(
      studentName,
      headBranchId,
    );

    if (existing) {
      return existing;
    }

    // Create new student
    return StudentModel.create(
      {
        name: studentName.trim(),
        head_branch_id: headBranchId,
      },
      client,
    );
  }

  /**
   * Update student name (Admin only)
   * @param {number} studentId
   * @param {string} newName
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateStudent(studentId, newName, adminId) {
    const headBranchId = await this._getHeadBranchId(adminId);
    const student = await StudentModel.findById(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    // SuperAdmin can update any student
    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    // Check if new name already exists in the same branch
    if (newName.trim().toUpperCase() !== student.name.toUpperCase()) {
      const existing = await StudentModel.findByNameAndBranch(
        newName,
        student.head_branch_id,
      );
      if (existing) {
        throw new Error("Student with this name already exists");
      }
    }

    return StudentModel.update(studentId, newName);
  }

  /**
   * Toggle student active status (Admin only)
   * @param {number} studentId
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleStudentActive(studentId, adminId) {
    const headBranchId = await this._getHeadBranchId(adminId);
    const student = await StudentModel.findById(studentId);

    if (!student) {
      throw new Error("Student not found");
    }

    // SuperAdmin can toggle any student
    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return StudentModel.toggleActive(studentId);
  }

  /**
   * Get student statistics for teacher/admin
   * @param {number} userId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getStudentStatistics(
    userId,
    { startDate, endDate, moduleId } = {},
  ) {
    const headBranchId = await this._getHeadBranchId(userId);

    // SuperAdmin: Get statistics from ALL branches
    if (headBranchId === null) {
      let sql = `
        SELECT
          COUNT(DISTINCT cp.student_id) AS total_students,
          COUNT(*) AS total_prints,
          COUNT(DISTINCT cp.module_id) AS unique_modules
        FROM certificate_prints cp
        WHERE cp.student_id IS NOT NULL
      `;
      const params = [];
      let paramIndex = 1;

      if (startDate) {
        sql += ` AND cp.ptc_date >= $${paramIndex++}`;
        params.push(startDate);
      }

      if (endDate) {
        sql += ` AND cp.ptc_date <= $${paramIndex++}`;
        params.push(endDate);
      }

      if (moduleId) {
        sql += ` AND cp.module_id = $${paramIndex++}`;
        params.push(moduleId);
      }

      const result = await query(sql, params);

      return {
        total_students: parseInt(result.rows[0].total_students, 10),
        total_prints: parseInt(result.rows[0].total_prints, 10),
        unique_modules: parseInt(result.rows[0].unique_modules, 10),
      };
    }

    // Regular user: Get statistics within head branch
    let sql = `
      SELECT
        COUNT(DISTINCT cp.student_id) AS total_students,
        COUNT(*) AS total_prints,
        COUNT(DISTINCT cp.module_id) AS unique_modules
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      WHERE c.head_branch_id = $1
        AND cp.student_id IS NOT NULL
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (moduleId) {
      sql += ` AND cp.module_id = $${paramIndex++}`;
      params.push(moduleId);
    }

    const result = await query(sql, params);

    return {
      total_students: parseInt(result.rows[0].total_students, 10),
      total_prints: parseInt(result.rows[0].total_prints, 10),
      unique_modules: parseInt(result.rows[0].unique_modules, 10),
    };
  }
}

module.exports = StudentService;

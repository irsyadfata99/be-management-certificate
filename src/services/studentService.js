const StudentModel = require("../models/studentModel");
const BranchModel = require("../models/branchModel");
const { getClient } = require("../config/database");

class StudentService {
  /**
   * Create or get existing student by name.
   * Digunakan saat teacher melakukan print certificate.
   * Jika student sudah ada dengan nama yang sama di head branch yang sama, return yang existing.
   * Jika belum ada, create baru.
   *
   * FIXED: Pass head_branch_id to StudentModel.create()
   *
   * @param {string} studentName
   * @param {number} headBranchId
   * @param {Object} client - Optional DB transaction client
   * @returns {Promise<Object>} student record
   */
  static async createOrGetStudent(studentName, headBranchId, client = null) {
    if (!studentName || studentName.trim().length === 0) {
      throw new Error("Student name is required");
    }

    if (!headBranchId) {
      throw new Error("Head branch ID is required");
    }

    const trimmedName = studentName.trim();

    // Check if student already exists
    const existing = await StudentModel.findByNameAndBranch(
      trimmedName,
      headBranchId,
    );

    if (existing) {
      return existing;
    }

    // Create new student with head_branch_id
    const newStudent = await StudentModel.create(
      {
        name: trimmedName,
        head_branch_id: headBranchId,
      },
      client,
    );

    return newStudent;
  }

  /**
   * Search students by name (for autocomplete/dropdown).
   * Admin hanya bisa search students dari head branch-nya sendiri.
   *
   * @param {string} searchTerm
   * @param {number} adminId
   * @returns {Promise<Array>}
   */
  static async searchStudents(searchTerm, adminId) {
    const { query } = require("../config/database");

    // Get admin's head branch
    const adminResult = await query(
      `SELECT u.branch_id, b.is_head_branch, b.parent_id
       FROM users u
       JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [adminId],
    );

    const admin = adminResult.rows[0];
    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const headBranchId = admin.is_head_branch
      ? admin.branch_id
      : admin.parent_id;

    // Search students
    const students = await StudentModel.searchByName(searchTerm, headBranchId, {
      limit: 50,
      offset: 0,
    });

    return students.map((s) => ({
      id: s.id,
      name: s.name,
      head_branch_id: s.head_branch_id,
      head_branch_code: s.head_branch_code,
      head_branch_name: s.head_branch_name,
    }));
  }

  /**
   * Get all students in admin's head branch.
   * Alias: getAllStudents → getStudentsByHeadBranch
   *
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getAllStudents(
    adminId,
    { page = 1, limit = 50, search = null, includeInactive = false } = {},
  ) {
    return this.getStudentsByHeadBranch(adminId, {
      page,
      limit,
      searchTerm: search,
      includeInactive,
    });
  }

  /**
   * Get all students in admin's head branch.
   *
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getStudentsByHeadBranch(
    adminId,
    { page = 1, limit = 50, searchTerm = null, includeInactive = false } = {},
  ) {
    const { query } = require("../config/database");

    // Get admin's head branch
    const adminResult = await query(
      `SELECT u.branch_id, b.is_head_branch, b.parent_id
       FROM users u
       JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [adminId],
    );

    const admin = adminResult.rows[0];
    if (!admin || !admin.branch_id) {
      throw new Error("User does not have an assigned branch");
    }

    const headBranchId = admin.is_head_branch
      ? admin.branch_id
      : admin.parent_id;

    const offset = (page - 1) * limit;

    let students;
    if (searchTerm) {
      students = await StudentModel.searchByName(searchTerm, headBranchId, {
        limit,
        offset,
      });
    } else {
      students = await StudentModel.findByHeadBranch(headBranchId, {
        limit,
        offset,
        includeInactive,
      });
    }

    const total = await StudentModel.countByHeadBranch(headBranchId);

    return {
      students: students.map((s) => ({
        id: s.id,
        name: s.name,
        head_branch_id: s.head_branch_id,
        head_branch_code: s.head_branch_code,
        head_branch_name: s.head_branch_name,
        is_active: s.is_active,
        created_at: s.created_at,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get student by ID (with permission check).
   *
   * @param {number} studentId
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getStudentById(studentId, adminId) {
    const { query } = require("../config/database");

    const student = await StudentModel.findById(studentId);
    if (!student) {
      throw new Error("Student not found");
    }

    // Verify admin has access to this student's head branch
    const adminResult = await query(
      `SELECT u.branch_id, b.is_head_branch, b.parent_id
       FROM users u
       JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [adminId],
    );

    const admin = adminResult.rows[0];
    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const headBranchId = admin.is_head_branch
      ? admin.branch_id
      : admin.parent_id;

    if (student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return student;
  }

  /**
   * Update student.
   *
   * @param {number} studentId
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateStudent(studentId, data, adminId) {
    // Verify access first
    await this.getStudentById(studentId, adminId);

    const updated = await StudentModel.update(studentId, data);

    return {
      id: updated.id,
      name: updated.name,
      head_branch_id: updated.head_branch_id,
      is_active: updated.is_active,
      updated_at: updated.updated_at,
    };
  }

  /**
   * Delete (soft delete) student.
   *
   * @param {number} studentId
   * @param {number} adminId
   * @returns {Promise<void>}
   */
  static async deleteStudent(studentId, adminId) {
    // Verify access first
    await this.getStudentById(studentId, adminId);

    await StudentModel.delete(studentId);
  }

  /**
   * Toggle student active status.
   *
   * @param {number} studentId
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleStudentActive(studentId, adminId) {
    await this.getStudentById(studentId, adminId);
    return StudentModel.toggleActive(studentId);
  }

  /**
   * Get student statistics for admin's head branch.
   *
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getStudentStatistics(adminId) {
    const { query } = require("../config/database");

    // Get admin's head branch
    const adminResult = await query(
      `SELECT u.branch_id, b.is_head_branch, b.parent_id
       FROM users u
       JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [adminId],
    );

    const admin = adminResult.rows[0];
    if (!admin || !admin.branch_id) {
      throw new Error("User does not have an assigned branch");
    }

    const headBranchId = admin.is_head_branch
      ? admin.branch_id
      : admin.parent_id;

    const stats = await StudentModel.getStatistics(headBranchId);

    return {
      head_branch_id: headBranchId,
      statistics: stats,
    };
  }
}

module.exports = StudentService;

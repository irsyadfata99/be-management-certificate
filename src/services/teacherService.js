const TeacherModel = require("../models/teacherModel");
const BranchModel = require("../models/branchModel");
const DivisionModel = require("../models/divisionModel");
const { getClient } = require("../config/database");
const { query } = require("../config/database");
const crypto = require("crypto");
const PaginationHelper = require("../utils/paginationHelper");

class TeacherService {
  /**
   * Generate random password
   * @returns {string}
   */
  static _generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from(
      { length: 10 },
      () => chars[crypto.randomInt(0, chars.length)],
    ).join("");
  }

  /**
   * Validate that all branch IDs belong to the same head branch as admin
   * @param {number[]} branchIds
   * @param {number} adminHeadBranchId
   * @returns {Promise<void>}
   */
  static async _validateBranches(branchIds, adminHeadBranchId) {
    for (const branchId of branchIds) {
      const branch = await BranchModel.findById(branchId);
      if (!branch) throw new Error(`Branch ID ${branchId} not found`);
      if (!branch.is_active)
        throw new Error(`Branch ${branch.code} is inactive`);

      // Must be the head branch itself or a sub-branch of it
      const isHeadBranch = branch.id === adminHeadBranchId;
      const isSubOfHead = branch.parent_id === adminHeadBranchId;

      if (!isHeadBranch && !isSubOfHead) {
        throw new Error(
          `Branch ${branch.code} does not belong to your head branch`,
        );
      }
    }
  }

  /**
   * Validate that all division IDs are owned by admin
   * @param {number[]} divisionIds
   * @param {number} adminId
   * @returns {Promise<void>}
   */
  static async _validateDivisions(divisionIds, adminId) {
    for (const divisionId of divisionIds) {
      const division = await DivisionModel.findById(divisionId);
      if (!division) throw new Error(`Division ID ${divisionId} not found`);
      if (division.created_by !== adminId) {
        throw new Error(`Division ID ${divisionId} does not belong to you`);
      }
      if (!division.is_active)
        throw new Error(`Division ID ${divisionId} is inactive`);
    }
  }

  /**
   * Get admin's head branch ID
   * @param {number} adminId
   * @returns {Promise<number>}
   */
  static async _getAdminHeadBranchId(adminId) {
    const result = await query(
      "SELECT branch_id FROM users WHERE id = $1 AND role = 'admin'",
      [adminId],
    );
    const admin = result.rows[0];
    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }
    return admin.branch_id;
  }

  /**
   * Get all teachers under admin's head branch with pagination
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getAllTeachers(
    adminId,
    { includeInactive = false, page = 1, limit = 50 } = {},
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    const teachers = await TeacherModel.findAllByHeadBranch(headBranchId, {
      includeInactive,
      limit: l,
      offset,
    });

    const total = await TeacherModel.countByHeadBranch(headBranchId, {
      includeInactive,
    });

    return {
      teachers,
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  /**
   * Get teacher by ID (validates admin scope)
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getTeacherById(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    // Verify teacher belongs to admin's head branch scope
    const teacherBranchIds = teacher.branches.map((b) => b.branch_id);
    const validBranch = teacherBranchIds.some(async (bId) => {
      const b = await BranchModel.findById(bId);
      return b && (b.id === headBranchId || b.parent_id === headBranchId);
    });

    // Simple check: teacher's primary branch_id must be within scope
    const primaryBranch = await BranchModel.findById(teacher.branch_id);
    if (!primaryBranch) throw new Error("Teacher branch not found");
    if (
      primaryBranch.id !== headBranchId &&
      primaryBranch.parent_id !== headBranchId
    ) {
      throw new Error("Access denied");
    }

    return teacher;
  }

  /**
   * Create teacher
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async createTeacher(
    { username, full_name, branch_ids, division_ids },
    adminId,
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);

    // Validate username uniqueness
    const existing = await query("SELECT id FROM users WHERE username = $1", [
      username,
    ]);
    if (existing.rows[0]) throw new Error("Username already exists");

    // Validate branches
    if (!branch_ids || branch_ids.length === 0) {
      throw new Error("At least one branch is required");
    }
    await this._validateBranches(branch_ids, headBranchId);

    // Validate divisions
    if (!division_ids || division_ids.length === 0) {
      throw new Error("At least one division is required");
    }
    await this._validateDivisions(division_ids, adminId);

    const generatedPassword = this._generatePassword();

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Primary branch_id = first branch in list (the head branch or first sub)
      const teacher = await TeacherModel.create(
        {
          username: username.trim(),
          full_name: full_name.trim(),
          password: generatedPassword,
          branch_id: branch_ids[0],
        },
        client,
      );

      await TeacherModel.setBranches(teacher.id, branch_ids, client);
      await TeacherModel.setDivisions(teacher.id, division_ids, client);

      await client.query("COMMIT");

      return {
        teacher,
        temporaryPassword: generatedPassword,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update teacher profile (username, full_name, branch_ids, division_ids)
   * @param {number} id
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateTeacher(
    id,
    { username, full_name, branch_ids, division_ids },
    adminId,
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    // Scope check
    const primaryBranch = await BranchModel.findById(teacher.branch_id);
    if (
      !primaryBranch ||
      (primaryBranch.id !== headBranchId &&
        primaryBranch.parent_id !== headBranchId)
    ) {
      throw new Error("Access denied");
    }

    // Username uniqueness
    if (username && username.trim() !== teacher.username) {
      const existing = await query("SELECT id FROM users WHERE username = $1", [
        username.trim(),
      ]);
      if (existing.rows[0]) throw new Error("Username already exists");
    }

    // Validate new branches
    if (branch_ids !== undefined) {
      if (branch_ids.length === 0)
        throw new Error("At least one branch is required");
      await this._validateBranches(branch_ids, headBranchId);
    }

    // Validate new divisions
    if (division_ids !== undefined) {
      if (division_ids.length === 0)
        throw new Error("At least one division is required");
      await this._validateDivisions(division_ids, adminId);
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updateData = {};
      if (username) updateData.username = username.trim();
      if (full_name) updateData.full_name = full_name.trim();
      if (branch_ids) updateData.branch_id = branch_ids[0];

      if (Object.keys(updateData).length > 0) {
        await TeacherModel.update(id, updateData, client);
      }
      if (branch_ids) await TeacherModel.setBranches(id, branch_ids, client);
      if (division_ids)
        await TeacherModel.setDivisions(id, division_ids, client);

      await client.query("COMMIT");

      return TeacherModel.findById(id);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset teacher password (admin action)
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async resetTeacherPassword(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    const primaryBranch = await BranchModel.findById(teacher.branch_id);
    if (
      !primaryBranch ||
      (primaryBranch.id !== headBranchId &&
        primaryBranch.parent_id !== headBranchId)
    ) {
      throw new Error("Access denied");
    }

    const newPassword = this._generatePassword();
    await TeacherModel.updatePassword(id, newPassword);

    return { temporaryPassword: newPassword };
  }

  /**
   * Toggle teacher active status
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleTeacherActive(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    const primaryBranch = await BranchModel.findById(teacher.branch_id);
    if (
      !primaryBranch ||
      (primaryBranch.id !== headBranchId &&
        primaryBranch.parent_id !== headBranchId)
    ) {
      throw new Error("Access denied");
    }

    return TeacherModel.toggleActive(id);
  }
}

module.exports = TeacherService;

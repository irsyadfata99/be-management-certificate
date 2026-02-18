const TeacherModel = require("../models/teacherModel");
const BranchModel = require("../models/branchModel");
const DivisionModel = require("../models/divisionModel");
const { getClient } = require("../config/database");
const { query } = require("../config/database");
const crypto = require("crypto");
const PaginationHelper = require("../utils/paginationHelper");

class TeacherService {
  static _generatePassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from({ length: 10 }, () => chars[crypto.randomInt(0, chars.length)]).join("");
  }

  static async _validateBranches(branchIds, adminHeadBranchId) {
    for (const branchId of branchIds) {
      const branch = await BranchModel.findById(branchId);
      if (!branch) throw new Error(`Branch ID ${branchId} not found`);
      if (!branch.is_active) throw new Error(`Branch ${branch.code} is inactive`);

      const isHeadBranch = branch.id === adminHeadBranchId;
      const isSubOfHead = branch.parent_id === adminHeadBranchId;

      if (!isHeadBranch && !isSubOfHead) {
        throw new Error(`Branch ${branch.code} does not belong to your head branch`);
      }
    }
  }

  static async _validateDivisions(divisionIds, adminId) {
    for (const divisionId of divisionIds) {
      const division = await DivisionModel.findById(divisionId);
      if (!division) throw new Error(`Division ID ${divisionId} not found`);
      if (division.created_by !== adminId) {
        throw new Error(`Division ID ${divisionId} does not belong to you`);
      }
      if (!division.is_active) throw new Error(`Division ID ${divisionId} is inactive`);
    }
  }

  /**
   * Resolve head branch ID dari admin/superAdmin.
   * SuperAdmin: kembalikan null sebagai sinyal "akses semua branch".
   *
   * @param {number} adminId
   * @returns {Promise<number|null>}
   */
  static async _getAdminHeadBranchId(adminId) {
    const result = await query("SELECT branch_id, role FROM users WHERE id = $1", [adminId]);
    const admin = result.rows[0];

    if (!admin) {
      throw new Error("Admin does not have an assigned branch");
    }

    if (admin.role === "superAdmin") return null;

    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    return admin.branch_id;
  }

  /**
   * Get all teachers.
   * SuperAdmin: lihat semua teacher dari semua branch.
   * Admin: hanya teacher di bawah head branch-nya.
   */
  static async getAllTeachers(adminId, { includeInactive = false, search = "", branchId = null, divisionId = null, page = 1, limit = 50 } = {}) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const { page: p, limit: l, offset } = PaginationHelper.fromQuery({ page, limit });

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    conditions.push("u.role = 'teacher'");

    if (!includeInactive) {
      conditions.push("u.is_active = true");
    }

    if (search && search.trim()) {
      conditions.push(`(u.username ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    const parsedBranchId = branchId ? parseInt(branchId, 10) : null;
    if (parsedBranchId && !isNaN(parsedBranchId)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM teacher_branches tb 
        WHERE tb.teacher_id = u.id AND tb.branch_id = $${paramIndex}
      )`);
      params.push(parsedBranchId);
      paramIndex++;
    }

    const parsedDivisionId = divisionId ? parseInt(divisionId, 10) : null;
    if (parsedDivisionId && !isNaN(parsedDivisionId)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM teacher_divisions td 
        WHERE td.teacher_id = u.id AND td.division_id = $${paramIndex}
      )`);
      params.push(parsedDivisionId);
      paramIndex++;
    }

    const baseSelect = `
      SELECT
        u.id, u.username, u.full_name, u.role, u.is_active,
        u.branch_id, b.code AS head_branch_code, b.name AS head_branch_name,
        u.created_at AS "createdAt", u.updated_at AS "updatedAt",
        COALESCE(
          (SELECT array_agg(tb.branch_id ORDER BY tb.branch_id) 
           FROM teacher_branches tb 
           WHERE tb.teacher_id = u.id),
          ARRAY[]::integer[]
        ) AS branch_ids,
        COALESCE(
          (SELECT array_agg(td.division_id ORDER BY td.division_id) 
           FROM teacher_divisions td 
           WHERE td.teacher_id = u.id),
          ARRAY[]::integer[]
        ) AS division_ids
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;

    if (headBranchId === null) {
      // SuperAdmin: akses semua
      const whereClause = conditions.join(" AND ");
      params.push(l, offset);

      const teachersResult = await query(`${baseSelect} WHERE ${whereClause} ORDER BY u.full_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, params);

      const countParams = params.slice(0, -2);
      const countResult = await query(`SELECT COUNT(*) FROM users u WHERE ${whereClause}`, countParams);

      return {
        teachers: teachersResult.rows,
        pagination: PaginationHelper.buildResponse(p, l, parseInt(countResult.rows[0].count, 10)),
      };
    }

    // Admin biasa: scope ke head branch
    conditions.push(`(
      u.branch_id = $${paramIndex}
      OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $${paramIndex})
    )`);
    params.push(headBranchId);
    paramIndex++;

    const whereClause = conditions.join(" AND ");
    params.push(l, offset);

    const teachersResult = await query(`${baseSelect} WHERE ${whereClause} ORDER BY u.full_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`, params);

    const countParams = params.slice(0, -2);
    const countResult = await query(`SELECT COUNT(*) FROM users u WHERE ${whereClause}`, countParams);

    return {
      teachers: teachersResult.rows,
      pagination: PaginationHelper.buildResponse(p, l, parseInt(countResult.rows[0].count, 10)),
    };
  }

  /**
   * Get teacher by ID.
   * SuperAdmin: bisa akses teacher manapun.
   * Admin: hanya teacher di bawah head branch-nya.
   */
  static async getTeacherById(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId === null) return teacher;

    const primaryBranch = await BranchModel.findById(teacher.branch_id);
    if (!primaryBranch) throw new Error("Teacher branch not found");
    if (primaryBranch.id !== headBranchId && primaryBranch.parent_id !== headBranchId) {
      throw new Error("Access denied");
    }

    return teacher;
  }

  /**
   * Create teacher.
   */
  static async createTeacher({ username, full_name, branch_ids, division_ids }, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);

    const existing = await query("SELECT id FROM users WHERE username = $1", [username]);
    if (existing.rows[0]) throw new Error("Username already exists");

    if (!branch_ids || branch_ids.length === 0) {
      throw new Error("At least one branch is required");
    }

    if (!division_ids || division_ids.length === 0) {
      throw new Error("At least one division is required");
    }

    if (headBranchId === null) {
      for (const branchId of branch_ids) {
        const branch = await BranchModel.findById(branchId);
        if (!branch) throw new Error(`Branch ID ${branchId} not found`);
        if (!branch.is_active) throw new Error(`Branch ${branch.code} is inactive`);
      }
      for (const divisionId of division_ids) {
        const division = await DivisionModel.findById(divisionId);
        if (!division) throw new Error(`Division ID ${divisionId} not found`);
        if (!division.is_active) throw new Error(`Division ID ${divisionId} is inactive`);
      }
    } else {
      await this._validateBranches(branch_ids, headBranchId);
      await this._validateDivisions(division_ids, adminId);
    }

    const generatedPassword = this._generatePassword();

    const client = await getClient();
    try {
      await client.query("BEGIN");

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

      return { teacher, temporaryPassword: generatedPassword };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update teacher.
   */
  static async updateTeacher(id, { username, full_name, branch_ids, division_ids }, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (!primaryBranch || (primaryBranch.id !== headBranchId && primaryBranch.parent_id !== headBranchId)) {
        throw new Error("Access denied");
      }
    }

    if (username && username.trim() !== teacher.username) {
      const existing = await query("SELECT id FROM users WHERE username = $1", [username.trim()]);
      if (existing.rows[0]) throw new Error("Username already exists");
    }

    if (branch_ids !== undefined) {
      if (branch_ids.length === 0) throw new Error("At least one branch is required");

      if (headBranchId === null) {
        for (const branchId of branch_ids) {
          const branch = await BranchModel.findById(branchId);
          if (!branch) throw new Error(`Branch ID ${branchId} not found`);
          if (!branch.is_active) throw new Error(`Branch ${branch.code} is inactive`);
        }
      } else {
        await this._validateBranches(branch_ids, headBranchId);
      }
    }

    if (division_ids !== undefined) {
      if (division_ids.length === 0) throw new Error("At least one division is required");

      if (headBranchId === null) {
        for (const divisionId of division_ids) {
          const division = await DivisionModel.findById(divisionId);
          if (!division) throw new Error(`Division ID ${divisionId} not found`);
          if (!division.is_active) throw new Error(`Division ID ${divisionId} is inactive`);
        }
      } else {
        await this._validateDivisions(division_ids, adminId);
      }
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
      if (division_ids) await TeacherModel.setDivisions(id, division_ids, client);

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
   * Reset teacher password.
   */
  static async resetTeacherPassword(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (!primaryBranch || (primaryBranch.id !== headBranchId && primaryBranch.parent_id !== headBranchId)) {
        throw new Error("Access denied");
      }
    }

    const newPassword = this._generatePassword();
    await TeacherModel.updatePassword(id, newPassword);

    return { temporaryPassword: newPassword };
  }

  /**
   * Toggle teacher active.
   */
  static async toggleTeacherActive(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (!primaryBranch || (primaryBranch.id !== headBranchId && primaryBranch.parent_id !== headBranchId)) {
        throw new Error("Access denied");
      }
    }

    return TeacherModel.toggleActive(id);
  }

  /**
   * Migrate teacher to a new primary branch within the same head branch.
   * Updates users.branch_id (primary branch) dan teacher_branches (assignment list).
   *
   * @param {number} teacherId
   * @param {number} targetBranchId - Branch tujuan (harus 1 head branch yang sama)
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async migrateTeacher(teacherId, targetBranchId, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(teacherId);
    if (!teacher) throw new Error("Teacher not found");

    // Access check untuk admin biasa
    if (headBranchId !== null) {
      const currentBranch = await BranchModel.findById(teacher.branch_id);
      if (!currentBranch || (currentBranch.id !== headBranchId && currentBranch.parent_id !== headBranchId)) {
        throw new Error("Access denied");
      }
    }

    // Validate target branch
    const targetBranch = await BranchModel.findById(targetBranchId);
    if (!targetBranch) throw new Error("Target branch not found");
    if (!targetBranch.is_active) throw new Error("Target branch is inactive");

    // Target must be within the same head branch scope
    const targetHeadBranchId = targetBranch.is_head_branch ? targetBranch.id : targetBranch.parent_id;

    if (headBranchId !== null && targetHeadBranchId !== headBranchId) {
      throw new Error("Target branch does not belong to your head branch");
    }

    if (teacherId === targetBranchId && teacher.branch_id === targetBranchId) {
      throw new Error("Teacher is already assigned to this branch");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Update primary branch
      await TeacherModel.update(teacherId, { branch_id: targetBranchId }, client);

      // Ensure target branch is in teacher_branches list
      await client.query(
        `INSERT INTO teacher_branches (teacher_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT (teacher_id, branch_id) DO NOTHING`,
        [teacherId, targetBranchId],
      );

      await client.query("COMMIT");

      return TeacherModel.findById(teacherId);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = TeacherService;

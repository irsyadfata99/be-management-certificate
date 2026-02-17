const TeacherModel = require("../models/teacherModel");
const BranchModel = require("../models/branchModel");
const DivisionModel = require("../models/divisionModel");
const { getClient } = require("../config/database");
const { query } = require("../config/database");
const crypto = require("crypto");
const PaginationHelper = require("../utils/paginationHelper");

class TeacherService {
  static _generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from(
      { length: 10 },
      () => chars[crypto.randomInt(0, chars.length)],
    ).join("");
  }

  static async _validateBranches(branchIds, adminHeadBranchId) {
    for (const branchId of branchIds) {
      const branch = await BranchModel.findById(branchId);
      if (!branch) throw new Error(`Branch ID ${branchId} not found`);
      if (!branch.is_active)
        throw new Error(`Branch ${branch.code} is inactive`);

      const isHeadBranch = branch.id === adminHeadBranchId;
      const isSubOfHead = branch.parent_id === adminHeadBranchId;

      if (!isHeadBranch && !isSubOfHead) {
        throw new Error(
          `Branch ${branch.code} does not belong to your head branch`,
        );
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
      if (!division.is_active)
        throw new Error(`Division ID ${divisionId} is inactive`);
    }
  }

  /**
   * FIX POINT 2: Handle superAdmin yang tidak punya branch_id dan role = 'admin'.
   * Sebelumnya query filter "role = 'admin'" sehingga superAdmin selalu gagal
   * dengan error "Admin does not have an assigned branch".
   *
   * SuperAdmin dikembalikan null sebagai sinyal "akses semua branch" —
   * konsisten dengan pola yang sama di studentService & certificateLogService.
   *
   * @param {number} adminId
   * @returns {Promise<number|null>} headBranchId, atau null jika superAdmin
   */
  static async _getAdminHeadBranchId(adminId) {
    const result = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
    const admin = result.rows[0];

    if (!admin) {
      throw new Error("Admin does not have an assigned branch");
    }

    // SuperAdmin: tidak terikat branch, kembalikan null
    if (admin.role === "superAdmin") {
      return null;
    }

    if (!admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    return admin.branch_id;
  }

  /**
   * Get all teachers.
   * ✅ FIXED: Added search, branchId, and divisionId filters with robust empty string handling
   * SuperAdmin: lihat semua teacher dari semua branch.
   * Admin: hanya teacher di bawah head branch-nya.
   *
   * @param {number} adminId
   * @param {Object} options
   * @param {boolean} [options.includeInactive=false] - Include inactive teachers
   * @param {string} [options.search] - Search by username or full_name
   * @param {number|string} [options.branchId] - Filter by branch_id (teacher assigned to this branch)
   * @param {number|string} [options.divisionId] - Filter by division_id (teacher assigned to this division)
   * @param {number} [options.page=1] - Page number
   * @param {number} [options.limit=50] - Items per page
   * @returns {Promise<{teachers: Array, pagination: Object}>}
   */
  static async getAllTeachers(
    adminId,
    {
      includeInactive = false,
      search = "",
      branchId = null,
      divisionId = null,
      page = 1,
      limit = 50,
    } = {},
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    // ✅ Build dynamic WHERE conditions
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    // Base condition: role = 'teacher'
    conditions.push("u.role = 'teacher'");

    // Active filter
    if (!includeInactive) {
      conditions.push("u.is_active = true");
    }

    // Search filter (username OR full_name)
    if (search && search.trim()) {
      conditions.push(
        `(u.username ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`,
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // ✅ ROBUST: Branch filter with empty string handling
    // Parse and validate branchId - handle empty string, "0", null, undefined
    const parsedBranchId = branchId ? parseInt(branchId, 10) : null;
    if (parsedBranchId && !isNaN(parsedBranchId)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM teacher_branches tb 
        WHERE tb.teacher_id = u.id AND tb.branch_id = $${paramIndex}
      )`);
      params.push(parsedBranchId);
      paramIndex++;
    }

    // ✅ ROBUST: Division filter with empty string handling
    // Parse and validate divisionId - handle empty string, "0", null, undefined
    const parsedDivisionId = divisionId ? parseInt(divisionId, 10) : null;
    if (parsedDivisionId && !isNaN(parsedDivisionId)) {
      conditions.push(`EXISTS (
        SELECT 1 FROM teacher_divisions td 
        WHERE td.teacher_id = u.id AND td.division_id = $${paramIndex}
      )`);
      params.push(parsedDivisionId);
      paramIndex++;
    }

    // SuperAdmin: ambil semua teacher dengan filters
    if (headBranchId === null) {
      const whereClause = conditions.join(" AND ");

      // Add pagination params
      params.push(l, offset);

      const teachersResult = await query(
        `SELECT
           u.id, u.username, u.full_name, u.role, u.is_active,
           u.branch_id, b.code AS head_branch_code, b.name AS head_branch_name,
           u.created_at AS "createdAt", u.updated_at AS "updatedAt",
           -- ✅ Get branch_ids array
           COALESCE(
             (SELECT array_agg(tb.branch_id ORDER BY tb.branch_id) 
              FROM teacher_branches tb 
              WHERE tb.teacher_id = u.id),
             ARRAY[]::integer[]
           ) AS branch_ids,
           -- ✅ Get division_ids array
           COALESCE(
             (SELECT array_agg(td.division_id ORDER BY td.division_id) 
              FROM teacher_divisions td 
              WHERE td.teacher_id = u.id),
             ARRAY[]::integer[]
           ) AS division_ids
         FROM users u
         LEFT JOIN branches b ON u.branch_id = b.id
         WHERE ${whereClause}
         ORDER BY u.full_name ASC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params,
      );

      // Count total with same filters (without pagination)
      const countParams = params.slice(0, -2); // Remove limit and offset
      const countResult = await query(
        `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
        countParams,
      );

      return {
        teachers: teachersResult.rows,
        pagination: PaginationHelper.buildResponse(
          p,
          l,
          parseInt(countResult.rows[0].count, 10),
        ),
      };
    }

    // ✅ Admin biasa: add head branch scope filter
    conditions.push(`(
      u.branch_id = $${paramIndex}
      OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $${paramIndex})
    )`);
    params.push(headBranchId);
    paramIndex++;

    const whereClause = conditions.join(" AND ");

    // Add pagination params
    params.push(l, offset);

    const teachersResult = await query(
      `SELECT
         u.id, u.username, u.full_name, u.role, u.is_active,
         u.branch_id, b.code AS head_branch_code, b.name AS head_branch_name,
         u.created_at AS "createdAt", u.updated_at AS "updatedAt",
         -- ✅ Get branch_ids array
         COALESCE(
           (SELECT array_agg(tb.branch_id ORDER BY tb.branch_id) 
            FROM teacher_branches tb 
            WHERE tb.teacher_id = u.id),
           ARRAY[]::integer[]
         ) AS branch_ids,
         -- ✅ Get division_ids array
         COALESCE(
           (SELECT array_agg(td.division_id ORDER BY td.division_id) 
            FROM teacher_divisions td 
            WHERE td.teacher_id = u.id),
           ARRAY[]::integer[]
         ) AS division_ids
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE ${whereClause}
       ORDER BY u.full_name ASC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params,
    );

    // Count total with same filters (without pagination)
    const countParams = params.slice(0, -2); // Remove limit and offset
    const countResult = await query(
      `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
      countParams,
    );

    return {
      teachers: teachersResult.rows,
      pagination: PaginationHelper.buildResponse(
        p,
        l,
        parseInt(countResult.rows[0].count, 10),
      ),
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

    // SuperAdmin: bebas akses
    if (headBranchId === null) return teacher;

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
   * Create teacher.
   * SuperAdmin: bisa buat teacher di branch manapun, validasi branch & division lebih longgar.
   * Admin: hanya di bawah head branch-nya sendiri.
   */
  static async createTeacher(
    { username, full_name, branch_ids, division_ids },
    adminId,
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);

    const existing = await query("SELECT id FROM users WHERE username = $1", [
      username,
    ]);
    if (existing.rows[0]) throw new Error("Username already exists");

    if (!branch_ids || branch_ids.length === 0) {
      throw new Error("At least one branch is required");
    }

    if (!division_ids || division_ids.length === 0) {
      throw new Error("At least one division is required");
    }

    // SuperAdmin: validasi branch exists & active saja, tidak perlu scope check
    if (headBranchId === null) {
      for (const branchId of branch_ids) {
        const branch = await BranchModel.findById(branchId);
        if (!branch) throw new Error(`Branch ID ${branchId} not found`);
        if (!branch.is_active)
          throw new Error(`Branch ${branch.code} is inactive`);
      }
      for (const divisionId of division_ids) {
        const division = await DivisionModel.findById(divisionId);
        if (!division) throw new Error(`Division ID ${divisionId} not found`);
        if (!division.is_active)
          throw new Error(`Division ID ${divisionId} is inactive`);
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
   * Update teacher.
   * SuperAdmin: bisa update teacher manapun.
   * Admin: hanya di bawah head branch-nya.
   */
  static async updateTeacher(
    id,
    { username, full_name, branch_ids, division_ids },
    adminId,
  ) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    // Scope check untuk admin biasa
    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (
        !primaryBranch ||
        (primaryBranch.id !== headBranchId &&
          primaryBranch.parent_id !== headBranchId)
      ) {
        throw new Error("Access denied");
      }
    }

    if (username && username.trim() !== teacher.username) {
      const existing = await query("SELECT id FROM users WHERE username = $1", [
        username.trim(),
      ]);
      if (existing.rows[0]) throw new Error("Username already exists");
    }

    if (branch_ids !== undefined) {
      if (branch_ids.length === 0)
        throw new Error("At least one branch is required");

      if (headBranchId === null) {
        for (const branchId of branch_ids) {
          const branch = await BranchModel.findById(branchId);
          if (!branch) throw new Error(`Branch ID ${branchId} not found`);
          if (!branch.is_active)
            throw new Error(`Branch ${branch.code} is inactive`);
        }
      } else {
        await this._validateBranches(branch_ids, headBranchId);
      }
    }

    if (division_ids !== undefined) {
      if (division_ids.length === 0)
        throw new Error("At least one division is required");

      if (headBranchId === null) {
        for (const divisionId of division_ids) {
          const division = await DivisionModel.findById(divisionId);
          if (!division) throw new Error(`Division ID ${divisionId} not found`);
          if (!division.is_active)
            throw new Error(`Division ID ${divisionId} is inactive`);
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
   * Reset teacher password.
   * SuperAdmin: bisa reset password teacher manapun.
   */
  static async resetTeacherPassword(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (
        !primaryBranch ||
        (primaryBranch.id !== headBranchId &&
          primaryBranch.parent_id !== headBranchId)
      ) {
        throw new Error("Access denied");
      }
    }

    const newPassword = this._generatePassword();
    await TeacherModel.updatePassword(id, newPassword);

    return { temporaryPassword: newPassword };
  }

  /**
   * Toggle teacher active.
   * SuperAdmin: bisa toggle teacher manapun.
   */
  static async toggleTeacherActive(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const primaryBranch = await BranchModel.findById(teacher.branch_id);
      if (
        !primaryBranch ||
        (primaryBranch.id !== headBranchId &&
          primaryBranch.parent_id !== headBranchId)
      ) {
        throw new Error("Access denied");
      }
    }

    return TeacherModel.toggleActive(id);
  }
}

module.exports = TeacherService;

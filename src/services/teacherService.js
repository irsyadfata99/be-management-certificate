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

  static async _getAdminHeadBranchId(adminId) {
    const result = await query(
      "SELECT branch_id, role FROM users WHERE id = $1",
      [adminId],
    );
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

  // FIX [N+1]: getAllTeachers sebelumnya melakukan subquery per teacher
  // untuk branch_ids dan division_ids via correlated subquery di SQL,
  // yang efektif menjadi N+1 di level DB. Sekarang menggunakan dua batch
  // query terpisah via findBranchesForTeachers dan findDivisionsForTeachers
  // lalu merge di application layer.
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

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    conditions.push("u.role = 'teacher'");

    if (!includeInactive) {
      conditions.push("u.is_active = true");
    }

    if (search && search.trim()) {
      conditions.push(
        `(u.username ILIKE $${paramIndex} OR u.full_name ILIKE $${paramIndex})`,
      );
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
        u.created_at AS "createdAt", u.updated_at AS "updatedAt"
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;

    let teachersResult;
    let countResult;

    if (headBranchId === null) {
      const whereClause = conditions.join(" AND ");
      params.push(l, offset);

      teachersResult = await query(
        `${baseSelect} WHERE ${whereClause} ORDER BY u.full_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params,
      );

      const countParams = params.slice(0, -2);
      countResult = await query(
        `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
        countParams,
      );
    } else {
      conditions.push(`(
        u.branch_id = $${paramIndex}
        OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $${paramIndex})
      )`);
      params.push(headBranchId);
      paramIndex++;

      const whereClause = conditions.join(" AND ");
      params.push(l, offset);

      teachersResult = await query(
        `${baseSelect} WHERE ${whereClause} ORDER BY u.full_name ASC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        params,
      );

      const countParams = params.slice(0, -2);
      countResult = await query(
        `SELECT COUNT(*) FROM users u WHERE ${whereClause}`,
        countParams,
      );
    }

    const teachers = teachersResult.rows;

    // Batch load branches & divisions — satu query per relasi, bukan per teacher
    if (teachers.length > 0) {
      const teacherIds = teachers.map((t) => t.id);
      const [branchesMap, divisionsMap] = await Promise.all([
        TeacherModel.findBranchesForTeachers(teacherIds),
        TeacherModel.findDivisionsForTeachers(teacherIds),
      ]);

      for (const teacher of teachers) {
        teacher.branch_ids = (branchesMap[teacher.id] || []).map(
          (b) => b.branch_id,
        );
        teacher.division_ids = (divisionsMap[teacher.id] || []).map(
          (d) => d.division_id,
        );
      }
    }

    return {
      teachers,
      pagination: PaginationHelper.buildResponse(
        p,
        l,
        parseInt(countResult.rows[0].count, 10),
      ),
    };
  }

  static async getTeacherById(id, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(id);
    if (!teacher) throw new Error("Teacher not found");

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

    if (headBranchId === null) {
      for (const bid of branch_ids) {
        const branch = await BranchModel.findById(bid);
        if (!branch) throw new Error(`Branch ID ${bid} not found`);
        if (!branch.is_active)
          throw new Error(`Branch ${branch.code} is inactive`);
      }
      for (const did of division_ids) {
        const division = await DivisionModel.findById(did);
        if (!division) throw new Error(`Division ID ${did} not found`);
        if (!division.is_active)
          throw new Error(`Division ID ${did} is inactive`);
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

  static async updateTeacher(
    id,
    { username, full_name, branch_ids, division_ids },
    adminId,
  ) {
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
        for (const bid of branch_ids) {
          const branch = await BranchModel.findById(bid);
          if (!branch) throw new Error(`Branch ID ${bid} not found`);
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
        for (const did of division_ids) {
          const division = await DivisionModel.findById(did);
          if (!division) throw new Error(`Division ID ${did} not found`);
          if (!division.is_active)
            throw new Error(`Division ID ${did} is inactive`);
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

  static async migrateTeacher(teacherId, targetBranchId, adminId) {
    const headBranchId = await this._getAdminHeadBranchId(adminId);
    const teacher = await TeacherModel.findById(teacherId);
    if (!teacher) throw new Error("Teacher not found");

    if (headBranchId !== null) {
      const currentBranch = await BranchModel.findById(teacher.branch_id);
      if (
        !currentBranch ||
        (currentBranch.id !== headBranchId &&
          currentBranch.parent_id !== headBranchId)
      ) {
        throw new Error("Access denied");
      }
    }

    const targetBranch = await BranchModel.findById(targetBranchId);
    if (!targetBranch) throw new Error("Target branch not found");
    if (!targetBranch.is_active) throw new Error("Target branch is inactive");

    const targetHeadBranchId = targetBranch.is_head_branch
      ? targetBranch.id
      : targetBranch.parent_id;

    if (headBranchId !== null && targetHeadBranchId !== headBranchId) {
      throw new Error("Target branch does not belong to your head branch");
    }

    if (teacherId === targetBranchId && teacher.branch_id === targetBranchId) {
      throw new Error("Teacher is already assigned to this branch");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      await TeacherModel.update(
        teacherId,
        { branch_id: targetBranchId },
        client,
      );

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

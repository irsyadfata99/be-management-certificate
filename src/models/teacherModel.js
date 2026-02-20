const { query, getClient } = require("../config/database");
const bcrypt = require("bcryptjs");

class TeacherModel {
  static _baseSelect() {
    return `
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.branch_id,
        b.code  AS head_branch_code,
        b.name  AS head_branch_name,
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt"
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;
  }

  static async findAllByHeadBranch(
    headBranchId,
    { includeInactive = false, limit = null, offset = null } = {},
  ) {
    const activeWhere = includeInactive ? "" : "AND u.is_active = true";

    let sql = `
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.is_active,
        u.branch_id,
        b.code AS head_branch_code,
        b.name AS head_branch_name,
        u.created_at AS "createdAt",
        u.updated_at AS "updatedAt",
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
      WHERE u.role = 'teacher'
        AND (
          u.branch_id = $1
          OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $1)
        )
        ${activeWhere}
      ORDER BY u.full_name ASC`;

    const params = [headBranchId];
    let paramIndex = 2;

    if (limit) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    if (offset) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  static async countByHeadBranch(
    headBranchId,
    { includeInactive = false } = {},
  ) {
    let sql = `
      SELECT COUNT(*) FROM users u
      WHERE u.role = 'teacher'
        AND (
          u.branch_id = $1
          OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $1)
        )
    `;
    const params = [headBranchId];

    if (!includeInactive) {
      sql += " AND u.is_active = true";
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(id) {
    const userResult = await query(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active,
              u.branch_id, 
              u.created_at AS "createdAt", u.updated_at AS "updatedAt"
       FROM users u WHERE u.id = $1 AND u.role = 'teacher'`,
      [id],
    );
    if (!userResult.rows[0]) return null;

    const teacher = userResult.rows[0];

    const branchResult = await query(
      `SELECT tb.branch_id, b.code, b.name, b.is_head_branch, b.parent_id
       FROM teacher_branches tb
       JOIN branches b ON tb.branch_id = b.id
       WHERE tb.teacher_id = $1
       ORDER BY b.code ASC`,
      [id],
    );

    const divResult = await query(
      `SELECT td.division_id, d.name AS division_name
       FROM teacher_divisions td
       JOIN divisions d ON td.division_id = d.id
       WHERE td.teacher_id = $1
       ORDER BY d.name ASC`,
      [id],
    );

    return {
      ...teacher,
      branches: branchResult.rows,
      divisions: divResult.rows,
    };
  }

  static async findByUsername(username) {
    const result = await query(
      "SELECT * FROM users WHERE username = $1 AND role = 'teacher'",
      [username],
    );
    return result.rows[0] || null;
  }

  static async create(
    { username, full_name, password, branch_id },
    client = null,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO users (username, full_name, password, role, branch_id)
       VALUES ($1, $2, $3, 'teacher', $4)
       RETURNING id, username, full_name, role, is_active, branch_id, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [username, full_name, hashedPassword, branch_id],
    );
    return result.rows[0];
  }

  static async update(id, data, client = null) {
    const allowed = ["username", "full_name", "branch_id"];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE users SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx} AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await query(
      `UPDATE users SET password = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [hashedPassword, id],
    );
    return result.rows[0] || null;
  }

  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE users SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  // ─── Branch assignments ───────────────────────────────────────────────────

  static async setBranches(teacherId, branchIds, client) {
    const exec = client.query.bind(client);
    await exec("DELETE FROM teacher_branches WHERE teacher_id = $1", [
      teacherId,
    ]);
    for (const branchId of branchIds) {
      await exec(
        "INSERT INTO teacher_branches (teacher_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [teacherId, branchId],
      );
    }
  }

  // ─── Division assignments ─────────────────────────────────────────────────

  static async setDivisions(teacherId, divisionIds, client) {
    const exec = client.query.bind(client);
    await exec("DELETE FROM teacher_divisions WHERE teacher_id = $1", [
      teacherId,
    ]);
    for (const divisionId of divisionIds) {
      await exec(
        "INSERT INTO teacher_divisions (teacher_id, division_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [teacherId, divisionId],
      );
    }
  }
}

module.exports = TeacherModel;

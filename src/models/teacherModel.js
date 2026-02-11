const { query, getClient } = require("../config/database");
const bcrypt = require("bcryptjs");

class TeacherModel {
  /**
   * Base SELECT for teacher with branch and division info
   */
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
        u."createdAt",
        u."updatedAt"
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;
  }

  /**
   * Find all teachers under a specific head branch (admin's branch)
   * @param {number} headBranchId - admin's branch_id
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findAllByHeadBranch(
    headBranchId,
    { includeInactive = false } = {},
  ) {
    // Teachers are linked to sub/head branches under the same head branch
    const activeWhere = includeInactive ? "" : "AND u.is_active = true";

    const result = await query(
      `${this._baseSelect()}
       WHERE u.role = 'teacher'
         AND (
           u.branch_id = $1
           OR u.branch_id IN (SELECT id FROM branches WHERE parent_id = $1)
         )
         ${activeWhere}
       ORDER BY u.full_name ASC`,
      [headBranchId],
    );

    return result.rows;
  }

  /**
   * Count teachers by head branch
   * @param {number} headBranchId
   * @param {Object} options
   * @returns {Promise<number>}
   */
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

  /**
   * Find teacher by ID with full detail (branches + divisions)
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const userResult = await query(
      `SELECT u.id, u.username, u.full_name, u.role, u.is_active,
              u.branch_id, u."createdAt", u."updatedAt"
       FROM users u WHERE u.id = $1 AND u.role = 'teacher'`,
      [id],
    );
    if (!userResult.rows[0]) return null;

    const teacher = userResult.rows[0];

    // Get assigned branches
    const branchResult = await query(
      `SELECT tb.branch_id, b.code, b.name, b.is_head_branch, b.parent_id
       FROM teacher_branches tb
       JOIN branches b ON tb.branch_id = b.id
       WHERE tb.teacher_id = $1
       ORDER BY b.code ASC`,
      [id],
    );

    // Get assigned divisions
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

  /**
   * Find teacher by username
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  static async findByUsername(username) {
    const result = await query(
      "SELECT * FROM users WHERE username = $1 AND role = 'teacher'",
      [username],
    );
    return result.rows[0] || null;
  }

  /**
   * Create teacher user
   * @param {Object} data
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  static async create(
    { username, full_name, password, branch_id },
    client = null,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO users (username, full_name, password, role, branch_id)
       VALUES ($1, $2, $3, 'teacher', $4)
       RETURNING id, username, full_name, role, is_active, branch_id, "createdAt", "updatedAt"`,
      [username, full_name, hashedPassword, branch_id],
    );
    return result.rows[0];
  }

  /**
   * Update teacher profile
   * @param {number} id
   * @param {Object} data - partial fields
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
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
      `UPDATE users SET ${fields.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $${idx} AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, "createdAt", "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  /**
   * Update password
   * @param {number} id
   * @param {string} newPassword
   * @returns {Promise<Object|null>}
   */
  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await query(
      `UPDATE users SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2 AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, "createdAt", "updatedAt"`,
      [hashedPassword, id],
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle teacher active status
   * @param {number} id
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE users SET is_active = NOT is_active, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1 AND role = 'teacher'
       RETURNING id, username, full_name, role, is_active, branch_id, "createdAt", "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  // ─── Branch assignments ───────────────────────────────────────────────────

  /**
   * Set teacher branches (replace all)
   * @param {number} teacherId
   * @param {number[]} branchIds
   * @param {Object} client
   */
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

  /**
   * Set teacher divisions (replace all)
   * @param {number} teacherId
   * @param {number[]} divisionIds
   * @param {Object} client
   */
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

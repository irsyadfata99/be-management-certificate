const { query } = require("../config/database");

class StudentModel {
  /**
   * Base SELECT query with branch JOIN
   * FIXED: Added head_branch_id to SELECT and JOIN to branches
   */
  static _baseSelect() {
    return `
      SELECT 
        s.id,
        s.name,
        s.head_branch_id,
        b.code AS head_branch_code,
        b.name AS head_branch_name,
        s.is_active,
        s.created_at,
        s.updated_at
      FROM students s
      JOIN branches b ON s.head_branch_id = b.id
    `;
  }

  /**
   * Create student
   * @param {Object} data
   * @param {Object} client - Optional transaction client
   * @returns {Promise<Object>}
   */
  static async create({ name, head_branch_id }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO students (name, head_branch_id)
       VALUES ($1, $2)
       RETURNING id, name, head_branch_id, is_active, created_at, updated_at`,
      [name.trim(), head_branch_id],
    );
    return result.rows[0];
  }

  /**
   * Find student by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const result = await query(`${this._baseSelect()} WHERE s.id = $1`, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find student by exact name and head branch
   * @param {string} name
   * @param {number} headBranchId
   * @returns {Promise<Object|null>}
   */
  static async findByNameAndBranch(name, headBranchId) {
    const result = await query(`${this._baseSelect()} WHERE LOWER(s.name) = LOWER($1) AND s.head_branch_id = $2`, [name.trim(), headBranchId]);
    return result.rows[0] || null;
  }

  /**
   * Search students by name (fuzzy search)
   * @param {string} searchTerm
   * @param {number} headBranchId - Optional filter by head branch
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async searchByName(searchTerm, headBranchId = null, { limit = 20, offset = 0 } = {}) {
    let sql = `${this._baseSelect()} WHERE s.name ILIKE $1`;
    const params = [`%${searchTerm.trim()}%`];

    if (headBranchId) {
      sql += ` AND s.head_branch_id = $2`;
      params.push(headBranchId);
    }

    sql += ` ORDER BY s.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  /**
   * Get all students in a head branch
   * @param {number} headBranchId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findByHeadBranch(headBranchId, { limit = 100, offset = 0 } = {}) {
    const result = await query(
      `${this._baseSelect()} 
       WHERE s.head_branch_id = $1 
       ORDER BY s.name ASC 
       LIMIT $2 OFFSET $3`,
      [headBranchId, limit, offset],
    );
    return result.rows;
  }

  /**
   * Update student
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async update(id, { name, is_active }) {
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }

    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (updates.length === 0) {
      throw new Error("No fields to update");
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const result = await query(
      `UPDATE students 
       SET ${updates.join(", ")} 
       WHERE id = $${paramIndex}
       RETURNING id, name, head_branch_id, is_active, created_at, updated_at`,
      params,
    );

    if (result.rows.length === 0) {
      throw new Error("Student not found");
    }

    return result.rows[0];
  }

  /**
   * Delete student (soft delete by setting is_active = false)
   * @param {number} id
   * @returns {Promise<void>}
   */
  static async delete(id) {
    const result = await query(`UPDATE students SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`, [id]);

    if (result.rows.length === 0) {
      throw new Error("Student not found");
    }
  }

  /**
   * Count students in head branch
   * @param {number} headBranchId
   * @returns {Promise<number>}
   */
  static async countByHeadBranch(headBranchId) {
    const result = await query(`SELECT COUNT(*) FROM students WHERE head_branch_id = $1 AND is_active = true`, [headBranchId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get student statistics
   * @param {number} headBranchId
   * @returns {Promise<Object>}
   */
  static async getStatistics(headBranchId) {
    const result = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         COUNT(*) FILTER (WHERE is_active = false) as inactive
       FROM students
       WHERE head_branch_id = $1`,
      [headBranchId],
    );

    return {
      total: parseInt(result.rows[0].total, 10),
      active: parseInt(result.rows[0].active, 10),
      inactive: parseInt(result.rows[0].inactive, 10),
    };
  }
}

module.exports = StudentModel;

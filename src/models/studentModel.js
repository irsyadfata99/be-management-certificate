const { query, getClient } = require("../config/database");

class StudentModel {
  /**
   * Base SELECT with head branch info
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
        s."createdAt",
        s."updatedAt"
      FROM students s
      JOIN branches b ON s.head_branch_id = b.id
    `;
  }

  /**
   * Find all students by head branch
   * @param {number} headBranchId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findByHeadBranch(
    headBranchId,
    {
      includeInactive = false,
      search = null,
      limit = null,
      offset = null,
    } = {},
  ) {
    let sql = `${this._baseSelect()} WHERE s.head_branch_id = $1`;
    const params = [headBranchId];
    let paramIndex = 2;

    if (!includeInactive) {
      sql += ` AND s.is_active = true`;
    }

    if (search) {
      sql += ` AND s.name ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    sql += ` ORDER BY s.name ASC`;

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

  /**
   * Search students by name (for autocomplete)
   * @param {number} headBranchId
   * @param {string} searchTerm
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  static async searchByName(headBranchId, searchTerm, limit = 10) {
    const result = await query(
      `${this._baseSelect()}
       WHERE s.head_branch_id = $1
         AND s.is_active = true
         AND s.name ILIKE $2
       ORDER BY s.name ASC
       LIMIT $3`,
      [headBranchId, `%${searchTerm}%`, limit],
    );
    return result.rows;
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
   * Find student by exact name and head branch (case-insensitive)
   * @param {string} name
   * @param {number} headBranchId
   * @returns {Promise<Object|null>}
   */
  static async findByNameAndBranch(name, headBranchId) {
    const result = await query(
      `${this._baseSelect()}
       WHERE UPPER(s.name) = UPPER($1)
         AND s.head_branch_id = $2`,
      [name.trim(), headBranchId],
    );
    return result.rows[0] || null;
  }

  /**
   * Create student
   * @param {Object} data
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async create({ name, head_branch_id }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO students (name, head_branch_id)
       VALUES ($1, $2)
       RETURNING id, name, head_branch_id, is_active, "createdAt", "updatedAt"`,
      [name.trim(), head_branch_id],
    );
    return result.rows[0];
  }

  /**
   * Update student name
   * @param {number} id
   * @param {string} name
   * @param {Object} client
   * @returns {Promise<Object|null>}
   */
  static async update(id, name, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE students
       SET name = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, head_branch_id, is_active, "createdAt", "updatedAt"`,
      [name.trim(), id],
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle student active status
   * @param {number} id
   * @param {Object} client
   * @returns {Promise<Object|null>}
   */
  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE students
       SET is_active = NOT is_active, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, head_branch_id, is_active, "createdAt", "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Get student's certificate print history
   * @param {number} studentId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  static async getPrintHistory(
    studentId,
    { startDate, endDate, limit, offset } = {},
  ) {
    let sql = `
      SELECT
        cp.id,
        cp.certificate_id,
        c.certificate_number,
        cp.module_id,
        m.module_code,
        m.name AS module_name,
        cp.ptc_date,
        cp.teacher_id,
        u.username AS teacher_username,
        u.full_name AS teacher_name,
        cp.branch_id,
        b.code AS branch_code,
        b.name AS branch_name,
        cp.printed_at,
        cp."createdAt"
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      JOIN modules m ON cp.module_id = m.id
      JOIN users u ON cp.teacher_id = u.id
      JOIN branches b ON cp.branch_id = b.id
      WHERE cp.student_id = $1
    `;
    const params = [studentId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    sql += ` ORDER BY cp.ptc_date DESC, cp.printed_at DESC`;

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

  /**
   * Get student statistics
   * @param {number} studentId
   * @returns {Promise<Object>}
   */
  static async getStatistics(studentId) {
    const result = await query(
      `SELECT
         COUNT(*) AS total_certificates,
         COUNT(DISTINCT module_id) AS unique_modules,
         MIN(ptc_date) AS first_ptc_date,
         MAX(ptc_date) AS latest_ptc_date
       FROM certificate_prints
       WHERE student_id = $1`,
      [studentId],
    );
    return result.rows[0];
  }

  /**
   * Count students by head branch
   * @param {number} headBranchId
   * @param {Object} filters
   * @returns {Promise<number>}
   */
  static async countByHeadBranch(headBranchId, { search = null } = {}) {
    let sql = `SELECT COUNT(*) FROM students WHERE head_branch_id = $1 AND is_active = true`;
    const params = [headBranchId];

    if (search) {
      sql += ` AND name ILIKE $2`;
      params.push(`%${search}%`);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = StudentModel;

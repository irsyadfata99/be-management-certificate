const { query, getClient } = require("../config/database");

class BranchModel {
  /**
   * Build the base SELECT with parent join
   */
  static _baseSelect() {
    return `
      SELECT
        b.id,
        b.code,
        b.name,
        b.is_head_branch,
        b.is_active,
        b.parent_id,
        p.code  AS parent_code,
        p.name  AS parent_name,
        b."createdAt",
        b."updatedAt"
      FROM branches b
      LEFT JOIN branches p ON b.parent_id = p.id
    `;
  }

  /**
   * Find all branches
   * @param {Object} options
   * @param {boolean} options.includeInactive - include deactivated branches
   * @returns {Promise<Array>}
   */
  static async findAll({ includeInactive = false } = {}) {
    const where = includeInactive ? "" : "WHERE b.is_active = true";
    const sql = `
      ${this._baseSelect()}
      ${where}
      ORDER BY b.is_head_branch DESC, b.parent_id ASC NULLS FIRST, b.code ASC
    `;
    const result = await query(sql);
    return result.rows;
  }

  /**
   * Find branch by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const sql = `${this._baseSelect()} WHERE b.id = $1`;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find branch by code (case-insensitive)
   * @param {string} code
   * @returns {Promise<Object|null>}
   */
  static async findByCode(code) {
    const result = await query(
      "SELECT * FROM branches WHERE UPPER(code) = UPPER($1)",
      [code],
    );
    return result.rows[0] || null;
  }

  /**
   * Get only head branches
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findHeadBranches({ includeInactive = false } = {}) {
    const where = includeInactive
      ? "WHERE is_head_branch = true"
      : "WHERE is_head_branch = true AND is_active = true";
    const result = await query(
      `SELECT id, code, name, is_head_branch, is_active, "createdAt", "updatedAt"
       FROM branches ${where} ORDER BY code ASC`,
    );
    return result.rows;
  }

  /**
   * Get sub-branches of a head branch
   * @param {number} parentId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findSubBranches(parentId, { includeInactive = false } = {}) {
    const extraWhere = includeInactive ? "" : "AND is_active = true";
    const result = await query(
      `SELECT id, code, name, is_head_branch, is_active, parent_id, "createdAt", "updatedAt"
       FROM branches WHERE parent_id = $1 ${extraWhere} ORDER BY code ASC`,
      [parentId],
    );
    return result.rows;
  }

  /**
   * Create a new branch
   * @param {Object} data
   * @param {Object} [client] - optional pg client for transactions
   * @returns {Promise<Object>}
   */
  static async create(
    { code, name, is_head_branch = false, parent_id = null },
    client = null,
  ) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO branches (code, name, is_head_branch, parent_id)
       VALUES (UPPER($1), $2, $3, $4)
       RETURNING id, code, name, is_head_branch, parent_id, is_active, "createdAt", "updatedAt"`,
      [code, name, is_head_branch, parent_id],
    );
    return result.rows[0];
  }

  /**
   * Update branch fields
   * @param {number} id
   * @param {Object} data - partial fields to update
   * @param {Object} [client] - optional pg client for transactions
   * @returns {Promise<Object|null>}
   */
  static async update(id, data, client = null) {
    const allowed = ["code", "name", "is_head_branch", "parent_id"];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col =
          key === "code" ? `code = UPPER($${idx++})` : `${key} = $${idx++}`;
        fields.push(col);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET ${fields.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $${idx}
       RETURNING id, code, name, is_head_branch, parent_id, is_active, "createdAt", "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle is_active status (soft delete / restore)
   * @param {number} id
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET is_active = NOT is_active, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, code, name, is_head_branch, parent_id, is_active, "createdAt", "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Deactivate all sub-branches of a head branch
   * Used when head branch is deactivated
   * @param {number} parentId
   * @param {Object} [client]
   * @returns {Promise<number>} rows affected
   */
  static async deactivateSubBranches(parentId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET is_active = false, "updatedAt" = CURRENT_TIMESTAMP
       WHERE parent_id = $1 AND is_active = true`,
      [parentId],
    );
    return result.rowCount;
  }

  /**
   * Check if a branch has active sub-branches
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async hasActiveSubBranches(id) {
    const result = await query(
      "SELECT COUNT(*) FROM branches WHERE parent_id = $1 AND is_active = true",
      [id],
    );
    return parseInt(result.rows[0].count, 10) > 0;
  }
}

module.exports = BranchModel;

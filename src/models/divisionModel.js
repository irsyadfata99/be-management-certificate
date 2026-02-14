const { query, getClient } = require("../config/database");

class DivisionModel {
  // ─── Division ────────────────────────────────────────────────────────────

  /**
   * Find all divisions created by a specific admin
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findAllByAdmin(adminId, { includeInactive = false, limit = null, offset = null } = {}) {
    let sql = `
      SELECT
        d.id, d.name, d.is_active, 
        d.created_at AS "createdAt", d.updated_at AS "updatedAt",
        COUNT(sd.id) AS sub_division_count
      FROM divisions d
      LEFT JOIN sub_divisions sd ON sd.division_id = d.id
      WHERE d.created_by = $1
    `;

    const params = [adminId];
    let paramIndex = 2;

    if (!includeInactive) {
      sql += ` AND d.is_active = true`;
    }

    sql += ` GROUP BY d.id ORDER BY d.name ASC`;

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
   * Count divisions by admin
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<number>}
   */
  static async countByAdmin(adminId, { includeInactive = false } = {}) {
    let sql = "SELECT COUNT(*) FROM divisions WHERE created_by = $1";
    const params = [adminId];

    if (!includeInactive) {
      sql += " AND is_active = true";
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Find division by ID (with sub divisions)
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const divResult = await query(
      `SELECT id, name, created_by, is_active, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM divisions WHERE id = $1`,
      [id],
    );
    if (!divResult.rows[0]) return null;

    const subResult = await query(
      `SELECT id, division_id, name, age_min, age_max, is_active, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM sub_divisions WHERE division_id = $1 ORDER BY age_min ASC`,
      [id],
    );

    return { ...divResult.rows[0], sub_divisions: subResult.rows };
  }

  /**
   * Create division
   * @param {Object} data
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  static async create({ name, created_by }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO divisions (name, created_by)
       VALUES ($1, $2)
       RETURNING id, name, created_by, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, created_by],
    );
    return result.rows[0];
  }

  /**
   * Update division name
   * @param {number} id
   * @param {string} name
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async update(id, name, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE divisions SET name = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, name, created_by, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [name, id],
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle division active status
   * @param {number} id
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE divisions SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, name, created_by, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Delete division (hard delete — use only if no dependencies)
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async deleteById(id) {
    const result = await query("DELETE FROM divisions WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  // ─── Sub Division ────────────────────────────────────────────────────────

  /**
   * Find sub division by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findSubById(id) {
    const result = await query(
      `SELECT id, division_id, name, age_min, age_max, is_active, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM sub_divisions WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Check age range overlap within division
   * @param {number} divisionId
   * @param {number} ageMin
   * @param {number} ageMax
   * @param {number|null} excludeId - exclude current sub div when updating
   * @returns {Promise<boolean>}
   */
  static async hasAgeRangeOverlap(divisionId, ageMin, ageMax, excludeId = null) {
    const params = [divisionId, ageMin, ageMax];
    let sql = `
      SELECT COUNT(*) FROM sub_divisions
      WHERE division_id = $1
        AND is_active = true
        AND (age_min <= $3 AND age_max >= $2)
    `;
    if (excludeId) {
      sql += ` AND id <> $${params.push(excludeId)}`;
    }
    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  /**
   * Create sub division
   * @param {Object} data
   * @param {Object} [client]
   * @returns {Promise<Object>}
   */
  static async createSub({ division_id, name, age_min, age_max }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO sub_divisions (division_id, name, age_min, age_max)
       VALUES ($1, $2, $3, $4)
       RETURNING id, division_id, name, age_min, age_max, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [division_id, name, age_min, age_max],
    );
    return result.rows[0];
  }

  /**
   * Update sub division
   * @param {number} id
   * @param {Object} data
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async updateSub(id, { name, age_min, age_max }, client = null) {
    const fields = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(name);
    }
    if (age_min !== undefined) {
      fields.push(`age_min = $${idx++}`);
      values.push(age_min);
    }
    if (age_max !== undefined) {
      fields.push(`age_max = $${idx++}`);
      values.push(age_max);
    }

    if (fields.length === 0) return null;

    values.push(id);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE sub_divisions SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx}
       RETURNING id, division_id, name, age_min, age_max, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle sub division active
   * @param {number} id
   * @param {Object} [client]
   * @returns {Promise<Object|null>}
   */
  static async toggleSubActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE sub_divisions SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, division_id, name, age_min, age_max, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Delete sub division
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async deleteSubById(id) {
    const result = await query("DELETE FROM sub_divisions WHERE id = $1", [id]);
    return result.rowCount > 0;
  }
}

module.exports = DivisionModel;

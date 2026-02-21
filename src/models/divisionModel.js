const { query } = require("../config/database");

class DivisionModel {
  // ─── Division ────────────────────────────────────────────────────────────

  static async findAllByAdmin(adminId, { includeInactive = false, limit = null, offset = null } = {}) {
    let sql = `
      SELECT
        d.id, d.name, d.is_active, 
        d.created_at AS "createdAt", d.updated_at AS "updatedAt",
        COUNT(sd.id) AS sub_division_count,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', sd.id,
              'division_id', sd.division_id,
              'name', sd.name,
              'age_min', sd.age_min,
              'age_max', sd.age_max,
              'is_active', sd.is_active,
              'createdAt', sd.created_at,
              'updatedAt', sd.updated_at
            ) ORDER BY sd.age_min ASC
          ) FILTER (WHERE sd.id IS NOT NULL),
          '[]'
        ) AS sub_divisions
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

    if (limit != null) {
      sql += ` LIMIT $${paramIndex++}`;
      params.push(limit);
    }

    if (offset != null) {
      sql += ` OFFSET $${paramIndex++}`;
      params.push(offset);
    }

    const result = await query(sql, params);
    return result.rows;
  }

  static async countByAdmin(adminId, { includeInactive = false } = {}) {
    let sql = "SELECT COUNT(*) FROM divisions WHERE created_by = $1";
    const params = [adminId];

    if (!includeInactive) {
      sql += " AND is_active = true";
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

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

  static async deleteById(id) {
    const result = await query("DELETE FROM divisions WHERE id = $1", [id]);
    return result.rowCount > 0;
  }

  // ─── Sub Division ────────────────────────────────────────────────────────

  static async findSubById(id) {
    const result = await query(
      `SELECT id, division_id, name, age_min, age_max, is_active, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM sub_divisions WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

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

  static async deleteSubById(id) {
    const result = await query("DELETE FROM sub_divisions WHERE id = $1", [id]);
    return result.rowCount > 0;
  }
}

module.exports = DivisionModel;

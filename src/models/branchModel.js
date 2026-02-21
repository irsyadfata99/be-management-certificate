const { query } = require("../config/database");

class BranchModel {
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
        b.created_at AS "createdAt",
        b.updated_at AS "updatedAt"
      FROM branches b
      LEFT JOIN branches p ON b.parent_id = p.id
    `;
  }

  static async findAll({ includeInactive = false, limit = null, offset = null } = {}) {
    let sql = this._baseSelect();
    const params = [];
    let paramIndex = 1;

    if (!includeInactive) {
      sql += " WHERE b.is_active = true";
    }

    sql += " ORDER BY b.is_head_branch DESC, b.parent_id ASC NULLS FIRST, b.code ASC";

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

  static async count({ includeInactive = false } = {}) {
    let sql = "SELECT COUNT(*) FROM branches";

    if (!includeInactive) {
      sql += " WHERE is_active = true";
    }

    const result = await query(sql);
    return parseInt(result.rows[0].count, 10);
  }

  static async findById(id) {
    const sql = `${this._baseSelect()} WHERE b.id = $1`;
    const result = await query(sql, [id]);
    return result.rows[0] || null;
  }

  static async findByCode(code) {
    const result = await query("SELECT * FROM branches WHERE UPPER(code) = UPPER($1)", [code]);
    return result.rows[0] || null;
  }

  static async findHeadBranches({ includeInactive = false } = {}) {
    const where = includeInactive ? "WHERE is_head_branch = true" : "WHERE is_head_branch = true AND is_active = true";
    const result = await query(
      `SELECT id, code, name, is_head_branch, is_active, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM branches ${where} ORDER BY code ASC`,
    );
    return result.rows;
  }

  static async findSubBranches(parentId, { includeInactive = false } = {}) {
    const extraWhere = includeInactive ? "" : "AND is_active = true";
    const result = await query(
      `SELECT id, code, name, is_head_branch, is_active, parent_id, 
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM branches WHERE parent_id = $1 ${extraWhere} ORDER BY code ASC`,
      [parentId],
    );
    return result.rows;
  }

  static async create({ code, name, is_head_branch = false, parent_id = null }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO branches (code, name, is_head_branch, parent_id)
       VALUES (UPPER($1), $2, $3, $4)
       RETURNING id, code, name, is_head_branch, parent_id, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [code, name, is_head_branch, parent_id],
    );
    return result.rows[0];
  }

  static async update(id, data, client = null) {
    const allowed = ["code", "name", "is_head_branch", "parent_id"];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col = key === "code" ? `code = UPPER($${idx++})` : `${key} = $${idx++}`;
        fields.push(col);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${idx}
       RETURNING id, code, name, is_head_branch, parent_id, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  static async toggleActive(id, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET is_active = NOT is_active, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, code, name, is_head_branch, parent_id, is_active, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  static async deactivateSubBranches(parentId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branches
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE parent_id = $1 AND is_active = true`,
      [parentId],
    );
    return result.rowCount;
  }

  static async hasActiveSubBranches(id) {
    const result = await query("SELECT COUNT(*) FROM branches WHERE parent_id = $1 AND is_active = true", [id]);
    return parseInt(result.rows[0].count, 10) > 0;
  }
}

module.exports = BranchModel;

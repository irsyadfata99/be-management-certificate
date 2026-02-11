const { query } = require("../config/database");

class ModuleModel {
  static _baseSelect() {
    return `
      SELECT
        m.id,
        m.module_code,
        m.name,
        m.division_id,
        d.name      AS division_name,
        m.sub_div_id,
        sd.name     AS sub_division_name,
        sd.age_min,
        sd.age_max,
        m.created_by,
        m.is_active,
        m."createdAt",
        m."updatedAt"
      FROM modules m
      JOIN divisions d ON m.division_id = d.id
      LEFT JOIN sub_divisions sd ON m.sub_div_id = sd.id
    `;
  }

  /**
   * Find all modules created by admin
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Array>}
   */
  static async findAllByAdmin(adminId, { includeInactive = false } = {}) {
    const where = includeInactive
      ? "WHERE m.created_by = $1"
      : "WHERE m.created_by = $1 AND m.is_active = true";

    const result = await query(
      `${this._baseSelect()} ${where} ORDER BY m.module_code ASC`,
      [adminId],
    );
    return result.rows;
  }

  /**
   * Find module by ID
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const result = await query(`${this._baseSelect()} WHERE m.id = $1`, [id]);
    return result.rows[0] || null;
  }

  /**
   * Find module by code (case-insensitive)
   * @param {string} moduleCode
   * @returns {Promise<Object|null>}
   */
  static async findByCode(moduleCode) {
    const result = await query(
      "SELECT * FROM modules WHERE UPPER(module_code) = UPPER($1)",
      [moduleCode],
    );
    return result.rows[0] || null;
  }

  /**
   * Find modules accessible by teacher (based on teacher's divisions)
   * @param {number} teacherId
   * @returns {Promise<Array>}
   */
  static async findByTeacher(teacherId) {
    const result = await query(
      `${this._baseSelect()}
       WHERE m.is_active = true
         AND m.division_id IN (
           SELECT division_id FROM teacher_divisions WHERE teacher_id = $1
         )
       ORDER BY m.module_code ASC`,
      [teacherId],
    );
    return result.rows;
  }

  /**
   * Create module
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  static async create({
    module_code,
    name,
    division_id,
    sub_div_id = null,
    created_by,
  }) {
    const result = await query(
      `INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
       VALUES (UPPER($1), $2, $3, $4, $5)
       RETURNING id, module_code, name, division_id, sub_div_id, created_by, is_active, "createdAt", "updatedAt"`,
      [module_code, name, division_id, sub_div_id, created_by],
    );
    return result.rows[0];
  }

  /**
   * Update module
   * @param {number} id
   * @param {Object} data
   * @returns {Promise<Object|null>}
   */
  static async update(id, data) {
    const allowed = ["module_code", "name", "division_id", "sub_div_id"];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const key of allowed) {
      if (data[key] !== undefined) {
        const col =
          key === "module_code"
            ? `module_code = UPPER($${idx++})`
            : `${key} = $${idx++}`;
        fields.push(col);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) return null;

    values.push(id);
    const result = await query(
      `UPDATE modules SET ${fields.join(", ")}, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $${idx}
       RETURNING id, module_code, name, division_id, sub_div_id, created_by, is_active, "createdAt", "updatedAt"`,
      values,
    );
    return result.rows[0] || null;
  }

  /**
   * Toggle module active status
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async toggleActive(id) {
    const result = await query(
      `UPDATE modules SET is_active = NOT is_active, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, module_code, name, division_id, sub_div_id, created_by, is_active, "createdAt", "updatedAt"`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Delete module (hard delete)
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async deleteById(id) {
    const result = await query("DELETE FROM modules WHERE id = $1", [id]);
    return result.rowCount > 0;
  }
}

module.exports = ModuleModel;

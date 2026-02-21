const { query } = require("../config/database");

class StudentModel {
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

  static _detailSelect() {
    return `
      SELECT
        s.id,
        s.name,
        s.head_branch_id,
        hb.code AS head_branch_code,
        hb.name AS head_branch_name,
        s.is_active,
        s.created_at,
        s.updated_at,
        -- Division & Sub Division from latest certificate print
        d.id   AS division_id,
        d.name AS division_name,
        sd.id   AS sub_division_id,
        sd.name AS sub_division_name,
        -- Current module from latest certificate print
        m.id   AS current_module_id,
        m.name AS current_module_name,
        -- Current teacher from latest certificate print
        t.id        AS current_teacher_id,
        t.full_name AS current_teacher_name,
        -- Last issued certificate info
        lp.id         AS last_print_id,
        lp.created_at AS last_issued_at,
        lp.branch_id  AS last_issued_branch_id,
        lb.code       AS last_issued_branch_code,
        lb.name       AS last_issued_branch_name
      FROM students s
      JOIN branches hb ON s.head_branch_id = hb.id
      LEFT JOIN LATERAL (
        SELECT cp.id, cp.module_id, cp.teacher_id, cp.branch_id, cp.created_at
        FROM certificate_prints cp
        WHERE cp.student_id = s.id
        ORDER BY cp.created_at DESC
        LIMIT 1
      ) lp ON true
      LEFT JOIN modules       m  ON lp.module_id    = m.id
      LEFT JOIN sub_divisions sd ON m.sub_div_id    = sd.id
      LEFT JOIN divisions     d  ON sd.division_id  = d.id
      LEFT JOIN users         t  ON lp.teacher_id   = t.id
      LEFT JOIN branches      lb ON lp.branch_id    = lb.id
    `;
  }

  static async create({ name, head_branch_id }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO students (name, head_branch_id)
       VALUES ($1, $2)
       ON CONFLICT (LOWER(name), head_branch_id)
       DO UPDATE SET updated_at = students.updated_at
       RETURNING id, name, head_branch_id, is_active, created_at, updated_at`,
      [name.trim(), head_branch_id],
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await query(`${this._baseSelect()} WHERE s.id = $1`, [id]);
    return result.rows[0] || null;
  }

  static async findByIdWithDetail(id) {
    const result = await query(`${this._detailSelect()} WHERE s.id = $1`, [id]);
    return result.rows[0] || null;
  }

  static async findByNameAndBranch(name, headBranchId) {
    const result = await query(`${this._baseSelect()} WHERE LOWER(s.name) = LOWER($1) AND s.head_branch_id = $2`, [name.trim(), headBranchId]);
    return result.rows[0] || null;
  }

  static async searchByName(searchTerm, headBranchId = null, { limit = 20, offset = 0, includeInactive = true } = {}) {
    let sql = `${this._detailSelect()} WHERE s.name ILIKE $1`;
    const params = [`%${searchTerm.trim()}%`];

    if (headBranchId !== null) {
      sql += ` AND s.head_branch_id = $${params.length + 1}`;
      params.push(headBranchId);
    }

    if (!includeInactive) {
      sql += ` AND s.is_active = true`;
    }

    sql += ` ORDER BY s.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  static async findByHeadBranch(headBranchId, { limit = 100, offset = 0, includeInactive = false } = {}) {
    let sql = `${this._detailSelect()} WHERE ($1::INTEGER IS NULL OR s.head_branch_id = $1)`;
    const params = [headBranchId];

    if (!includeInactive) {
      sql += ` AND s.is_active = true`;
    }

    sql += ` ORDER BY s.name ASC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows;
  }

  static async update(id, { name, is_active, head_branch_id }) {
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

    if (head_branch_id !== undefined) {
      updates.push(`head_branch_id = $${paramIndex++}`);
      params.push(head_branch_id);
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

  static async toggleActive(id) {
    const result = await query(
      `UPDATE students
       SET is_active = NOT is_active, updated_at = NOW()
       WHERE id = $1
       RETURNING id, name, head_branch_id, is_active, created_at, updated_at`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new Error("Student not found");
    }

    return result.rows[0];
  }

  static async delete(id) {
    const result = await query(
      `UPDATE students SET is_active = false, updated_at = NOW() WHERE id = $1
       RETURNING id, name, head_branch_id, is_active, updated_at`,
      [id],
    );

    if (result.rows.length === 0) {
      throw new Error("Student not found");
    }

    return result.rows[0];
  }

  static async countByHeadBranch(headBranchId, includeInactive = false) {
    const activeFilter = includeInactive ? `` : ` AND is_active = true`;
    const sql = `SELECT COUNT(*) FROM students WHERE ($1::INTEGER IS NULL OR head_branch_id = $1)${activeFilter}`;
    const result = await query(sql, [headBranchId]);
    return parseInt(result.rows[0].count, 10);
  }

  static async countBySearch(searchTerm, headBranchId = null, includeInactive = false) {
    let sql = `SELECT COUNT(*) FROM students s WHERE s.name ILIKE $1`;
    const params = [`%${searchTerm.trim()}%`];

    if (headBranchId !== null) {
      sql += ` AND s.head_branch_id = $${params.length + 1}`;
      params.push(headBranchId);
    }

    if (!includeInactive) {
      sql += ` AND s.is_active = true`;
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  static async getStatistics(headBranchId) {
    const result = await query(
      `SELECT
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE is_active = true) as active,
         COUNT(*) FILTER (WHERE is_active = false) as inactive
       FROM students
       WHERE ($1::INTEGER IS NULL OR head_branch_id = $1)`,
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

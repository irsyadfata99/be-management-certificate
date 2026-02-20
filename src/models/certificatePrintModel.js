const { query } = require("../config/database");

class CertificatePrintModel {
  static _baseSelect() {
    return `
      SELECT
        cp.id,
        cp.certificate_id,
        c.certificate_number,
        cp.student_id,
        cp.student_name,
        cp.module_id,
        m.name AS module_name,
        m.module_code,
        cp.ptc_date,
        cp.teacher_id,
        u.username AS teacher_username,
        u.full_name AS teacher_name,
        cp.branch_id,
        b.code AS branch_code,
        b.name AS branch_name,
        cp.printed_at,
        cp.created_at AS "createdAt"
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      JOIN modules m ON cp.module_id = m.id
      JOIN users u ON cp.teacher_id = u.id
      JOIN branches b ON cp.branch_id = b.id
    `;
  }

  static async create(
    {
      certificate_id,
      certificate_number,
      student_id,
      student_name,
      module_id,
      ptc_date,
      teacher_id,
      branch_id,
      is_reprint = false,
    },
    client = null,
  ) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO certificate_prints (certificate_id, certificate_number, student_id, student_name, module_id, ptc_date, teacher_id, branch_id, is_reprint)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, certificate_id, certificate_number, student_id, student_name, module_id, ptc_date, teacher_id, branch_id, is_reprint, printed_at, created_at AS "createdAt"`,
      [
        certificate_id,
        certificate_number,
        student_id,
        student_name,
        module_id,
        ptc_date,
        teacher_id,
        branch_id,
        is_reprint,
      ],
    );
    return result.rows[0];
  }

  /**
   * Update existing print record for reprint.
   * certificate_prints has UNIQUE (certificate_id), so reprint updates
   * the existing row rather than inserting a new one.
   */
  static async updateForReprint(
    {
      certificate_id,
      student_id,
      student_name,
      module_id,
      ptc_date,
      teacher_id,
      branch_id,
    },
    client = null,
  ) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE certificate_prints
       SET
         student_id   = $1,
         student_name = $2,
         module_id    = $3,
         ptc_date     = $4,
         teacher_id   = $5,
         branch_id    = $6,
         is_reprint   = true,
         printed_at   = NOW()
       WHERE certificate_id = $7
       RETURNING id, certificate_id, certificate_number, student_id, student_name, module_id, ptc_date, teacher_id, branch_id, is_reprint, printed_at, created_at AS "createdAt"`,
      [
        student_id,
        student_name,
        module_id,
        ptc_date,
        teacher_id,
        branch_id,
        certificate_id,
      ],
    );
    return result.rows[0] || null;
  }

  static async findByCertificateId(certificateId) {
    const result = await query(
      `${this._baseSelect()} WHERE cp.certificate_id = $1`,
      [certificateId],
    );
    return result.rows[0] || null;
  }

  static async findByTeacher(
    teacherId,
    { startDate, endDate, moduleId, limit, offset } = {},
  ) {
    let sql = `${this._baseSelect()} WHERE cp.teacher_id = $1`;
    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (moduleId) {
      sql += ` AND cp.module_id = $${paramIndex++}`;
      params.push(moduleId);
    }

    sql += ` ORDER BY cp.printed_at DESC`;

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

  static async findByHeadBranch(
    headBranchId,
    { startDate, endDate, branchId, teacherId, moduleId, limit, offset } = {},
  ) {
    let sql = `
      ${this._baseSelect()}
      WHERE c.head_branch_id = $1
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (branchId) {
      sql += ` AND cp.branch_id = $${paramIndex++}`;
      params.push(branchId);
    }

    if (teacherId) {
      sql += ` AND cp.teacher_id = $${paramIndex++}`;
      params.push(teacherId);
    }

    if (moduleId) {
      sql += ` AND cp.module_id = $${paramIndex++}`;
      params.push(moduleId);
    }

    sql += ` ORDER BY cp.printed_at DESC`;

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

  static async countByTeacher(teacherId) {
    const result = await query(
      "SELECT COUNT(*) FROM certificate_prints WHERE teacher_id = $1",
      [teacherId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  static async countByHeadBranch(headBranchId) {
    const result = await query(
      `SELECT COUNT(*) FROM certificate_prints cp
       JOIN certificates c ON cp.certificate_id = c.id
       WHERE c.head_branch_id = $1`,
      [headBranchId],
    );
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = CertificatePrintModel;

const { query } = require("../config/database");

class CertificatePrintModel {
  /**
   * Base SELECT with joined data
   */
  static _baseSelect() {
    return `
      SELECT
        cp.id,
        cp.certificate_id,
        c.certificate_number,
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
        cp."createdAt"
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      JOIN modules m ON cp.module_id = m.id
      JOIN users u ON cp.teacher_id = u.id
      JOIN branches b ON cp.branch_id = b.id
    `;
  }

  /**
   * Create print record
   * @param {Object} data
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async create(
    {
      certificate_id,
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
      `INSERT INTO certificate_prints (certificate_id, student_name, module_id, ptc_date, teacher_id, branch_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, certificate_id, student_name, module_id, ptc_date, teacher_id, branch_id, printed_at, "createdAt"`,
      [
        certificate_id,
        student_name,
        module_id,
        ptc_date,
        teacher_id,
        branch_id,
      ],
    );
    return result.rows[0];
  }

  /**
   * Find print record by certificate ID
   * @param {number} certificateId
   * @returns {Promise<Object|null>}
   */
  static async findByCertificateId(certificateId) {
    const result = await query(
      `${this._baseSelect()} WHERE cp.certificate_id = $1`,
      [certificateId],
    );
    return result.rows[0] || null;
  }

  /**
   * Find prints by teacher (for teacher's own history)
   * @param {number} teacherId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
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

  /**
   * Find prints by head branch (for admin monitoring)
   * @param {number} headBranchId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
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

  /**
   * Count prints by teacher
   * @param {number} teacherId
   * @returns {Promise<number>}
   */
  static async countByTeacher(teacherId) {
    const result = await query(
      "SELECT COUNT(*) FROM certificate_prints WHERE teacher_id = $1",
      [teacherId],
    );
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Count prints by head branch
   * @param {number} headBranchId
   * @returns {Promise<number>}
   */
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

const { query } = require("../config/database");

class CertificateLogModel {
  /**
   * Base SELECT with joined data
   */
  static _baseSelect() {
    return `
      SELECT
        cl.id,
        cl.certificate_id,
        c.certificate_number,
        cl.action_type,
        cl.actor_id,
        u.username AS actor_username,
        u.full_name AS actor_name,
        cl.actor_role,
        cl.from_branch_id,
        fb.code AS from_branch_code,
        fb.name AS from_branch_name,
        cl.to_branch_id,
        tb.code AS to_branch_code,
        tb.name AS to_branch_name,
        cl.metadata,
        cl.created_at AS "createdAt"
      FROM certificate_logs cl
      LEFT JOIN certificates c ON cl.certificate_id = c.id
      JOIN users u ON cl.actor_id = u.id
      LEFT JOIN branches fb ON cl.from_branch_id = fb.id
      LEFT JOIN branches tb ON cl.to_branch_id = tb.id
    `;
  }

  /**
   * Create log entry
   * @param {Object} data
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async create({ certificate_id = null, action_type, actor_id, actor_role, from_branch_id = null, to_branch_id = null, metadata = null }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata, created_at AS "createdAt"`,
      [certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata ? JSON.stringify(metadata) : null],
    );
    return result.rows[0];
  }

  /**
   * Bulk create log entries
   * @param {Array} logs
   * @param {Object} client
   * @returns {Promise<Array>}
   */
  static async bulkCreate(logs, client) {
    const exec = client.query.bind(client);
    const values = [];
    const placeholders = [];

    logs.forEach((log, index) => {
      const base = index * 7;
      placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`);
      values.push(log.certificate_id || null, log.action_type, log.actor_id, log.actor_role, log.from_branch_id || null, log.to_branch_id || null, log.metadata ? JSON.stringify(log.metadata) : null);
    });

    const result = await exec(
      `INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata)
       VALUES ${placeholders.join(", ")}
       RETURNING id, certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata, created_at AS "createdAt"`,
      values,
    );

    return result.rows;
  }

  /**
   * Find logs by head branch (for admin)
   * @param {number} headBranchId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  static async findByHeadBranch(headBranchId, { actionType, actorId, startDate, endDate, certificateNumber, limit, offset } = {}) {
    let sql = `
      ${this._baseSelect()}
      WHERE (
        cl.from_branch_id IN (
          SELECT id FROM branches WHERE id = $1 OR parent_id = $1
        )
        OR cl.to_branch_id IN (
          SELECT id FROM branches WHERE id = $1 OR parent_id = $1
        )
        OR c.head_branch_id = $1
      )
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (actionType) {
      sql += ` AND cl.action_type = $${paramIndex++}`;
      params.push(actionType);
    }

    if (actorId) {
      sql += ` AND cl.actor_id = $${paramIndex++}`;
      params.push(actorId);
    }

    if (startDate) {
      sql += ` AND cl.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cl.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (certificateNumber) {
      sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
      params.push(`%${certificateNumber}%`);
    }

    sql += ` ORDER BY cl.created_at DESC`;

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
   * Find logs by teacher (own prints only)
   * @param {number} teacherId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  static async findByTeacher(teacherId, { startDate, endDate, certificateNumber, limit, offset } = {}) {
    let sql = `
      ${this._baseSelect()}
      WHERE cl.actor_id = $1 AND cl.action_type IN ('reserve', 'print')
    `;
    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cl.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cl.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (certificateNumber) {
      sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
      params.push(`%${certificateNumber}%`);
    }

    sql += ` ORDER BY cl.created_at DESC`;

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
   * Count logs by head branch
   * @param {number} headBranchId
   * @param {Object} filters
   * @returns {Promise<number>}
   */
  static async countByHeadBranch(headBranchId, filters = {}) {
    let sql = `
      SELECT COUNT(*) FROM certificate_logs cl
      LEFT JOIN certificates c ON cl.certificate_id = c.id
      WHERE (
        cl.from_branch_id IN (
          SELECT id FROM branches WHERE id = $1 OR parent_id = $1
        )
        OR cl.to_branch_id IN (
          SELECT id FROM branches WHERE id = $1 OR parent_id = $1
        )
        OR c.head_branch_id = $1
      )
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (filters.actionType) {
      sql += ` AND cl.action_type = $${paramIndex++}`;
      params.push(filters.actionType);
    }

    if (filters.actorId) {
      sql += ` AND cl.actor_id = $${paramIndex++}`;
      params.push(filters.actorId);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Count logs by teacher
   * @param {number} teacherId
   * @returns {Promise<number>}
   */
  static async countByTeacher(teacherId) {
    const result = await query(
      `SELECT COUNT(*) FROM certificate_logs
       WHERE actor_id = $1 AND action_type IN ('reserve', 'print')`,
      [teacherId],
    );
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = CertificateLogModel;

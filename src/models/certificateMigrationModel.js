const { query } = require("../config/database");

class CertificateMigrationModel {
  /**
   * Base SELECT with branch info
   */
  static _baseSelect() {
    return `
      SELECT
        cm.id,
        cm.certificate_id,
        c.certificate_number,
        cm.from_branch_id,
        fb.code AS from_branch_code,
        fb.name AS from_branch_name,
        cm.to_branch_id,
        tb.code AS to_branch_code,
        tb.name AS to_branch_name,
        cm.migrated_by,
        u.username AS migrated_by_username,
        u.full_name AS migrated_by_name,
        cm.migrated_at,
        cm."createdAt"
      FROM certificate_migrations cm
      JOIN certificates c ON cm.certificate_id = c.id
      JOIN branches fb ON cm.from_branch_id = fb.id
      JOIN branches tb ON cm.to_branch_id = tb.id
      JOIN users u ON cm.migrated_by = u.id
    `;
  }

  /**
   * Create migration record
   * @param {Object} data
   * @param {Object} client
   * @returns {Promise<Object>}
   */
  static async create(
    { certificate_id, from_branch_id, to_branch_id, migrated_by },
    client = null,
  ) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, certificate_id, from_branch_id, to_branch_id, migrated_by, migrated_at, created_at AS "createdAt"`,
      [certificate_id, from_branch_id, to_branch_id, migrated_by],
    );
    return result.rows[0];
  }

  /**
   * Bulk create migration records
   * @param {Array} migrations
   * @param {Object} client
   * @returns {Promise<Array>}
   */
  static async bulkCreate(migrations, client) {
    const exec = client.query.bind(client);
    const values = [];
    const placeholders = [];

    migrations.forEach((mig, index) => {
      const base = index * 4;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`,
      );
      values.push(
        mig.certificate_id,
        mig.from_branch_id,
        mig.to_branch_id,
        mig.migrated_by,
      );
    });

    const result = await exec(
      `INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
       VALUES ${placeholders.join(", ")}
       RETURNING id, certificate_id, from_branch_id, to_branch_id, migrated_by, migrated_at, created_at AS "createdAt"`,
      values,
    );

    return result.rows;
  }

  /**
   * Find migrations by head branch
   * @param {number} headBranchId
   * @param {Object} filters
   * @returns {Promise<Array>}
   */
  static async findByHeadBranch(
    headBranchId,
    { startDate, endDate, fromBranchId, toBranchId, limit, offset } = {},
  ) {
    let sql = `
      ${this._baseSelect()}
      WHERE c.head_branch_id = $1
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cm.migrated_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cm.migrated_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (fromBranchId) {
      sql += ` AND cm.from_branch_id = $${paramIndex++}`;
      params.push(fromBranchId);
    }

    if (toBranchId) {
      sql += ` AND cm.to_branch_id = $${paramIndex++}`;
      params.push(toBranchId);
    }

    sql += ` ORDER BY cm.migrated_at DESC`;

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
   * Find migration history for specific certificate
   * @param {number} certificateId
   * @returns {Promise<Array>}
   */
  static async findByCertificate(certificateId) {
    const result = await query(
      `${this._baseSelect()} WHERE cm.certificate_id = $1 ORDER BY cm.migrated_at DESC`,
      [certificateId],
    );
    return result.rows;
  }

  /**
   * Count migrations by head branch
   * @param {number} headBranchId
   * @returns {Promise<number>}
   */
  static async countByHeadBranch(headBranchId) {
    const result = await query(
      `SELECT COUNT(*) FROM certificate_migrations cm
       JOIN certificates c ON cm.certificate_id = c.id
       WHERE c.head_branch_id = $1`,
      [headBranchId],
    );
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = CertificateMigrationModel;

const { query } = require("../config/database");

class CertificateModel {
  static _baseSelect() {
    return `
      SELECT
        c.id,
        c.certificate_number,
        c.head_branch_id,
        hb.code AS head_branch_code,
        hb.name AS head_branch_name,
        c.current_branch_id,
        cb.code AS current_branch_code,
        cb.name AS current_branch_name,
        c.status,
        c.medal_included,
        c.created_by,
        c.created_at AS "createdAt",
        c.updated_at AS "updatedAt"
      FROM certificates c
      JOIN branches hb ON c.head_branch_id = hb.id
      JOIN branches cb ON c.current_branch_id = cb.id
    `;
  }

  static async existsByNumber(certificateNumber) {
    const result = await query(
      "SELECT id FROM certificates WHERE certificate_number = $1",
      [certificateNumber],
    );
    return result.rows.length > 0;
  }

  static async bulkCreate(certificates, client) {
    const exec = client ? client.query.bind(client) : query;
    const values = [];
    const placeholders = [];

    certificates.forEach((cert, index) => {
      const base = index * 5;
      placeholders.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`,
      );
      values.push(
        cert.certificate_number,
        cert.head_branch_id,
        cert.current_branch_id,
        cert.created_by,
        cert.medal_included !== undefined ? cert.medal_included : true,
      );
    });

    const result = await exec(
      `INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, created_by, medal_included)
       VALUES ${placeholders.join(", ")}
       RETURNING id, certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      values,
    );

    return result.rows;
  }

  static async countByHeadBranch(
    headBranchId,
    { status, currentBranchId, search } = {},
  ) {
    let sql = `SELECT COUNT(*) FROM certificates c WHERE c.head_branch_id = $1`;
    const params = [headBranchId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (currentBranchId) {
      sql += ` AND c.current_branch_id = $${paramIndex++}`;
      params.push(currentBranchId);
    }

    if (search) {
      sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }

  static async findByHeadBranch(
    headBranchId,
    {
      status,
      currentBranchId,
      search,
      sortBy = "certificate_number",
      order = "desc",
      limit,
      offset,
    } = {},
  ) {
    let sql = `${this._baseSelect()} WHERE c.head_branch_id = $1`;
    const params = [headBranchId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND c.status = $${paramIndex++}`;
      params.push(status);
    }

    if (currentBranchId) {
      sql += ` AND c.current_branch_id = $${paramIndex++}`;
      params.push(currentBranchId);
    }

    if (search) {
      sql += ` AND c.certificate_number ILIKE $${paramIndex++}`;
      params.push(`%${search}%`);
    }

    const allowedSortFields = [
      "certificate_number",
      "status",
      "created_at",
      "updated_at",
    ];
    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : "certificate_number";
    const safeOrder = order?.toLowerCase() === "asc" ? "ASC" : "DESC";

    sql += ` ORDER BY c.${safeSortBy} ${safeOrder}`;

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

  static async findAvailableInBranch(branchId, limit = 1) {
    const sql = `
      ${this._baseSelect()}
      WHERE c.current_branch_id = $1
        AND c.status = 'in_stock'
        AND c.id NOT IN (
          SELECT certificate_id FROM certificate_reservations
          WHERE status = 'active' AND expires_at > NOW()
        )
      ORDER BY c.certificate_number ASC
      LIMIT $2
    `;

    const result = await query(sql, [branchId, limit]);
    return result.rows;
  }

  static async findById(id) {
    const result = await query(`${this._baseSelect()} WHERE c.id = $1`, [id]);
    return result.rows[0] || null;
  }

  static async findByNumber(certificateNumber) {
    const result = await query(
      `${this._baseSelect()} WHERE c.certificate_number = $1`,
      [certificateNumber],
    );
    return result.rows[0] || null;
  }

  static async updateStatus(id, status, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE certificates SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [status, id],
    );
    return result.rows[0] || null;
  }

  static async updateLocation(id, newBranchId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE certificates
       SET current_branch_id = $1, status = 'in_stock', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by, 
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [newBranchId, id],
    );
    return result.rows[0] || null;
  }

  static async getStockCount(branchId) {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'in_stock') AS in_stock,
         COUNT(*) FILTER (WHERE status = 'reserved') AS reserved,
         COUNT(*) FILTER (WHERE status = 'printed') AS printed,
         COUNT(*) FILTER (WHERE status = 'migrated') AS migrated,
         COUNT(*) AS total
       FROM certificates
       WHERE current_branch_id = $1`,
      [branchId],
    );
    return result.rows[0];
  }

  static async findByRange(startNumber, endNumber, branchId) {
    const result = await query(
      `${this._baseSelect()}
       WHERE c.certificate_number BETWEEN $1 AND $2
         AND c.current_branch_id = $3
       ORDER BY c.certificate_number ASC`,
      [startNumber, endNumber, branchId],
    );
    return result.rows;
  }

  static async countInRange(startNumber, endNumber, headBranchId) {
    const result = await query(
      `SELECT COUNT(*) FROM certificates
       WHERE certificate_number BETWEEN $1 AND $2
         AND head_branch_id = $3`,
      [startNumber, endNumber, headBranchId],
    );
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = CertificateModel;

const { query } = require("../config/database");

class MedalStockModel {
  // ─── Stock ────────────────────────────────────────────────────────────────

  static async findByBranch(branchId) {
    const result = await query(
      `SELECT
         bms.id,
         bms.branch_id,
         b.code  AS branch_code,
         b.name  AS branch_name,
         b.is_head_branch,
         b.parent_id,
         bms.quantity,
         bms.updated_at
       FROM branch_medal_stock bms
       JOIN branches b ON bms.branch_id = b.id
       WHERE bms.branch_id = $1`,
      [branchId],
    );
    return result.rows[0] || null;
  }

  static async findByHeadBranch(headBranchId) {
    const result = await query(
      `SELECT
         bms.id,
         bms.branch_id,
         b.code  AS branch_code,
         b.name  AS branch_name,
         b.is_head_branch,
         b.parent_id,
         bms.quantity,
         bms.updated_at
       FROM branch_medal_stock bms
       JOIN branches b ON bms.branch_id = b.id
       WHERE b.id = $1
          OR b.parent_id = $1
       ORDER BY b.is_head_branch DESC, b.code ASC`,
      [headBranchId],
    );
    return result.rows;
  }

  static async initForBranch(branchId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO branch_medal_stock (branch_id, quantity)
       VALUES ($1, 0)
       ON CONFLICT (branch_id) DO NOTHING
       RETURNING id, branch_id, quantity, updated_at`,
      [branchId],
    );
    return result.rows[0] || null;
  }

  static async addStock(branchId, quantity, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO branch_medal_stock (branch_id, quantity)
       VALUES ($1, $2)
       ON CONFLICT (branch_id)
       DO UPDATE SET
         quantity   = branch_medal_stock.quantity + EXCLUDED.quantity,
         updated_at = NOW()
       RETURNING id, branch_id, quantity, updated_at`,
      [branchId, quantity],
    );
    return result.rows[0] || null;
  }

  static async consumeStock(branchId, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `UPDATE branch_medal_stock
       SET
         quantity   = quantity - 1,
         updated_at = NOW()
       WHERE branch_id = $1
         AND quantity  >= 1
       RETURNING id, branch_id, quantity, updated_at`,
      [branchId],
    );
    return result.rows[0] || null;
  }

  static async transferStock(fromBranchId, toBranchId, quantity, client = null) {
    // transferStock melakukan dua operasi (deduct + add) yang harus atomic.
    // Wajib dipanggil dalam transaction.
    if (!client) {
      throw new Error("transferStock requires a transaction client to ensure atomicity");
    }

    const exec = client.query.bind(client);

    const deduct = await exec(
      `UPDATE branch_medal_stock
       SET
         quantity   = quantity - $2,
         updated_at = NOW()
       WHERE branch_id = $1
         AND quantity  >= $2
       RETURNING id, branch_id, quantity, updated_at`,
      [fromBranchId, quantity],
    );

    if (deduct.rows.length === 0) return null;

    const add = await exec(
      `INSERT INTO branch_medal_stock (branch_id, quantity)
       VALUES ($1, $2)
       ON CONFLICT (branch_id)
       DO UPDATE SET
         quantity   = branch_medal_stock.quantity + EXCLUDED.quantity,
         updated_at = NOW()
       RETURNING id, branch_id, quantity, updated_at`,
      [toBranchId, quantity],
    );

    return {
      from: deduct.rows[0],
      to: add.rows[0],
    };
  }

  // ─── Logs ─────────────────────────────────────────────────────────────────

  static async createLog({ branch_id, action_type, quantity, actor_id, reference_id = null, notes = null }, client = null) {
    const exec = client ? client.query.bind(client) : query;
    const result = await exec(
      `INSERT INTO medal_stock_logs
         (branch_id, action_type, quantity, actor_id, reference_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, branch_id, action_type, quantity, actor_id, reference_id, notes, created_at`,
      [branch_id, action_type, quantity, actor_id, reference_id, notes],
    );
    return result.rows[0];
  }

  static async findLogsByHeadBranch(headBranchId, { actionType, startDate, endDate, limit = null, offset = null } = {}) {
    let sql = `
      SELECT
        ml.id,
        ml.branch_id,
        b.code        AS branch_code,
        b.name        AS branch_name,
        b.is_head_branch,
        ml.action_type,
        ml.quantity,
        ml.actor_id,
        u.username    AS actor_username,
        u.full_name   AS actor_name,
        ml.reference_id,
        ml.notes,
        ml.created_at AS "createdAt"
      FROM medal_stock_logs ml
      JOIN branches b ON ml.branch_id = b.id
      JOIN users    u ON ml.actor_id  = u.id
      WHERE (b.id = $1 OR b.parent_id = $1)
    `;

    const params = [headBranchId];
    let paramIndex = 2;

    if (actionType) {
      sql += ` AND ml.action_type = $${paramIndex++}`;
      params.push(actionType);
    }

    if (startDate) {
      sql += ` AND ml.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND ml.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    sql += ` ORDER BY ml.created_at DESC`;

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

  static async countLogsByHeadBranch(headBranchId, { actionType } = {}) {
    let sql = `
      SELECT COUNT(*) FROM medal_stock_logs ml
      JOIN branches b ON ml.branch_id = b.id
      WHERE (b.id = $1 OR b.parent_id = $1)
    `;
    const params = [headBranchId];
    let paramIndex = 2;

    if (actionType) {
      sql += ` AND ml.action_type = $${paramIndex++}`;
      params.push(actionType);
    }

    const result = await query(sql, params);
    return parseInt(result.rows[0].count, 10);
  }
}

module.exports = MedalStockModel;

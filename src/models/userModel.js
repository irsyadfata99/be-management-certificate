const bcryptjs = require("bcryptjs");
const { query } = require("../config/database");

class UserModel {
  static async findByUsername(username) {
    const result = await query(
      `SELECT id, username, full_name, password, role, branch_id, is_active,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM users WHERE username = $1`,
      [username],
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    const result = await query(
      `SELECT id, username, full_name, role, branch_id, is_active,
              created_at AS "createdAt", updated_at AS "updatedAt"
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  static async create({ username, password, role = "teacher", full_name = null, branch_id = null }, client = null) {
    const hashedPassword = await bcryptjs.hash(password, 10);
    const exec = client ? client.query.bind(client) : query;

    const result = await exec(
      `INSERT INTO users (username, full_name, password, role, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, role, branch_id, is_active,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [username, full_name, hashedPassword, role, branch_id],
    );
    return result.rows[0];
  }

  static async updateUsername(id, newUsername) {
    const result = await query(
      `UPDATE users
       SET username = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, role, branch_id, is_active,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [newUsername, id],
    );
    return result.rows[0] || null;
  }

  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcryptjs.hash(newPassword, 10);
    const result = await query(
      `UPDATE users
       SET password = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, role, branch_id, is_active,
                 created_at AS "createdAt", updated_at AS "updatedAt"`,
      [hashedPassword, id],
    );
    return result.rows[0] || null;
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return bcryptjs.compare(plainPassword, hashedPassword);
  }
}

module.exports = UserModel;

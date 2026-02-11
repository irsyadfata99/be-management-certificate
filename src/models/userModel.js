const { query } = require("../config/database");
const bcrypt = require("bcryptjs");

class UserModel {
  /**
   * Find user by username
   * @param {string} username
   * @returns {Promise<Object|null>}
   */
  static async findByUsername(username) {
    const result = await query("SELECT * FROM users WHERE username = $1", [
      username,
    ]);
    return result.rows[0] || null;
  }

  /**
   * Find user by ID (excludes password)
   * @param {number} id
   * @returns {Promise<Object|null>}
   */
  static async findById(id) {
    const result = await query(
      `SELECT id, username, full_name, role, branch_id, is_active, "createdAt", "updatedAt"
       FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new user
   * @param {Object} userData - { username, password, role, full_name?, branch_id? }
   * @param {Object} [client]  - optional pg client for transactions
   * @returns {Promise<Object>} Created user (without password)
   */
  static async create(
    {
      username,
      password,
      role = "teacher",
      full_name = null,
      branch_id = null,
    },
    client = null,
  ) {
    const hashedPassword = await bcrypt.hash(password, 10);
    const exec = client ? client.query.bind(client) : query;

    const result = await exec(
      `INSERT INTO users (username, full_name, password, role, branch_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, username, full_name, role, branch_id, is_active, "createdAt", "updatedAt"`,
      [username, full_name, hashedPassword, role, branch_id],
    );
    return result.rows[0];
  }

  /**
   * Update username
   * @param {number} id
   * @param {string} newUsername
   * @returns {Promise<Object|null>}
   */
  static async updateUsername(id, newUsername) {
    const result = await query(
      `UPDATE users
       SET username = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, role, branch_id, is_active, "createdAt", "updatedAt"`,
      [newUsername, id],
    );
    return result.rows[0] || null;
  }

  /**
   * Update password
   * @param {number} id
   * @param {string} newPassword - plain text, will be hashed
   * @returns {Promise<Object|null>}
   */
  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await query(
      `UPDATE users
       SET password = $1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, username, full_name, role, branch_id, is_active, "createdAt", "updatedAt"`,
      [hashedPassword, id],
    );
    return result.rows[0] || null;
  }

  /**
   * Verify plain password against hash
   * @param {string} plainPassword
   * @param {string} hashedPassword
   * @returns {Promise<boolean>}
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compare(plainPassword, hashedPassword);
  }

  /**
   * Get all users (without passwords)
   * @returns {Promise<Array>}
   */
  static async findAll() {
    const result = await query(
      `SELECT id, username, full_name, role, branch_id, is_active, "createdAt", "updatedAt"
       FROM users ORDER BY "createdAt" DESC`,
    );
    return result.rows;
  }

  /**
   * Delete user by ID
   * @param {number} id
   * @returns {Promise<boolean>}
   */
  static async deleteById(id) {
    const result = await query("DELETE FROM users WHERE id = $1", [id]);
    return result.rowCount > 0;
  }
}

module.exports = UserModel;

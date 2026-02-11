const { query } = require("../config/database");
const bcrypt = require("bcryptjs");

class UserModel {
  /**
   * Find user by username
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User object or null
   */
  static async findByUsername(username) {
    try {
      const result = await query("SELECT * FROM users WHERE username = $1", [
        username,
      ]);
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Find user by ID
   * @param {number} id - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  static async findById(id) {
    try {
      const result = await query(
        'SELECT id, username, role, "createdAt", "updatedAt" FROM users WHERE id = $1',
        [id],
      );
      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Create a new user
   * @param {Object} userData - User data {username, password, role}
   * @returns {Promise<Object>} Created user object (without password)
   */
  static async create(userData) {
    const { username, password, role = "user" } = userData;

    try {
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (username, password, role) 
         VALUES ($1, $2, $3) 
         RETURNING id, username, role, "createdAt", "updatedAt"`,
        [username, hashedPassword, role],
      );

      return result.rows[0];
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update username
   * @param {number} id - User ID
   * @param {string} newUsername - New username
   * @returns {Promise<Object>} Updated user object
   */
  static async updateUsername(id, newUsername) {
    try {
      const result = await query(
        `UPDATE users 
         SET username = $1, "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING id, username, role, "createdAt", "updatedAt"`,
        [newUsername, id],
      );

      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Update password
   * @param {number} id - User ID
   * @param {string} newPassword - New password (will be hashed)
   * @returns {Promise<Object>} Updated user object
   */
  static async updatePassword(id, newPassword) {
    try {
      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      const result = await query(
        `UPDATE users 
         SET password = $1, "updatedAt" = CURRENT_TIMESTAMP 
         WHERE id = $2 
         RETURNING id, username, role, "createdAt", "updatedAt"`,
        [hashedPassword, id],
      );

      return result.rows[0] || null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify password
   * @param {string} plainPassword - Plain text password
   * @param {string} hashedPassword - Hashed password from database
   * @returns {Promise<boolean>} True if password matches
   */
  static async verifyPassword(plainPassword, hashedPassword) {
    try {
      return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all users (without passwords)
   * @returns {Promise<Array>} Array of user objects
   */
  static async findAll() {
    try {
      const result = await query(
        'SELECT id, username, role, "createdAt", "updatedAt" FROM users ORDER BY "createdAt" DESC',
      );
      return result.rows;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete user by ID
   * @param {number} id - User ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  static async deleteById(id) {
    try {
      const result = await query("DELETE FROM users WHERE id = $1", [id]);
      return result.rowCount > 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = UserModel;

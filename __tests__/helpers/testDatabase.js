/**
 * Test Database Helpers
 * Utilities for database operations in tests
 */

const { pool, query, getClient } = require("../../src/config/database");
const fs = require("fs");
const path = require("path");

class TestDatabase {
  /**
   * Initialize test database
   * Run migrations and seed superadmin
   */
  static async init() {
    try {
      console.log("🔄 Initializing test database...");

      const initSQL = fs.readFileSync(
        path.join(__dirname, "../../src/database/migrations/init_database.sql"),
        "utf-8",
      );

      await query(initSQL);

      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash("admin123", 10);

      await query(
        "DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE username = 'gem')",
      );
      await query("DELETE FROM users WHERE username = 'gem'");

      await query(
        `INSERT INTO users (username, password, role, full_name)
         VALUES ($1, $2, 'superAdmin', 'Test SuperAdmin')`,
        ["gem", hashedPassword],
      );

      console.log("✅ Test database initialized");
    } catch (error) {
      console.error("❌ Failed to initialize test database:", error);
      throw error;
    }
  }

  /**
   * Clear all data from tables
   * Keeps schema intact
   */
  static async clear() {
    try {
      await query("SET session_replication_role = 'replica'");

      const tables = [
        "certificate_pdfs",
        "certificate_logs",
        "certificate_reservations",
        "certificate_migrations",
        "certificate_prints",
        "certificates",
        "students",
        "teacher_divisions",
        "teacher_branches",
        "modules",
        "sub_divisions",
        "divisions",
        "refresh_tokens",
        "database_backups",
        "login_attempts",
      ];

      for (const table of tables) {
        await query(`DELETE FROM ${table}`);
      }

      // Hapus semua user kecuali superadmin (pakai role, bukan username)
      // karena username bisa berubah akibat test change-username
      await query("DELETE FROM users WHERE role != 'superAdmin'");
      await query("DELETE FROM branches");

      await query("SET session_replication_role = 'origin'");

      // Reset superadmin username & password ke default
      const bcrypt = require("bcryptjs");
      const hashedPassword = await bcrypt.hash("admin123", 10);
      await query(
        "UPDATE users SET username = 'gem', password = $1 WHERE role = 'superAdmin'",
        [hashedPassword],
      );

      // Set users_id_seq ke nilai setelah max id yang ada
      // Tidak bisa di-reset ke 1 karena superadmin masih ada dengan id > 1
      await query(
        "SELECT setval('users_id_seq', (SELECT MAX(id) FROM users) + 1, false)",
      );

      // Reset sequences lainnya ke 1
      const sequences = [
        "branches_id_seq",
        "divisions_id_seq",
        "sub_divisions_id_seq",
        "modules_id_seq",
        "certificates_id_seq",
        "students_id_seq",
        "certificate_prints_id_seq",
        "certificate_migrations_id_seq",
        "certificate_reservations_id_seq",
        "certificate_logs_id_seq",
        "teacher_branches_id_seq",
        "teacher_divisions_id_seq",
        "database_backups_id_seq",
        "certificate_pdfs_id_seq",
        "refresh_tokens_id_seq",
      ];

      for (const seq of sequences) {
        await query(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
      }
    } catch (error) {
      console.error("❌ Failed to clear test database:", error);
      throw error;
    }
  }

  /**
   * Close database connection pool
   */
  static async close() {
    try {
      await pool.end();
      console.log("✅ Test database connection closed");
    } catch (error) {
      console.error("❌ Failed to close database connection:", error);
      throw error;
    }
  }

  /**
   * Create a test branch with admin
   */
  static async createBranch(code, name, isHeadBranch = true, parentId = null) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const branchResult = await client.query(
        `INSERT INTO branches (code, name, is_head_branch, parent_id)
         VALUES (UPPER($1), $2, $3, $4)
         RETURNING *`,
        [code, name, isHeadBranch, parentId],
      );

      const branch = branchResult.rows[0];

      let admin = null;
      if (isHeadBranch) {
        const bcrypt = require("bcryptjs");
        const password = await bcrypt.hash("admin123", 10);

        const adminResult = await client.query(
          `INSERT INTO users (username, password, role, full_name, branch_id)
           VALUES ($1, $2, 'admin', $3, $4)
           RETURNING *`,
          [`admin_${code.toLowerCase()}`, password, `Admin ${name}`, branch.id],
        );

        admin = adminResult.rows[0];
      }

      await client.query("COMMIT");

      return { branch, admin };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create a test teacher
   */
  static async createTeacher(username, branchIds = [], divisionIds = []) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const bcrypt = require("bcryptjs");
      const password = await bcrypt.hash("teacher123", 10);

      const teacherResult = await client.query(
        `INSERT INTO users (username, password, role, full_name, branch_id)
         VALUES ($1, $2, 'teacher', $3, $4)
         RETURNING *`,
        [username, password, `Teacher ${username}`, branchIds[0] || null],
      );

      const teacher = teacherResult.rows[0];

      for (const branchId of branchIds) {
        await client.query(
          `INSERT INTO teacher_branches (teacher_id, branch_id)
           VALUES ($1, $2)`,
          [teacher.id, branchId],
        );
      }

      for (const divisionId of divisionIds) {
        await client.query(
          `INSERT INTO teacher_divisions (teacher_id, division_id)
           VALUES ($1, $2)`,
          [teacher.id, divisionId],
        );
      }

      await client.query("COMMIT");

      return {
        id: teacher.id,
        username: teacher.username,
        full_name: teacher.full_name,
        role: teacher.role,
        branch_id: teacher.branch_id,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create test division with sub divisions
   */
  static async createDivision(name, adminId, subDivisions = []) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const divisionResult = await client.query(
        `INSERT INTO divisions (name, created_by)
         VALUES ($1, $2)
         RETURNING *`,
        [name, adminId],
      );

      const division = divisionResult.rows[0];

      const subs = [];
      for (const sub of subDivisions) {
        const subResult = await client.query(
          `INSERT INTO sub_divisions (division_id, name, age_min, age_max)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [division.id, sub.name, sub.age_min, sub.age_max],
        );
        subs.push(subResult.rows[0]);
      }

      await client.query("COMMIT");

      return { division, sub_divisions: subs };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = TestDatabase;

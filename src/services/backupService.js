const { query, getClient } = require("../config/database");
const BranchModel = require("../models/branchModel");
const UserModel = require("../models/userModel");
const { exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`[Backup] Created backup directory: ${BACKUP_DIR}`);
}

class BackupService {
  static async _validateBackupPermission(adminId) {
    const adminResult = await query("SELECT branch_id, role FROM users WHERE id = $1", [adminId]);
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    const branch = await BranchModel.findById(admin.branch_id);
    if (!branch || !branch.is_head_branch) {
      throw new Error("Only head branch admins can create backups");
    }

    if (!branch.is_active) {
      throw new Error("Branch is inactive");
    }

    return { admin, branch };
  }

  /**
   * FIXED: Use file_path instead of filepath in INSERT
   * Password dikirim via env option execAsync, BUKAN via string interpolation.
   */
  static async createBackup(adminId, description = null) {
    const { admin, branch } = await this._validateBackupPermission(adminId);

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${branch.code}_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);

    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || "5432",
      database: process.env.DB_NAME || "saas_certificate",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

    const pgDumpCmd = ["pg_dump", "-h", dbConfig.host, "-p", String(dbConfig.port), "-U", dbConfig.user, "-d", dbConfig.database, "-F", "c", "-f", filePath].join(" ");

    try {
      console.log(`[Backup] Starting backup for branch ${branch.code}...`);

      await execAsync(pgDumpCmd, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000,
        env: {
          ...process.env,
          PGPASSWORD: dbConfig.password,
        },
      });

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // FIXED: Use file_path and add branch_id
      const recordResult = await query(
        `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename, file_size, description, created_at AS "createdAt"`,
        [filename, filePath, fileSize, adminId, branch.id, description],
      );

      const backup = recordResult.rows[0];

      console.log(`[Backup] Backup created successfully: ${filename} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

      return {
        backup: {
          id: backup.id,
          filename: backup.filename,
          file_size: backup.file_size,
          file_size_mb: (backup.file_size / 1024 / 1024).toFixed(2),
          description: backup.description,
          createdAt: backup.createdAt,
        },
        branch: {
          id: branch.id,
          code: branch.code,
          name: branch.name,
        },
      };
    } catch (error) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (error.killed) {
        throw new Error("Backup timeout: Operation took longer than 5 minutes");
      }

      if (error.message.includes("pg_dump") && error.message.includes("not found")) {
        throw new Error("pg_dump command not found. Please ensure PostgreSQL client tools are installed.");
      }

      if (error.code === "ENOENT") {
        throw new Error("pg_dump command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * FIXED: Use file_path in SELECT
   */
  static async listBackups(adminId) {
    const { branch } = await this._validateBackupPermission(adminId);

    const result = await query(
      `SELECT 
         db.id,
         db.filename,
         db.file_size,
         db.description,
         db.created_by,
         u.username AS created_by_username,
         u.full_name AS created_by_name,
         db.created_at AS "createdAt"
       FROM database_backups db
       JOIN users u ON db.created_by = u.id
       WHERE db.branch_id = $1
       ORDER BY db.created_at DESC`,
      [branch.id],
    );

    const backups = result.rows.map((b) => ({
      id: b.id,
      filename: b.filename,
      file_size: b.file_size,
      file_size_mb: (b.file_size / 1024 / 1024).toFixed(2),
      description: b.description,
      created_by: {
        id: b.created_by,
        username: b.created_by_username,
        name: b.created_by_name,
      },
      createdAt: b.createdAt,
    }));

    return {
      backups,
      total: backups.length,
      branch: {
        id: branch.id,
        code: branch.code,
        name: branch.name,
      },
    };
  }

  /**
   * FIXED: Use file_path in queries
   */
  static async restoreBackup(adminId, backupId, confirmPassword) {
    const { admin, branch } = await this._validateBackupPermission(adminId);

    if (!confirmPassword) {
      throw new Error("Password confirmation is required for database restore");
    }

    const userWithPassword = await query("SELECT password FROM users WHERE id = $1", [adminId]);
    const isPasswordValid = await bcrypt.compare(confirmPassword, userWithPassword.rows[0].password);

    if (!isPasswordValid) {
      throw new Error("Invalid password. Restore operation cancelled.");
    }

    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // FIXED: Use file_path
    if (!fs.existsSync(backup.file_path)) {
      throw new Error("Backup file does not exist on disk");
    }

    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || "5432",
      database: process.env.DB_NAME || "saas_certificate",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

    const pgRestoreCmd = ["pg_restore", "-h", dbConfig.host, "-p", String(dbConfig.port), "-U", dbConfig.user, "-d", dbConfig.database, "--clean", "--if-exists", backup.file_path].join(" ");

    try {
      console.log(`[Backup] Starting database restore from ${backup.filename}...`);
      console.warn("[Backup] ⚠️  This will overwrite the current database!");

      await execAsync(pgRestoreCmd, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000,
        env: {
          ...process.env,
          PGPASSWORD: dbConfig.password,
        },
      });

      try {
        // FIXED: Use file_path
        await query(
          `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`RESTORE_${backup.filename}`, backup.file_path, backup.file_size, adminId, branch.id, `Restored from backup ID ${backupId}`],
        );
      } catch (logError) {
        console.warn("[Backup] Could not log restore action:", logError.message);
      }

      console.log(`[Backup] Database restored successfully from ${backup.filename}`);

      return {
        message: "Database restored successfully",
        backup: {
          id: backup.id,
          filename: backup.filename,
          createdAt: backup.created_at,
        },
        restoredAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error.killed) {
        throw new Error("Restore timeout: Operation took longer than 10 minutes");
      }

      if (error.message.includes("pg_restore") && error.message.includes("not found")) {
        throw new Error("pg_restore command not found. Please ensure PostgreSQL client tools are installed.");
      }

      if (error.code === "ENOENT") {
        throw new Error("pg_restore command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  /**
   * FIXED: Use file_path in queries
   */
  static async deleteBackup(adminId, backupId) {
    const { branch } = await this._validateBackupPermission(adminId);

    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // FIXED: Use file_path
    if (fs.existsSync(backup.file_path)) {
      fs.unlinkSync(backup.file_path);
      console.log(`[Backup] Deleted backup file: ${backup.filename}`);
    }

    await query("DELETE FROM database_backups WHERE id = $1", [backupId]);
  }

  /**
   * FIXED: Use file_path in return
   */
  static async getBackupFile(adminId, backupId) {
    const { branch } = await this._validateBackupPermission(adminId);

    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // FIXED: Use file_path
    if (!fs.existsSync(backup.file_path)) {
      throw new Error("Backup file does not exist on disk");
    }

    return {
      filePath: backup.file_path,
      filename: backup.filename,
    };
  }
}

module.exports = BackupService;

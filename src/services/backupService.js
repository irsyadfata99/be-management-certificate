const { query, getClient } = require("../config/database");
const BranchModel = require("../models/branchModel");
const UserModel = require("../models/userModel");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");

const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  logger.info("Created backup directory", { path: BACKUP_DIR });
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
   * SECURITY FIX: Use spawn with array args instead of string concatenation
   * Prevents command injection attacks
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

    // SECURITY: Use array of arguments, not string concatenation
    const pgDumpArgs = [
      "-h",
      dbConfig.host,
      "-p",
      String(dbConfig.port),
      "-U",
      dbConfig.user,
      "-d",
      dbConfig.database,
      "-F",
      "c", // Custom format
      "-f",
      filePath, // Output file
    ];

    try {
      logger.info("Starting backup", { branch: branch.code, filename });

      // SECURITY FIX: Use spawn instead of exec to prevent command injection
      await new Promise((resolve, reject) => {
        const pgDump = spawn("pg_dump", pgDumpArgs, {
          env: {
            ...process.env,
            PGPASSWORD: dbConfig.password, // Pass password via environment
          },
          timeout: 300000, // 5 minutes
        });

        let stderr = "";

        pgDump.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        pgDump.on("error", (error) => {
          reject(new Error(`pg_dump command failed: ${error.message}`));
        });

        pgDump.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`pg_dump exited with code ${code}: ${stderr}`));
          }
        });
      });

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      const recordResult = await query(
        `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename, file_size, description, created_at AS "createdAt"`,
        [filename, filePath, fileSize, adminId, branch.id, description],
      );

      const backup = recordResult.rows[0];

      logger.info("Backup created successfully", {
        filename,
        sizeMB: (fileSize / 1024 / 1024).toFixed(2),
        branch: branch.code,
      });

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

      if (error.message.includes("pg_dump") && error.message.includes("not found")) {
        throw new Error("pg_dump command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Backup failed: ${error.message}`);
    }
  }

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
   * SECURITY FIX: Use spawn with array args for pg_restore
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

    // SECURITY: Use array of arguments
    const pgRestoreArgs = ["-h", dbConfig.host, "-p", String(dbConfig.port), "-U", dbConfig.user, "-d", dbConfig.database, "--clean", "--if-exists", backup.file_path];

    try {
      logger.warn("Starting database restore", {
        filename: backup.filename,
        branch: branch.code,
      });

      // SECURITY FIX: Use spawn instead of exec
      await new Promise((resolve, reject) => {
        const pgRestore = spawn("pg_restore", pgRestoreArgs, {
          env: {
            ...process.env,
            PGPASSWORD: dbConfig.password,
          },
          timeout: 600000, // 10 minutes
        });

        let stderr = "";

        pgRestore.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        pgRestore.on("error", (error) => {
          reject(new Error(`pg_restore command failed: ${error.message}`));
        });

        pgRestore.on("close", (code) => {
          // pg_restore returns non-zero for warnings, check stderr
          if (code === 0 || !stderr.includes("ERROR")) {
            resolve();
          } else {
            reject(new Error(`pg_restore failed: ${stderr}`));
          }
        });
      });

      try {
        await query(
          `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [`RESTORE_${backup.filename}`, backup.file_path, backup.file_size, adminId, branch.id, `Restored from backup ID ${backupId}`],
        );
      } catch (logError) {
        logger.warn("Could not log restore action", { error: logError.message });
      }

      logger.info("Database restored successfully", { filename: backup.filename });

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
      if (error.message.includes("pg_restore") && error.message.includes("not found")) {
        throw new Error("pg_restore command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Restore failed: ${error.message}`);
    }
  }

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

    if (fs.existsSync(backup.file_path)) {
      fs.unlinkSync(backup.file_path);
      logger.info("Deleted backup file", { filename: backup.filename });
    }

    await query("DELETE FROM database_backups WHERE id = $1", [backupId]);
  }

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

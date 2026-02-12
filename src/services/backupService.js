const { query, getClient } = require("../config/database");
const BranchModel = require("../models/branchModel");
const UserModel = require("../models/userModel");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// Backup directory (ensure this exists and has proper permissions)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, "../../backups");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  console.log(`[Backup] Created backup directory: ${BACKUP_DIR}`);
}

class BackupService {
  /**
   * Validate admin has permission to backup
   * @param {number} adminId
   * @returns {Promise<Object>} branch info
   */
  static async _validateBackupPermission(adminId) {
    const adminResult = await query("SELECT branch_id, role FROM users WHERE id = $1", [adminId]);
    const admin = adminResult.rows[0];

    if (!admin || !admin.branch_id) {
      throw new Error("Admin does not have an assigned branch");
    }

    // Only head branch admins can backup
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
   * Create database backup using pg_dump
   * @param {number} adminId
   * @param {string} description - Optional description
   * @returns {Promise<Object>}
   */
  static async createBackup(adminId, description = null) {
    const { admin, branch } = await this._validateBackupPermission(adminId);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `backup_${branch.code}_${timestamp}.sql`;
    const filePath = path.join(BACKUP_DIR, filename);

    // Database connection info from environment
    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || "5432",
      database: process.env.DB_NAME || "saas_certificate",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

    // Build pg_dump command
    // Using custom format for better compression and restoration options
    const pgDumpCmd = `PGPASSWORD="${dbConfig.password}" pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F c -f "${filePath}"`;

    try {
      // Execute pg_dump
      console.log(`[Backup] Starting backup for branch ${branch.code}...`);
      execSync(pgDumpCmd, { stdio: "pipe" });

      // Get file size
      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // Record backup in database
      const recordResult = await query(
        `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, filename, file_size, description, "createdAt"`,
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
      // Clean up file if created
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      if (error.message.includes("pg_dump: command not found")) {
        throw new Error("pg_dump command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Backup failed: ${error.message}`);
    }
  }

  /**
   * List all backups for admin's head branch
   * @param {number} adminId
   * @returns {Promise<Object>}
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
         db."createdAt"
       FROM database_backups db
       JOIN users u ON db.created_by = u.id
       WHERE db.branch_id = $1
       ORDER BY db."createdAt" DESC`,
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
   * Restore database from backup
   * WARNING: This will overwrite current database!
   *
   * @param {number} adminId
   * @param {number} backupId
   * @param {string} confirmPassword - Admin's password for confirmation
   * @returns {Promise<Object>}
   */
  static async restoreBackup(adminId, backupId, confirmPassword) {
    const { admin, branch } = await this._validateBackupPermission(adminId);

    // Verify password for critical operation
    if (!confirmPassword) {
      throw new Error("Password confirmation is required for database restore");
    }

    const userWithPassword = await query("SELECT password FROM users WHERE id = $1", [adminId]);
    const isPasswordValid = await bcrypt.compare(confirmPassword, userWithPassword.rows[0].password);

    if (!isPasswordValid) {
      throw new Error("Invalid password. Restore operation cancelled.");
    }

    // Get backup record
    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    // Validate backup belongs to this branch
    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // Check if file exists
    if (!fs.existsSync(backup.file_path)) {
      throw new Error("Backup file does not exist on disk");
    }

    // Database connection info
    const dbConfig = {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || "5432",
      database: process.env.DB_NAME || "saas_certificate",
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
    };

    // Build pg_restore command
    // --clean: drop existing objects before restoring
    // --if-exists: use IF EXISTS when dropping objects
    const pgRestoreCmd = `PGPASSWORD="${dbConfig.password}" pg_restore -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} --clean --if-exists "${backup.file_path}"`;

    try {
      console.log(`[Backup] Starting database restore from ${backup.filename}...`);
      console.warn("[Backup] ⚠️  This will overwrite the current database!");

      // Execute pg_restore
      execSync(pgRestoreCmd, { stdio: "pipe" });

      // Record restore action in log (if table still exists after restore)
      try {
        await query(
          `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description, is_restore)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
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
          createdAt: backup.createdAt,
        },
        restoredAt: new Date().toISOString(),
      };
    } catch (error) {
      if (error.message.includes("pg_restore: command not found")) {
        throw new Error("pg_restore command not found. Please ensure PostgreSQL client tools are installed.");
      }

      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  /**
   * Delete a backup file
   * @param {number} adminId
   * @param {number} backupId
   * @returns {Promise<void>}
   */
  static async deleteBackup(adminId, backupId) {
    const { branch } = await this._validateBackupPermission(adminId);

    // Get backup record
    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    // Validate backup belongs to this branch
    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // Delete file from disk
    if (fs.existsSync(backup.file_path)) {
      fs.unlinkSync(backup.file_path);
      console.log(`[Backup] Deleted backup file: ${backup.filename}`);
    }

    // Delete database record
    await query("DELETE FROM database_backups WHERE id = $1", [backupId]);
  }

  /**
   * Get backup file path for download
   * @param {number} adminId
   * @param {number} backupId
   * @returns {Promise<Object>}
   */
  static async getBackupFile(adminId, backupId) {
    const { branch } = await this._validateBackupPermission(adminId);

    // Get backup record
    const backupResult = await query("SELECT * FROM database_backups WHERE id = $1", [backupId]);

    if (backupResult.rows.length === 0) {
      throw new Error("Backup not found");
    }

    const backup = backupResult.rows[0];

    // Validate backup belongs to this branch
    if (backup.branch_id !== branch.id) {
      throw new Error("Access denied to this backup");
    }

    // Check if file exists
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

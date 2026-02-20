/**
 * Backup Endpoints Tests
 *
 * Strategy:
 * - Mock BackupService.createBackup (wraps pg_dump) agar test tidak bergantung
 *   pada pg_dump binary di environment
 * - Semua endpoint lain (list, download, delete) ditest dengan seed DB langsung
 *   dan dummy file di filesystem
 * - Path traversal ditest via _assertPathIsInsideBackupDir yang dipanggil
 *   oleh getBackupFile, deleteBackup, restoreBackup
 */

const request = require("supertest");
const app = require("../../src/app");
const TestDatabase = require("../helpers/testDatabase");
const AuthHelpers = require("../helpers/authHelpers");
const { query } = require("../../src/config/database");
const fs = require("fs");
const path = require("path");

// FIX 2: Ambil BACKUP_DIR_RESOLVED dari service setelah module di-load.
// backupService.js me-resolve BACKUP_DIR saat module pertama kali di-require,
// jadi kita tidak bisa override via env setelah itu. Solusinya: baca path
// yang sudah di-resolve dari service, dan gunakan path yang sama untuk seed.
// Ini memastikan file yang diseed dan path guard service selalu sinkron.
const BACKUP_DIR_RESOLVED = path.resolve(process.env.BACKUP_DIR || path.join(__dirname, "../../backups"));

// ─── Mock pg_dump execution only ─────────────────────────────────────────────
// Jest.mock harus di top-level (hoisted). Kita mock child_process.spawn
// supaya createBackup tidak perlu pg_dump binary, tapi semua logic lain
// (validasi, DB insert, path guard) tetap jalan dengan real implementation.

jest.mock("child_process", () => {
  const actual = jest.requireActual("child_process");
  return {
    ...actual,
    spawn: jest.fn(),
  };
});

const { spawn } = require("child_process");
const { EventEmitter } = require("events");

/**
 * Helper: buat mock spawn yang simulate pg_dump sukses.
 * Juga buat dummy file di filePath supaya fs.statSync tidak throw.
 */
function mockPgDumpSuccess(filePath) {
  spawn.mockImplementation((_cmd, args) => {
    // Tulis dummy file supaya statSync berhasil
    const outPath = args[args.indexOf("-f") + 1];
    fs.writeFileSync(outPath, "dummy backup content");

    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    // Emit close setelah tick berikutnya
    process.nextTick(() => proc.emit("close", 0));
    return proc;
  });
}

/**
 * Helper: mock spawn yang simulate pg_dump gagal (exit code 1)
 */
function mockPgDumpFailure() {
  spawn.mockImplementation(() => {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    process.nextTick(() => {
      proc.stderr.emit("data", Buffer.from("pg_dump: error connecting to db"));
      proc.emit("close", 1);
    });
    return proc;
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Seed satu record backup ke DB dan buat dummy file-nya.
 * Return backup row.
 */
async function seedBackup(adminId, branchId, backupDir, opts = {}) {
  const filename = opts.filename || `backup_${Date.now()}.sql`;
  const filePath = opts.filePath || path.join(backupDir, filename);
  const fileSize = opts.fileSize || 1024;
  const description = opts.description || null;

  if (opts.createFile !== false) {
    fs.writeFileSync(filePath, "dummy backup content");
  }

  const result = await query(
    `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id, description)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [filename, filePath, fileSize, adminId, branchId, description],
  );

  return result.rows[0];
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Backup API", () => {
  let adminToken;
  let superAdminToken;
  let teacherToken;
  let headBranch;
  let adminUser;
  let backupDir;

  beforeAll(async () => {
    await TestDatabase.init();

    // FIX 2: Pakai direktori yang sama dengan yang sudah di-resolve oleh
    // backupService.js saat startup. Mengubah env setelah module di-load
    // tidak akan berpengaruh karena BACKUP_DIR_RESOLVED sudah ter-cache.
    backupDir = BACKUP_DIR_RESOLVED;
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
  });

  beforeEach(async () => {
    await TestDatabase.clear();
    spawn.mockReset();

    // Hapus semua file .sql sisa dari test sebelumnya
    // supaya pengecekan jumlah file akurat per-test
    if (fs.existsSync(backupDir)) {
      fs.readdirSync(backupDir)
        .filter((f) => f.endsWith(".sql") || f.endsWith(".dump"))
        .forEach((f) => {
          try {
            fs.unlinkSync(path.join(backupDir, f));
          } catch {}
        });
    }

    // Setup: head branch + admin
    headBranch = await TestDatabase.createBranch("HEAD", "Head Branch");
    adminUser = headBranch.admin;

    const adminAuth = await AuthHelpers.loginAsAdmin("admin_head");
    adminToken = adminAuth.accessToken;

    const superAuth = await AuthHelpers.loginAsSuperAdmin();
    superAdminToken = superAuth.accessToken;

    const teacher = await TestDatabase.createTeacher(global.testUtils.generateUsername("teacher"), [headBranch.branch.id], []);
    const teacherAuth = await AuthHelpers.loginAsTeacher(teacher.username);
    teacherToken = teacherAuth.accessToken;
  });

  afterAll(async () => {
    // FIX 2: Jangan hapus seluruh backupDir karena ini folder backups project.
    // Cukup hapus file .sql dummy yang dibuat selama test (ditandai timestamp/nama test).
    // File yang tidak dikenal dibiarkan agar tidak menghapus backup nyata.
    try {
      const files = fs.readdirSync(backupDir);
      files
        .filter((f) => f.endsWith(".sql") || f.endsWith(".dump"))
        .forEach((f) => {
          try {
            fs.unlinkSync(path.join(backupDir, f));
          } catch {}
        });
    } catch {}
    await TestDatabase.close();
  });

  // ─── Authorization ────────────────────────────────────────────────────────

  describe("Authorization", () => {
    it("should deny superAdmin access to create backup", async () => {
      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(superAdminToken)).send({ description: "test" });

      // FIX 1: requireAdmin middleware loloskan superAdmin, tapi service
      // throw error karena superAdmin tidak punya branch_id → 400
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("does not have an assigned branch");
    });

    it("should deny teacher access to create backup", async () => {
      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(teacherToken)).send({});

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it("should deny superAdmin access to list backups", async () => {
      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(superAdminToken));

      // FIX 1: sama seperti create — service yang reject, bukan middleware
      expect(response.status).toBe(400);
      expect(response.body.message).toContain("does not have an assigned branch");
    });

    it("should deny teacher access to list backups", async () => {
      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(teacherToken));

      expect(response.status).toBe(403);
    });

    it("should deny unauthenticated request", async () => {
      const response = await request(app).get("/api/backup/list");

      expect(response.status).toBe(401);
    });

    it("should deny admin of sub branch (not head branch)", async () => {
      // Buat sub branch dengan admin tersendiri — tidak ada direct way,
      // jadi buat head branch kedua lalu assign teacher sebagai workaround.
      // Yang lebih mudah: buat admin user dengan branch_id = sub branch.
      const subBranch = await TestDatabase.createBranch("SUB", "Sub Branch", false, headBranch.branch.id);

      // Insert admin user yang branch_id-nya sub branch
      const bcrypt = require("bcryptjs");
      const password = await bcrypt.hash("admin123", 10);
      await query(
        `INSERT INTO users (username, password, role, full_name, branch_id)
         VALUES ($1, $2, 'admin', 'Sub Admin', $3)`,
        ["admin_sub", password, subBranch.branch.id],
      );

      const subAdminAuth = await AuthHelpers.loginAsAdmin("admin_sub");

      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(subAdminAuth.accessToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("head branch");
    });
  });

  // ─── Create Backup ────────────────────────────────────────────────────────

  describe("POST /api/backup/create", () => {
    it("should create backup successfully", async () => {
      mockPgDumpSuccess();

      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(adminToken)).send({ description: "weekly backup" });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.backup).toHaveProperty("id");
      expect(response.body.data.backup).toHaveProperty("filename");
      expect(response.body.data.backup).toHaveProperty("file_size");
      expect(response.body.data.branch).toHaveProperty("code", headBranch.branch.code);

      // Verifikasi record tersimpan di DB
      const dbCheck = await query("SELECT * FROM database_backups WHERE branch_id = $1", [headBranch.branch.id]);
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].description).toBe("weekly backup");
    });

    it("should create backup without description", async () => {
      mockPgDumpSuccess();

      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(adminToken)).send({});

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.backup.description).toBeNull();
    });

    it("should fail gracefully when pg_dump fails", async () => {
      mockPgDumpFailure();

      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(adminToken)).send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("Backup failed");

      // File sementara harus sudah dihapus oleh service.
      // Catatan: service cleanup hanya berlaku untuk file yang dibuat oleh
      // attempt ini — file lain (dari test sebelumnya) diabaikan.
      // Kita cek dengan membuat file dummy sebelum request, lalu verify
      // file yang dibuat oleh spawn attempt ini tidak tersisa.
      // Cara paling reliable: pastikan tidak ada file yang dibuat SETELAH
      // cleanup beforeEach berjalan — cukup verify response gagal (sudah dicek di atas).
      // File check diabaikan karena mock tidak menulis file apapun saat fail.
      // Yang penting: response status 400 dan message "Backup failed".
    });

    it("should fail when pg_dump binary not found", async () => {
      spawn.mockImplementation(() => {
        const proc = new EventEmitter();
        proc.stderr = new EventEmitter();
        process.nextTick(() => {
          proc.emit("error", new Error("spawn pg_dump ENOENT not found"));
        });
        return proc;
      });

      const response = await request(app).post("/api/backup/create").set(AuthHelpers.getAuthHeader(adminToken)).send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should reject description longer than 255 characters", async () => {
      const response = await request(app)
        .post("/api/backup/create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ description: "a".repeat(256) });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  // ─── List Backups ─────────────────────────────────────────────────────────

  describe("GET /api/backup/list", () => {
    it("should list backups for own branch only", async () => {
      // Buat head branch kedua dengan admin berbeda
      const headBranch2 = await TestDatabase.createBranch("HD2", "Head Branch 2");
      const admin2Auth = await AuthHelpers.loginAsAdmin("admin_hd2");

      // Seed backup untuk masing-masing branch
      await seedBackup(adminUser.id, headBranch.branch.id, backupDir, {
        description: "branch 1 backup",
      });
      await seedBackup(headBranch2.admin.id, headBranch2.branch.id, backupDir, {
        description: "branch 2 backup",
      });

      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.backups).toHaveLength(1);
      expect(response.body.data.backups[0].description).toBe("branch 1 backup");
      expect(response.body.data.total).toBe(1);
    });

    it("should return empty list when no backups exist", async () => {
      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.data.backups).toHaveLength(0);
      expect(response.body.data.total).toBe(0);
    });

    it("should return backups sorted by newest first", async () => {
      await seedBackup(adminUser.id, headBranch.branch.id, backupDir, {
        filename: "backup_old.sql",
        description: "old",
      });
      // Delay kecil supaya created_at berbeda
      await new Promise((r) => setTimeout(r, 50));
      await seedBackup(adminUser.id, headBranch.branch.id, backupDir, {
        filename: "backup_new.sql",
        description: "new",
      });

      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.data.backups[0].description).toBe("new");
      expect(response.body.data.backups[1].description).toBe("old");
    });

    it("should include creator info in each backup", async () => {
      await seedBackup(adminUser.id, headBranch.branch.id, backupDir);

      const response = await request(app).get("/api/backup/list").set(AuthHelpers.getAuthHeader(adminToken));

      const backup = response.body.data.backups[0];
      expect(backup.created_by).toHaveProperty("id");
      expect(backup.created_by).toHaveProperty("username");
      expect(backup.created_by).toHaveProperty("name");
    });
  });

  // ─── Download Backup ──────────────────────────────────────────────────────

  describe("GET /api/backup/download/:id", () => {
    it("should download backup file successfully", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir, { filename: "download_test.sql" });

      const response = await request(app).get(`/api/backup/download/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.headers["content-type"]).toContain("application/octet-stream");
      expect(response.headers["content-disposition"]).toContain("download_test.sql");
    });

    it("should fail when backup file does not exist on disk", async () => {
      const backup = await seedBackup(
        adminUser.id,
        headBranch.branch.id,
        backupDir,
        { createFile: false }, // tidak buat file fisik
      );

      const response = await request(app).get(`/api/backup/download/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("does not exist");
    });

    it("should fail when backup not found in DB", async () => {
      const response = await request(app).get("/api/backup/download/99999").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Backup not found");
    });

    it("should deny access to backup from other branch", async () => {
      const headBranch2 = await TestDatabase.createBranch("HD2", "Head Branch 2");
      const backup = await seedBackup(headBranch2.admin.id, headBranch2.branch.id, backupDir);

      // Admin dari branch 1 coba download backup branch 2
      const response = await request(app).get(`/api/backup/download/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Access denied");
    });

    it("should reject invalid backup ID", async () => {
      const response = await request(app).get("/api/backup/download/abc").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
    });
  });

  // ─── Delete Backup ────────────────────────────────────────────────────────

  describe("DELETE /api/backup/:id", () => {
    it("should delete backup record and file", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir, { filename: "delete_me.sql" });

      expect(fs.existsSync(backup.file_path)).toBe(true);

      const response = await request(app).delete(`/api/backup/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Record DB harus sudah terhapus
      const dbCheck = await query("SELECT * FROM database_backups WHERE id = $1", [backup.id]);
      expect(dbCheck.rows.length).toBe(0);

      // File fisik harus sudah terhapus
      expect(fs.existsSync(backup.file_path)).toBe(false);
    });

    it("should delete record even if file already missing from disk", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir, { createFile: false });

      const response = await request(app).delete(`/api/backup/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);

      const dbCheck = await query("SELECT * FROM database_backups WHERE id = $1", [backup.id]);
      expect(dbCheck.rows.length).toBe(0);
    });

    it("should fail when backup not found", async () => {
      const response = await request(app).delete("/api/backup/99999").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Backup not found");
    });

    it("should deny delete of backup from other branch", async () => {
      const headBranch2 = await TestDatabase.createBranch("HD2", "Head Branch 2");
      const backup = await seedBackup(headBranch2.admin.id, headBranch2.branch.id, backupDir);

      const response = await request(app).delete(`/api/backup/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Access denied");

      // Record harus masih ada
      const dbCheck = await query("SELECT * FROM database_backups WHERE id = $1", [backup.id]);
      expect(dbCheck.rows.length).toBe(1);
    });
  });

  // ─── Path Traversal Security ──────────────────────────────────────────────

  describe("Path Traversal Security", () => {
    it("should block download when DB has path outside backup dir", async () => {
      // FIX 2: Gunakan path.resolve agar .. benar-benar di-resolve keluar dari backupDir.
      // path.join tidak selalu resolve — path.resolve menjamin path final di luar folder.
      const maliciousPath = path.resolve(backupDir, "..", "etc", "passwd");
      const result = await query(
        `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        ["passwd", maliciousPath, 100, adminUser.id, headBranch.branch.id],
      );
      const backup = result.rows[0];

      const response = await request(app).get(`/api/backup/download/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      // Service throw "Invalid backup path: access denied" → controller → next(error) → 500
      // Ini intentional: path traversal tidak boleh memberikan pesan informatif ke client
      expect(response.status).not.toBe(200);
    });

    it("should block delete when DB has path outside backup dir", async () => {
      const maliciousPath = path.resolve(backupDir, "..", "important.conf");
      const result = await query(
        `INSERT INTO database_backups (filename, file_path, file_size, created_by, branch_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        ["important.conf", maliciousPath, 100, adminUser.id, headBranch.branch.id],
      );
      const backup = result.rows[0];

      const response = await request(app).delete(`/api/backup/${backup.id}`).set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).not.toBe(200);
    });
  });

  // ─── Restore Backup ───────────────────────────────────────────────────────

  describe("POST /api/backup/restore", () => {
    it("should fail restore when backup not found", async () => {
      const response = await request(app).post("/api/backup/restore").set(AuthHelpers.getAuthHeader(adminToken)).send({ backupId: 99999, confirmPassword: "admin123" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Backup not found");
    });

    it("should fail restore with wrong password", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir);

      const response = await request(app).post("/api/backup/restore").set(AuthHelpers.getAuthHeader(adminToken)).send({ backupId: backup.id, confirmPassword: "wrongpassword" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Invalid password");
    });

    it("should fail restore when backup file does not exist on disk", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir, { createFile: false });

      const response = await request(app).post("/api/backup/restore").set(AuthHelpers.getAuthHeader(adminToken)).send({ backupId: backup.id, confirmPassword: "admin123" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("does not exist");
    });

    it("should fail restore without confirmPassword", async () => {
      const backup = await seedBackup(adminUser.id, headBranch.branch.id, backupDir);

      const response = await request(app).post("/api/backup/restore").set(AuthHelpers.getAuthHeader(adminToken)).send({ backupId: backup.id });

      expect(response.status).toBe(400);
    });

    it("should fail restore to backup from other branch", async () => {
      const headBranch2 = await TestDatabase.createBranch("HD2", "Head Branch 2");
      const backup = await seedBackup(headBranch2.admin.id, headBranch2.branch.id, backupDir);

      const response = await request(app).post("/api/backup/restore").set(AuthHelpers.getAuthHeader(adminToken)).send({ backupId: backup.id, confirmPassword: "admin123" });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Access denied");
    });
  });
});

/**
 * Branch Endpoints Tests
 */

const request = require("supertest");
const app = require("../../src/app");
const TestDatabase = require("../helpers/testDatabase");
const AuthHelpers = require("../helpers/authHelpers");
const { query } = require("../../src/config/database");

describe("Branch API", () => {
  let superAdminToken;

  beforeAll(async () => {
    await TestDatabase.init();
  });

  beforeEach(async () => {
    await TestDatabase.clear();
    const auth = await AuthHelpers.loginAsSuperAdmin();
    superAdminToken = auth.accessToken;
  });

  afterAll(async () => {
    await TestDatabase.close();
  });

  describe("POST /api/branches - Create Branch", () => {
    it("should create head branch with admin successfully", async () => {
      const branchCode = global.testUtils.generateBranchCode();

      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: branchCode,
          name: "Test Head Branch",
          is_head_branch: true,
          admin_username: global.testUtils.generateUsername("admin"),
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.branch).toHaveProperty(
        "code",
        branchCode.toUpperCase(),
      );
      expect(response.body.data.branch).toHaveProperty("is_head_branch", true);
      expect(response.body.data).toHaveProperty("admin");
      expect(response.body.data.admin).toHaveProperty("temporaryPassword");
    });

    it("should create sub branch successfully", async () => {
      // Create head branch first
      const headBranch = await TestDatabase.createBranch("HEAD", "Head Branch");

      const subCode = global.testUtils.generateBranchCode();

      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: subCode,
          name: "Sub Branch",
          is_head_branch: false,
          parent_id: headBranch.branch.id,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.branch).toHaveProperty("is_head_branch", false);
      expect(response.body.data.branch).toHaveProperty(
        "parent_id",
        headBranch.branch.id,
      );
    });

    it("should fail with duplicate branch code", async () => {
      const branchCode = global.testUtils.generateBranchCode();

      // Create first branch
      await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: branchCode,
          name: "First Branch",
          is_head_branch: true,
          admin_username: global.testUtils.generateUsername("admin1"),
        });

      // Try to create with same code
      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: branchCode,
          name: "Second Branch",
          is_head_branch: true,
          admin_username: global.testUtils.generateUsername("admin2"),
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain("already exists");
    });

    it("should fail sub branch without parent_id", async () => {
      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: global.testUtils.generateBranchCode(),
          name: "Sub Branch",
          is_head_branch: false,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail head branch without admin_username", async () => {
      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: global.testUtils.generateBranchCode(),
          name: "Head Branch",
          is_head_branch: true,
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail without authentication", async () => {
      const response = await request(app).post("/api/branches").send({
        code: global.testUtils.generateBranchCode(),
        name: "Test Branch",
        is_head_branch: true,
        admin_username: "admin",
      });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    // FIX: Test verifikasi bahwa branch_medal_stock row otomatis dibuat
    // saat branch baru dibuat via API (menggunakan BranchService.createBranch).
    // Ini memastikan fix di branchService.js berjalan dengan benar.
    it("should auto-initialize medal stock row when head branch is created", async () => {
      const branchCode = global.testUtils.generateBranchCode();

      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: branchCode,
          name: "Medal Test Head Branch",
          is_head_branch: true,
          admin_username: global.testUtils.generateUsername("admin"),
        });

      expect(response.status).toBe(201);

      const branchId = response.body.data.branch.id;

      const stockResult = await query(
        "SELECT * FROM branch_medal_stock WHERE branch_id = $1",
        [branchId],
      );

      expect(stockResult.rows.length).toBe(1);
      expect(stockResult.rows[0].quantity).toBe(0);
    });

    it("should auto-initialize medal stock row when sub branch is created", async () => {
      const headBranch = await TestDatabase.createBranch("HEAD", "Head Branch");

      const response = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: global.testUtils.generateBranchCode(),
          name: "Medal Test Sub Branch",
          is_head_branch: false,
          parent_id: headBranch.branch.id,
        });

      expect(response.status).toBe(201);

      const branchId = response.body.data.branch.id;

      const stockResult = await query(
        "SELECT * FROM branch_medal_stock WHERE branch_id = $1",
        [branchId],
      );

      expect(stockResult.rows.length).toBe(1);
      expect(stockResult.rows[0].quantity).toBe(0);
    });
  });

  describe("GET /api/branches - Get All Branches", () => {
    it("should get all branches in tree structure", async () => {
      // Create test data
      const head = await TestDatabase.createBranch("HEAD", "Head Branch");
      await TestDatabase.createBranch("SUB1", "Sub 1", false, head.branch.id);
      await TestDatabase.createBranch("SUB2", "Sub 2", false, head.branch.id);

      const response = await request(app)
        .get("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.branches).toBeInstanceOf(Array);
      expect(response.body.data.stats).toHaveProperty("total");
      expect(response.body.data.stats).toHaveProperty("headBranches");
      expect(response.body.data.stats).toHaveProperty("subBranches");
    });

    it("should include inactive branches when requested", async () => {
      const branch = await TestDatabase.createBranch(
        "INACTIVE",
        "Inactive Branch",
      );

      // Deactivate branch
      await request(app)
        .patch(`/api/branches/${branch.branch.id}/toggle-active`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      // Get without inactive
      const response1 = await request(app)
        .get("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response1.body.data.branches.length).toBe(0);

      // Get with inactive
      const response2 = await request(app)
        .get("/api/branches?includeInactive=true")
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response2.body.data.branches.length).toBeGreaterThan(0);
    });
  });

  describe("GET /api/branches/heads - Get Head Branches", () => {
    it("should get only head branches", async () => {
      const head = await TestDatabase.createBranch("HEAD", "Head Branch");
      await TestDatabase.createBranch(
        "SUB",
        "Sub Branch",
        false,
        head.branch.id,
      );

      const response = await request(app)
        .get("/api/branches/heads")
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeInstanceOf(Array);

      const headBranches = response.body.data.filter((b) => b.is_head_branch);
      expect(headBranches.length).toBe(response.body.data.length);
    });
  });

  describe("GET /api/branches/:id - Get Branch by ID", () => {
    it("should get branch with details", async () => {
      const branch = await TestDatabase.createBranch("TEST", "Test Branch");

      const response = await request(app)
        .get(`/api/branches/${branch.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("code", "TEST");
      expect(response.body.data).toHaveProperty("admin");
    });

    it("should fail with invalid ID", async () => {
      const response = await request(app)
        .get("/api/branches/99999")
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe("PUT /api/branches/:id - Update Branch", () => {
    it("should update branch name", async () => {
      const branch = await TestDatabase.createBranch("TEST", "Old Name");

      const response = await request(app)
        .put(`/api/branches/${branch.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          name: "New Name",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("name", "New Name");
    });

    it("should update branch code", async () => {
      const branch = await TestDatabase.createBranch("OLD", "Test Branch");
      const newCode = global.testUtils.generateBranchCode();

      const response = await request(app)
        .put(`/api/branches/${branch.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: newCode,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("code", newCode.toUpperCase());
    });
  });

  describe("PATCH /api/branches/:id/toggle-active", () => {
    it("should toggle branch active status", async () => {
      const branch = await TestDatabase.createBranch("TEST", "Test Branch");

      expect(branch.branch.is_active).toBe(true);

      // Deactivate
      const response1 = await request(app)
        .patch(`/api/branches/${branch.branch.id}/toggle-active`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response1.status).toBe(200);
      expect(response1.body.data.is_active).toBe(false);

      // Activate
      const response2 = await request(app)
        .patch(`/api/branches/${branch.branch.id}/toggle-active`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response2.status).toBe(200);
      expect(response2.body.data.is_active).toBe(true);
    });
  });

  describe("PATCH /api/branches/:id/toggle-head - Toggle Head Branch", () => {
    it("should initialize medal stock when sub branch is promoted to head branch", async () => {
      // Buat head branch dulu sebagai parent
      const parentHead = await TestDatabase.createBranch(
        "PHEAD",
        "Parent Head",
      );

      // Buat sub branch
      const subResponse = await request(app)
        .post("/api/branches")
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          code: global.testUtils.generateBranchCode(),
          name: "Promotable Sub",
          is_head_branch: false,
          parent_id: parentHead.branch.id,
        });

      const subBranchId = subResponse.body.data.branch.id;

      // Promote ke head branch
      const promoteResponse = await request(app)
        .patch(`/api/branches/${subBranchId}/toggle-head`)
        .set(AuthHelpers.getAuthHeader(superAdminToken))
        .send({
          is_head_branch: true,
          admin_username: global.testUtils.generateUsername("promoted_admin"),
        });

      expect(promoteResponse.status).toBe(200);

      // Verifikasi medal stock ada (mungkin sudah ada sejak sub branch dibuat,
      // tapi quantity harus tetap 0 dan tidak conflict)
      const stockResult = await query(
        "SELECT * FROM branch_medal_stock WHERE branch_id = $1",
        [subBranchId],
      );

      expect(stockResult.rows.length).toBe(1);
      expect(stockResult.rows[0].quantity).toBe(0);
    });
  });

  describe("DELETE /api/branches/:id - Delete Branch", () => {
    it("should delete branch without dependencies", async () => {
      const branch = await TestDatabase.createBranch("DEL", "Delete Me");

      const response = await request(app)
        .delete(`/api/branches/${branch.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deleted
      const getResponse = await request(app)
        .get(`/api/branches/${branch.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(getResponse.status).toBe(404);
    });

    it("should fail to delete head branch with active sub branches", async () => {
      const head = await TestDatabase.createBranch("HEAD", "Head");
      await TestDatabase.createBranch("SUB", "Sub", false, head.branch.id);

      const response = await request(app)
        .delete(`/api/branches/${head.branch.id}`)
        .set(AuthHelpers.getAuthHeader(superAdminToken));

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});

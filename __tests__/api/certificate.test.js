/**
 * Certificate Workflow Tests
 * Tests the complete certificate lifecycle
 */

const request = require("supertest");
const app = require("../../src/app");
const TestDatabase = require("../helpers/testDatabase");
const AuthHelpers = require("../helpers/authHelpers");

describe("Certificate Workflow", () => {
  let adminToken;
  let teacherToken;
  let headBranch;
  let subBranch;
  let division;
  let module;
  let teacher;

  beforeAll(async () => {
    await TestDatabase.init();
  });

  beforeEach(async () => {
    await TestDatabase.clear();

    // Setup test data
    headBranch = await TestDatabase.createBranch("HEAD", "Head Branch");
    subBranch = await TestDatabase.createBranch("SUB", "Sub Branch", false, headBranch.branch.id);

    // Login as admin
    const adminAuth = await AuthHelpers.loginAsAdmin(`admin_head`);
    adminToken = adminAuth.accessToken;

    // Create division
    division = await TestDatabase.createDivision("Children", headBranch.admin.id, [{ name: "Kindergarten", age_min: 5, age_max: 6 }]);

    // Create module
    const moduleResponse = await request(app).post("/api/modules").set(AuthHelpers.getAuthHeader(adminToken)).send({
      module_code: "ENG-001",
      name: "English Level 1",
      division_id: division.division.id,
      sub_div_id: division.sub_divisions[0].id,
    });

    module = moduleResponse.body.data;

    // Create teacher
    teacher = await TestDatabase.createTeacher(global.testUtils.generateUsername("teacher"), [subBranch.branch.id], [division.division.id]);

    // Login as teacher
    const teacherAuth = await AuthHelpers.loginAsTeacher(teacher.username);
    teacherToken = teacherAuth.accessToken;
  });

  afterAll(async () => {
    await TestDatabase.close();
  });

  describe("Complete Certificate Lifecycle", () => {
    it("should complete full workflow: create → migrate → reserve → print", async () => {
      // Step 1: Admin creates certificates
      const createResponse = await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 10,
      });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.count).toBe(10);

      // Step 2: Admin migrates certificates to sub branch
      const migrateResponse = await request(app).post("/api/certificates/migrate").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: "No. 000001",
        endNumber: "No. 000005",
        toBranchId: subBranch.branch.id,
      });
      console.log("migrate error:", migrateResponse.body);
      expect(migrateResponse.status).toBe(200);
      expect(migrateResponse.body.data.count).toBe(5);

      // Step 3: Teacher checks available certificates
      const availableResponse = await request(app).get("/api/certificates/available").set(AuthHelpers.getAuthHeader(teacherToken));

      expect(availableResponse.status).toBe(200);
      expect(availableResponse.body.data.branches).toBeInstanceOf(Array);

      const subBranchStock = availableResponse.body.data.branches.find((b) => b.branch_id === subBranch.branch.id);
      expect(subBranchStock).toBeDefined();
      expect(parseInt(subBranchStock.stock.in_stock)).toBe(5);

      // Step 4: Teacher reserves certificate
      const reserveResponse = await request(app).post("/api/certificates/reserve").set(AuthHelpers.getAuthHeader(teacherToken)).send({
        branchId: subBranch.branch.id,
      });

      expect(reserveResponse.status).toBe(200);
      expect(reserveResponse.body.data.certificate).toHaveProperty("certificate_number");

      const certificateId = reserveResponse.body.data.certificate.id;
      const certificateNumber = reserveResponse.body.data.certificate.certificate_number;

      // Step 5: Teacher prints certificate
      const printResponse = await request(app).post("/api/certificates/print").set(AuthHelpers.getAuthHeader(teacherToken)).send({
        certificateId,
        studentName: "John Doe",
        moduleId: module.id,
        ptcDate: "2026-02-10",
      });

      expect(printResponse.status).toBe(200);
      expect(printResponse.body.data.print).toHaveProperty("certificate_number", certificateNumber);
      expect(printResponse.body.data.print.student).toHaveProperty("name", "John Doe");

      // Step 6: Verify stock updated
      const updatedStockResponse = await request(app).get("/api/certificates/available").set(AuthHelpers.getAuthHeader(teacherToken));

      const updatedStock = updatedStockResponse.body.data.branches.find((b) => b.branch_id === subBranch.branch.id);
      expect(parseInt(updatedStock.stock.in_stock)).toBe(4);
      expect(parseInt(updatedStock.stock.printed)).toBe(1);

      // Step 7: Verify log created
      const logsResponse = await request(app).get("/api/certificates/logs").set(AuthHelpers.getAuthHeader(teacherToken));

      expect(logsResponse.status).toBe(200);
      expect(logsResponse.body.data.logs).toBeInstanceOf(Array);
      expect(logsResponse.body.data.logs.length).toBeGreaterThan(0);

      const printLog = logsResponse.body.data.logs.find((log) => log.action_type === "print");
      expect(printLog).toBeDefined();
      expect(printLog.certificate_number).toBe(certificateNumber);
    });

    it("should enforce maximum 5 active reservations per teacher", async () => {
      // Create certificates
      await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 20,
      });

      // Migrate to sub branch
      await request(app).post("/api/certificates/migrate").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: "No. 000001",
        endNumber: "No. 000020",
        toBranchId: subBranch.branch.id,
      });

      // Reserve 5 certificates
      for (let i = 0; i < 5; i++) {
        const response = await request(app).post("/api/certificates/reserve").set(AuthHelpers.getAuthHeader(teacherToken)).send({
          branchId: subBranch.branch.id,
        });

        expect(response.status).toBe(200);
      }

      // 6th reservation should fail
      const response = await request(app).post("/api/certificates/reserve").set(AuthHelpers.getAuthHeader(teacherToken)).send({
        branchId: subBranch.branch.id,
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Maximum 5");
    });

    it("should allow teacher to release reservation", async () => {
      // Create and migrate certificates
      await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 5,
      });

      await request(app).post("/api/certificates/migrate").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: "No. 000001",
        endNumber: "No. 000005",
        toBranchId: subBranch.branch.id,
      });

      // Reserve
      const reserveResponse = await request(app).post("/api/certificates/reserve").set(AuthHelpers.getAuthHeader(teacherToken)).send({
        branchId: subBranch.branch.id,
      });

      const certificateId = reserveResponse.body.data.certificate.id;

      // Release
      const releaseResponse = await request(app).post(`/api/certificates/${certificateId}/release`).set(AuthHelpers.getAuthHeader(teacherToken));

      expect(releaseResponse.status).toBe(200);

      // Check stock restored
      const stockResponse = await request(app).get("/api/certificates/available").set(AuthHelpers.getAuthHeader(teacherToken));

      const stock = stockResponse.body.data.branches.find((b) => b.branch_id === subBranch.branch.id);
      expect(parseInt(stock.stock.in_stock)).toBe(5);
    });

    it("should prevent printing without reservation", async () => {
      // Create and migrate certificates
      await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 1,
      });

      await request(app).post("/api/certificates/migrate").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: "No. 000001",
        endNumber: "No. 000001",
        toBranchId: subBranch.branch.id,
      });

      // Get certificate ID
      const certResponse = await request(app).get("/api/certificates").set(AuthHelpers.getAuthHeader(adminToken));

      const certificate = certResponse.body.data.certificates[0];

      // Try to print without reserving
      const printResponse = await request(app).post("/api/certificates/print").set(AuthHelpers.getAuthHeader(teacherToken)).send({
        certificateId: certificate.id,
        studentName: "John Doe",
        moduleId: module.id,
        ptcDate: "2026-02-10",
      });

      expect(printResponse.status).toBe(400);
      expect(printResponse.body.message).toContain("not reserved");
    });
  });

  describe("Stock Management", () => {
    it("should get stock summary with accurate counts", async () => {
      // Create certificates
      await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 20,
      });

      // Migrate some to sub branch
      await request(app).post("/api/certificates/migrate").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: "No. 000001",
        endNumber: "No. 000010",
        toBranchId: subBranch.branch.id,
      });

      const response = await request(app).get("/api/certificates/stock").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.data.head_branch).toBeDefined();
      expect(response.body.data.sub_branches).toBeInstanceOf(Array);

      const headStock = response.body.data.head_branch.stock;
      expect(parseInt(headStock.in_stock)).toBe(10);

      const subStock = response.body.data.sub_branches.find((b) => b.branch_id === subBranch.branch.id).stock;
      expect(parseInt(subStock.in_stock)).toBe(10);
    });

    it("should get stock alerts for low inventory", async () => {
      // Create only 3 certificates
      await request(app).post("/api/certificates/bulk-create").set(AuthHelpers.getAuthHeader(adminToken)).send({
        startNumber: 1,
        endNumber: 3,
      });

      const response = await request(app).get("/api/certificates/stock-alerts?threshold=5").set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.data.alerts).toBeInstanceOf(Array);
      expect(response.body.data.summary.total_alerts).toBeGreaterThan(0);
    });
  });
});

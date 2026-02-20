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

    // createBranch("HEAD", ...) → admin username = "admin_head" (pola: admin_${code.toLowerCase()})
    headBranch = await TestDatabase.createBranch("HEAD", "Head Branch");
    subBranch = await TestDatabase.createBranch(
      "SUB",
      "Sub Branch",
      false,
      headBranch.branch.id,
    );

    const adminAuth = await AuthHelpers.loginAsAdmin("admin_head");
    adminToken = adminAuth.accessToken;

    division = await TestDatabase.createDivision(
      "Children",
      headBranch.admin.id,
      [{ name: "Kindergarten", age_min: 5, age_max: 6 }],
    );

    // POST /api/modules → { success, data: { id, module_code, name, ... } }
    const moduleResponse = await request(app)
      .post("/api/modules")
      .set(AuthHelpers.getAuthHeader(adminToken))
      .send({
        module_code: "ENG-001",
        name: "English Level 1",
        division_id: division.division.id,
        sub_div_id: division.sub_divisions[0].id,
      });

    expect(moduleResponse.status).toBe(201);
    module = moduleResponse.body.data;

    teacher = await TestDatabase.createTeacher(
      global.testUtils.generateUsername("teacher"),
      [subBranch.branch.id],
      [division.division.id],
    );

    const teacherAuth = await AuthHelpers.loginAsTeacher(teacher.username);
    teacherToken = teacherAuth.accessToken;
  });

  afterAll(async () => {
    await TestDatabase.close();
  });

  describe("Complete Certificate Lifecycle", () => {
    it("should complete full workflow: create → migrate → reserve → print", async () => {
      // Step 1: Create certificates
      const createResponse = await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 10 });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.data.count).toBe(10);

      // Step 2: Migrate ke sub branch
      const migrateResponse = await request(app)
        .post("/api/certificates/migrate")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({
          startNumber: "No. 000001",
          endNumber: "No. 000005",
          toBranchId: subBranch.branch.id,
        });

      expect(migrateResponse.status).toBe(200);
      expect(migrateResponse.body.data.count).toBe(5);

      // Step 3: Cek available stock
      const availableResponse = await request(app)
        .get("/api/certificates/available")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(availableResponse.status).toBe(200);
      expect(availableResponse.body.data.branches).toBeInstanceOf(Array);

      const subBranchStock = availableResponse.body.data.branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(subBranchStock).toBeDefined();
      expect(parseInt(subBranchStock.stock.in_stock)).toBe(5);

      // Step 4: Reserve
      const reserveResponse = await request(app)
        .post("/api/certificates/reserve")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({ branchId: subBranch.branch.id });

      expect(reserveResponse.status).toBe(200);
      expect(reserveResponse.body.data.certificate).toHaveProperty(
        "certificate_number",
      );

      const certificateId = reserveResponse.body.data.certificate.id;
      const certificateNumber =
        reserveResponse.body.data.certificate.certificate_number;

      // Step 5: Print
      // Guard eksplisit: jika module.id undefined maka ini yang fail, bukan 400 dari API
      expect(module).toBeDefined();
      expect(module.id).toBeDefined();

      const printResponse = await request(app)
        .post("/api/certificates/print")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          certificateId,
          studentName: "John Doe",
          moduleId: module.id,
          ptcDate: "2026-02-10",
        });

      expect(printResponse.status).toBe(200);
      expect(printResponse.body.data.print).toHaveProperty(
        "certificate_number",
        certificateNumber,
      );
      expect(printResponse.body.data.print.student).toHaveProperty(
        "name",
        "John Doe",
      );

      // Step 6: Verify stock turun
      const updatedStockResponse = await request(app)
        .get("/api/certificates/available")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      const updatedStock = updatedStockResponse.body.data.branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(parseInt(updatedStock.stock.in_stock)).toBe(4);
      expect(parseInt(updatedStock.stock.printed)).toBe(1);

      // Step 7: Verify log print ada
      const logsResponse = await request(app)
        .get("/api/certificates/logs")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(logsResponse.status).toBe(200);
      expect(logsResponse.body.data.logs).toBeInstanceOf(Array);

      const printLog = logsResponse.body.data.logs.find(
        (log) => log.action_type === "print",
      );
      expect(printLog).toBeDefined();
      expect(printLog.certificate_number).toBe(certificateNumber);
    });

    it("should enforce maximum 5 active reservations per teacher", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 20 });

      await request(app)
        .post("/api/certificates/migrate")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({
          startNumber: "No. 000001",
          endNumber: "No. 000020",
          toBranchId: subBranch.branch.id,
        });

      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post("/api/certificates/reserve")
          .set(AuthHelpers.getAuthHeader(teacherToken))
          .send({ branchId: subBranch.branch.id });
        expect(res.status).toBe(200);
      }

      // Ke-6 harus gagal
      const response = await request(app)
        .post("/api/certificates/reserve")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({ branchId: subBranch.branch.id });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain("Maximum 5");
    });

    it("should allow teacher to release reservation", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 5 });

      await request(app)
        .post("/api/certificates/migrate")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({
          startNumber: "No. 000001",
          endNumber: "No. 000005",
          toBranchId: subBranch.branch.id,
        });

      const reserveResponse = await request(app)
        .post("/api/certificates/reserve")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({ branchId: subBranch.branch.id });

      const certificateId = reserveResponse.body.data.certificate.id;

      const releaseResponse = await request(app)
        .post(`/api/certificates/${certificateId}/release`)
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(releaseResponse.status).toBe(200);

      const stockResponse = await request(app)
        .get("/api/certificates/available")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      const stock = stockResponse.body.data.branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(parseInt(stock.stock.in_stock)).toBe(5);
    });

    it("should prevent printing without reservation", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 1 });

      await request(app)
        .post("/api/certificates/migrate")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({
          startNumber: "No. 000001",
          endNumber: "No. 000001",
          toBranchId: subBranch.branch.id,
        });

      const certResponse = await request(app)
        .get("/api/certificates")
        .set(AuthHelpers.getAuthHeader(adminToken));

      const certificate = certResponse.body.data.certificates[0];

      const printResponse = await request(app)
        .post("/api/certificates/print")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          certificateId: certificate.id,
          studentName: "John Doe",
          moduleId: module.id,
          ptcDate: "2026-02-10",
        });

      expect(printResponse.status).toBe(400);
      expect(printResponse.body.message).toContain("not reserved");
    });

    // Route POST /api/certificates/:id/reprint tidak ada di certificateRoutes.js.
    // Hanya route /:id/release yang terdaftar untuk teacher.
    // Untuk mengaktifkan: tambah route + controller method, lalu hapus .skip.
    it.skip("should allow reprint of already printed certificate", () => {
      // Implementasi route reprint belum ada.
    });
  });

  describe("Stock Management", () => {
    it("should get stock summary with accurate counts", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 20 });

      await request(app)
        .post("/api/certificates/migrate")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({
          startNumber: "No. 000001",
          endNumber: "No. 000010",
          toBranchId: subBranch.branch.id,
        });

      const response = await request(app)
        .get("/api/certificates/stock")
        .set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // getStockSummary() response shape (dari certificateService.js):
      // {
      //   head_branch: {
      //     id, code, name,
      //     certificate_stock: { in_stock, reserved, printed, migrated, total },
      //     medal_stock: number,
      //     imbalance: number
      //   },
      //   sub_branches: [{
      //     branch_id, branch_code, branch_name,
      //     certificate_stock: { ... },
      //     medal_stock: number,
      //     imbalance: number
      //   }]
      // }
      const { data } = response.body;

      expect(data.head_branch).toBeDefined();
      expect(data.head_branch.certificate_stock).toBeDefined();
      expect(parseInt(data.head_branch.certificate_stock.in_stock)).toBe(10);

      expect(data.sub_branches).toBeInstanceOf(Array);
      const subStock = data.sub_branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(subStock).toBeDefined();
      expect(subStock.certificate_stock).toBeDefined();
      expect(parseInt(subStock.certificate_stock.in_stock)).toBe(10);
    });

    it("should get stock alerts for low inventory", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 3 });

      const response = await request(app)
        .get("/api/certificates/stock-alerts?threshold=5")
        .set(AuthHelpers.getAuthHeader(adminToken));

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // getStockAlerts() response shape (dari certificateService.js):
      // {
      //   certificate_alerts: [{ branch_id, branch_code, ..., severity, message }],
      //   medal_alerts: [...],
      //   summary: {
      //     total_cert_alerts, total_medal_alerts,
      //     cert_critical, cert_high, cert_medium,
      //     medal_critical, medal_high, medal_medium,
      //     total_cert_in_stock, total_medal_stock, threshold
      //   },
      //   head_branch: { id, code, name }
      // }
      const { data } = response.body;

      expect(data.certificate_alerts).toBeInstanceOf(Array);
      expect(data.medal_alerts).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.total_cert_alerts).toBeGreaterThan(0);
      expect(data.head_branch).toBeDefined();
    });
  });
});

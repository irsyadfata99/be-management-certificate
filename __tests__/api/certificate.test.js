/**
 * Certificate Workflow Tests
 * Tests the complete certificate lifecycle
 */

const request = require("supertest");
const app = require("../../src/app");
const TestDatabase = require("../helpers/testDatabase");
const AuthHelpers = require("../helpers/authHelpers");
const { query } = require("../../src/config/database");

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

      // ── Add medal stock ke subBranch sebelum print ──────────────────────
      await query(
        "UPDATE branch_medal_stock SET quantity = 10 WHERE branch_id = $1",
        [subBranch.branch.id],
      );
      // ────────────────────────────────────────────────────────────────────

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

    it("should allow reprint of already printed certificate", async () => {
      // Setup: create → migrate → medal stock → reserve → print
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

      await query(
        "UPDATE branch_medal_stock SET quantity = 10 WHERE branch_id = $1",
        [subBranch.branch.id],
      );

      const reserveResponse = await request(app)
        .post("/api/certificates/reserve")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({ branchId: subBranch.branch.id });

      expect(reserveResponse.status).toBe(200);
      const certificateId = reserveResponse.body.data.certificate.id;
      const certificateNumber =
        reserveResponse.body.data.certificate.certificate_number;

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

      // Cek medal stock berkurang 1 setelah print pertama
      const medalAfterPrint = await query(
        "SELECT quantity FROM branch_medal_stock WHERE branch_id = $1",
        [subBranch.branch.id],
      );
      expect(medalAfterPrint.rows[0].quantity).toBe(9);

      // Reprint — tidak perlu reservation, tidak consume medal
      const reprintResponse = await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "John Doe Updated",
          moduleId: module.id,
          ptcDate: "2026-02-15",
        });

      expect(reprintResponse.status).toBe(200);
      expect(reprintResponse.body.data.is_reprint).toBe(true);
      expect(reprintResponse.body.data.print).toHaveProperty(
        "certificate_number",
        certificateNumber,
      );
      expect(reprintResponse.body.data.print.student).toHaveProperty(
        "name",
        "John Doe Updated",
      );
      expect(reprintResponse.body.data.print.ptc_date).toBe("2026-02-15");

      // Medal stock tidak berubah setelah reprint
      const medalAfterReprint = await query(
        "SELECT quantity FROM branch_medal_stock WHERE branch_id = $1",
        [subBranch.branch.id],
      );
      expect(medalAfterReprint.rows[0].quantity).toBe(9);

      // Log reprint harus ada
      const logsResponse = await request(app)
        .get("/api/certificates/logs")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(logsResponse.status).toBe(200);
      const reprintLog = logsResponse.body.data.logs.find(
        (log) => log.action_type === "reprint",
      );
      expect(reprintLog).toBeDefined();
      expect(reprintLog.certificate_number).toBe(certificateNumber);
    });

    it("should prevent reprint of certificate not owned by teacher", async () => {
      // Setup: print certificate dengan teacher pertama
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

      await query(
        "UPDATE branch_medal_stock SET quantity = 10 WHERE branch_id = $1",
        [subBranch.branch.id],
      );

      const reserveResponse = await request(app)
        .post("/api/certificates/reserve")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({ branchId: subBranch.branch.id });

      const certificateId = reserveResponse.body.data.certificate.id;

      await request(app)
        .post("/api/certificates/print")
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          certificateId,
          studentName: "John Doe",
          moduleId: module.id,
          ptcDate: "2026-02-10",
        });

      // Buat teacher kedua di branch yang sama
      const teacher2 = await TestDatabase.createTeacher(
        global.testUtils.generateUsername("teacher2"),
        [subBranch.branch.id],
        [division.division.id],
      );
      const teacher2Auth = await AuthHelpers.loginAsTeacher(teacher2.username);

      // Teacher kedua coba reprint certificate milik teacher pertama
      const reprintResponse = await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacher2Auth.accessToken))
        .send({
          studentName: "Jane Doe",
          moduleId: module.id,
          ptcDate: "2026-02-15",
        });

      expect(reprintResponse.status).toBe(400);
      expect(reprintResponse.body.message).toContain("Access denied");
    });

    it("should prevent reprint of certificate that has not been printed", async () => {
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

      // Ambil certificate yang masih in_stock (belum pernah diprint)
      const certResponse = await request(app)
        .get("/api/certificates")
        .set(AuthHelpers.getAuthHeader(adminToken));

      const certificate = certResponse.body.data.certificates[0];

      const reprintResponse = await request(app)
        .post(`/api/certificates/${certificate.id}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "John Doe",
          moduleId: module.id,
          ptcDate: "2026-02-15",
        });

      expect(reprintResponse.status).toBe(400);
      expect(reprintResponse.body.message).toContain("has not been printed");
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

      const { data } = response.body;

      expect(data.certificate_alerts).toBeInstanceOf(Array);
      expect(data.medal_alerts).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.total_cert_alerts).toBeGreaterThan(0);
      expect(data.head_branch).toBeDefined();
    });
  });
});

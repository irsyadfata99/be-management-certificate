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

  // ─── Helper: setup sertifikat siap print ──────────────────────────────────

  async function setupCertificateForPrint() {
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
  }

  async function reserveAndPrint(studentName = "John Doe") {
    const reserveResponse = await request(app)
      .post("/api/certificates/reserve")
      .set(AuthHelpers.getAuthHeader(teacherToken))
      .send({ branchId: subBranch.branch.id });

    expect(reserveResponse.status).toBe(200);
    const certificateId = reserveResponse.body.data.certificate.id;

    const printResponse = await request(app)
      .post("/api/certificates/print")
      .set(AuthHelpers.getAuthHeader(teacherToken))
      .send({
        certificateId,
        studentName,
        moduleId: module.id,
        ptcDate: "2026-02-10",
      });

    expect(printResponse.status).toBe(200);
    return { certificateId, printResponse };
  }

  // ─── Complete Lifecycle ───────────────────────────────────────────────────

  describe("Complete Certificate Lifecycle", () => {
    it("should complete full workflow: create → migrate → reserve → print", async () => {
      await request(app)
        .post("/api/certificates/bulk-create")
        .set(AuthHelpers.getAuthHeader(adminToken))
        .send({ startNumber: 1, endNumber: 10 });

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

      await query(
        "UPDATE branch_medal_stock SET quantity = 10 WHERE branch_id = $1",
        [subBranch.branch.id],
      );

      const availableResponse = await request(app)
        .get("/api/certificates/available")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(availableResponse.status).toBe(200);
      const subBranchStock = availableResponse.body.data.branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(subBranchStock).toBeDefined();
      expect(parseInt(subBranchStock.stock.in_stock)).toBe(5);

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
      expect(printResponse.body.data.print).toHaveProperty(
        "certificate_number",
        certificateNumber,
      );
      expect(printResponse.body.data.print.student).toHaveProperty(
        "name",
        "John Doe",
      );

      // Verifikasi stock turun
      const updatedStockResponse = await request(app)
        .get("/api/certificates/available")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      const updatedStock = updatedStockResponse.body.data.branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(parseInt(updatedStock.stock.in_stock)).toBe(4);
      expect(parseInt(updatedStock.stock.printed)).toBe(1);

      // Verifikasi log print ada
      const logsResponse = await request(app)
        .get("/api/certificates/logs")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(logsResponse.status).toBe(200);
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
  });

  // ─── Reprint ──────────────────────────────────────────────────────────────

  describe("Reprint — History Mode", () => {
    it("should allow reprint and create a NEW row (not update existing)", async () => {
      await setupCertificateForPrint();
      const { certificateId } = await reserveAndPrint("John Doe");

      // Verifikasi: sebelum reprint, hanya 1 row di certificate_prints
      const beforeReprint = await query(
        "SELECT * FROM certificate_prints WHERE certificate_id = $1 ORDER BY printed_at ASC",
        [certificateId],
      );
      expect(beforeReprint.rows.length).toBe(1);
      expect(beforeReprint.rows[0].is_reprint).toBe(false);
      expect(beforeReprint.rows[0].student_name).toBe("John Doe");

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
      expect(reprintResponse.body.data.print.student).toHaveProperty(
        "name",
        "John Doe Updated",
      );

      // KUNCI: setelah reprint harus ada 2 rows di certificate_prints
      // Row pertama (print asli) tetap ada — tidak di-UPDATE
      const afterReprint = await query(
        "SELECT * FROM certificate_prints WHERE certificate_id = $1 ORDER BY printed_at ASC",
        [certificateId],
      );
      expect(afterReprint.rows.length).toBe(2);

      const originalPrint = afterReprint.rows[0];
      const reprintRow = afterReprint.rows[1];

      // Print asli tetap ada dan tidak berubah
      expect(originalPrint.is_reprint).toBe(false);
      expect(originalPrint.student_name).toBe("John Doe");

      // Row reprint adalah row baru dengan is_reprint=true
      expect(reprintRow.is_reprint).toBe(true);
      expect(reprintRow.student_name).toBe("John Doe Updated");
      expect(new Date(reprintRow.ptc_date).toISOString()).toContain(
        "2026-02-15",
      );
    });

    it("should allow multiple reprints and accumulate history rows", async () => {
      await setupCertificateForPrint();
      const { certificateId } = await reserveAndPrint("Original Name");

      // Reprint pertama
      await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "Reprint One",
          moduleId: module.id,
          ptcDate: "2026-02-20",
        });

      // Reprint kedua
      await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "Reprint Two",
          moduleId: module.id,
          ptcDate: "2026-02-25",
        });

      const allRows = await query(
        "SELECT * FROM certificate_prints WHERE certificate_id = $1 ORDER BY printed_at ASC",
        [certificateId],
      );

      // 1 print original + 2 reprint = 3 rows total
      expect(allRows.rows.length).toBe(3);
      expect(allRows.rows[0].is_reprint).toBe(false);
      expect(allRows.rows[1].is_reprint).toBe(true);
      expect(allRows.rows[2].is_reprint).toBe(true);
      expect(allRows.rows[0].student_name).toBe("Original Name");
      expect(allRows.rows[1].student_name).toBe("Reprint One");
      expect(allRows.rows[2].student_name).toBe("Reprint Two");
    });

    it("should not consume medal stock on reprint", async () => {
      await setupCertificateForPrint();
      const { certificateId } = await reserveAndPrint("John Doe");

      const medalBefore = await query(
        "SELECT quantity FROM branch_medal_stock WHERE branch_id = $1",
        [subBranch.branch.id],
      );
      const quantityBefore = medalBefore.rows[0].quantity;

      await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "John Doe Updated",
          moduleId: module.id,
          ptcDate: "2026-02-15",
        });

      const medalAfter = await query(
        "SELECT quantity FROM branch_medal_stock WHERE branch_id = $1",
        [subBranch.branch.id],
      );
      // Medal tidak berkurang setelah reprint
      expect(medalAfter.rows[0].quantity).toBe(quantityBefore);
    });

    it("should create reprint log entry", async () => {
      await setupCertificateForPrint();
      const { certificateId } = await reserveAndPrint("John Doe");

      await request(app)
        .post(`/api/certificates/${certificateId}/reprint`)
        .set(AuthHelpers.getAuthHeader(teacherToken))
        .send({
          studentName: "John Doe Updated",
          moduleId: module.id,
          ptcDate: "2026-02-15",
        });

      const logsResponse = await request(app)
        .get("/api/certificates/logs")
        .set(AuthHelpers.getAuthHeader(teacherToken));

      expect(logsResponse.status).toBe(200);
      const reprintLog = logsResponse.body.data.logs.find(
        (log) => log.action_type === "reprint",
      );
      expect(reprintLog).toBeDefined();
    });

    it("should prevent reprint of certificate not owned by teacher", async () => {
      await setupCertificateForPrint();
      const { certificateId } = await reserveAndPrint("John Doe");

      const teacher2 = await TestDatabase.createTeacher(
        global.testUtils.generateUsername("teacher2"),
        [subBranch.branch.id],
        [division.division.id],
      );
      const teacher2Auth = await AuthHelpers.loginAsTeacher(teacher2.username);

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

      // Histori tidak bertambah — masih 1 row
      const rows = await query(
        "SELECT * FROM certificate_prints WHERE certificate_id = $1",
        [certificateId],
      );
      expect(rows.rows.length).toBe(1);
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

  // ─── Stock Management ─────────────────────────────────────────────────────

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
      expect(parseInt(data.head_branch.certificate_stock.in_stock)).toBe(10);

      const subStock = data.sub_branches.find(
        (b) => b.branch_id === subBranch.branch.id,
      );
      expect(subStock).toBeDefined();
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
    });
  });
});

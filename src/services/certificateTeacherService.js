const { query, getClient } = require("../config/database");
const CertificateModel = require("../models/certificateModel");
const CertificatePrintModel = require("../models/certificatePrintModel");
const PaginationHelper = require("../utils/paginationHelper");
const logger = require("../utils/logger");

class CertificateTeacherService {
  // FIX [N+1]: getAvailableCertificates sebelumnya loop per branch dan
  // melakukan query terpisah untuk setiap branch_id. Sekarang satu query
  // dengan ANY($1) untuk semua branch sekaligus, lalu group di app layer.
  static async getAvailableCertificates(
    teacherId,
    {
      search = "",
      moduleId = null,
      branchId = null,
      page = 1,
      limit = 20,
    } = {},
  ) {
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    // Ambil semua branch_ids milik teacher dalam satu query
    const branchResult = await query(
      `SELECT tb.branch_id FROM teacher_branches tb WHERE tb.teacher_id = $1`,
      [teacherId],
    );

    if (branchResult.rows.length === 0) {
      return {
        certificates: [],
        pagination: PaginationHelper.buildResponse(p, l, 0),
      };
    }

    const teacherBranchIds = branchResult.rows.map((r) => r.branch_id);

    const conditions = [
      "c.is_active = true",
      "c.status = 'available'",
      "(c.branch_id = ANY($1) OR c.head_branch_id = ANY($1))",
    ];
    const params = [teacherBranchIds];
    let paramIndex = 2;

    if (search && search.trim()) {
      conditions.push(
        `(c.certificate_number ILIKE $${paramIndex} OR s.name ILIKE $${paramIndex})`,
      );
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (moduleId) {
      conditions.push(`c.module_id = $${paramIndex++}`);
      params.push(parseInt(moduleId, 10));
    }

    if (branchId) {
      conditions.push(`c.branch_id = $${paramIndex++}`);
      params.push(parseInt(branchId, 10));
    }

    const whereClause = conditions.join(" AND ");

    const [certResult, countResult] = await Promise.all([
      query(
        `SELECT
           c.id, c.certificate_number, c.status,
           c.branch_id, b.code AS branch_code, b.name AS branch_name,
           c.head_branch_id, hb.code AS head_branch_code, hb.name AS head_branch_name,
           c.module_id, m.module_code, m.name AS module_name,
           c.student_id, s.name AS student_name,
           c.created_at AS "createdAt"
         FROM certificates c
         JOIN branches b ON c.branch_id = b.id
         JOIN branches hb ON c.head_branch_id = hb.id
         JOIN modules m ON c.module_id = m.id
         LEFT JOIN students s ON c.student_id = s.id
         WHERE ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, l, offset],
      ),
      query(
        `SELECT COUNT(*)
         FROM certificates c
         LEFT JOIN students s ON c.student_id = s.id
         WHERE ${whereClause}`,
        params,
      ),
    ]);

    return {
      certificates: certResult.rows,
      pagination: PaginationHelper.buildResponse(
        p,
        l,
        parseInt(countResult.rows[0].count, 10),
      ),
    };
  }

  static async printCertificate(
    teacherId,
    { certificateId, studentId, studentName, ptcDate, moduleId },
  ) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const certResult = await client.query(
        `SELECT c.*, b.parent_id AS head_branch_id_from_parent
         FROM certificates c
         JOIN branches b ON c.branch_id = b.id
         WHERE c.id = $1 AND c.is_active = true FOR UPDATE`,
        [certificateId],
      );

      const certificate = certResult.rows[0];
      if (!certificate) throw new Error("Certificate not found");

      if (certificate.status !== "available") {
        throw new Error("Certificate is not available for printing");
      }

      // Validasi teacher punya akses ke branch sertifikat
      const accessResult = await client.query(
        `SELECT 1 FROM teacher_branches tb
         WHERE tb.teacher_id = $1
           AND (tb.branch_id = $2 OR tb.branch_id = $3)
         LIMIT 1`,
        [teacherId, certificate.branch_id, certificate.head_branch_id],
      );

      if (accessResult.rows.length === 0) {
        throw new Error("You do not have access to print this certificate");
      }

      // Validasi module sesuai
      if (moduleId && certificate.module_id !== parseInt(moduleId, 10)) {
        throw new Error("Module does not match certificate");
      }

      const print = await CertificatePrintModel.create(
        {
          certificateId,
          teacherId,
          studentId: studentId || null,
          studentName: studentName || null,
          moduleId: moduleId || certificate.module_id,
          branchId: certificate.branch_id,
          ptcDate,
          isReprint: false,
        },
        client,
      );

      await client.query(
        `UPDATE certificates SET status = 'printed', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [certificateId],
      );

      await client.query(
        `INSERT INTO certificate_logs
           (certificate_id, action_type, actor_id, actor_role, from_branch_id, metadata)
         VALUES ($1, 'print', $2, 'teacher', $3, $4)`,
        [
          certificateId,
          teacherId,
          certificate.branch_id,
          JSON.stringify({
            student_name: studentName,
            module_id: moduleId || certificate.module_id,
            ptc_date: ptcDate,
          }),
        ],
      );

      await client.query("COMMIT");
      return print;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async reprintCertificate(
    teacherId,
    { certificateId, studentId, studentName, ptcDate, moduleId },
  ) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const certResult = await client.query(
        `SELECT c.* FROM certificates c WHERE c.id = $1 AND c.is_active = true FOR UPDATE`,
        [certificateId],
      );

      const certificate = certResult.rows[0];
      if (!certificate) throw new Error("Certificate not found");

      if (certificate.status !== "printed") {
        throw new Error("Certificate has not been printed yet");
      }

      const accessResult = await client.query(
        `SELECT 1 FROM teacher_branches tb
         WHERE tb.teacher_id = $1
           AND (tb.branch_id = $2 OR tb.branch_id = $3)
         LIMIT 1`,
        [teacherId, certificate.branch_id, certificate.head_branch_id],
      );

      if (accessResult.rows.length === 0) {
        throw new Error("You do not have access to reprint this certificate");
      }

      const print = await CertificatePrintModel.create(
        {
          certificateId,
          teacherId,
          studentId: studentId || null,
          studentName: studentName || null,
          moduleId: moduleId || certificate.module_id,
          branchId: certificate.branch_id,
          ptcDate,
          isReprint: true,
        },
        client,
      );

      await client.query(
        `INSERT INTO certificate_logs
           (certificate_id, action_type, actor_id, actor_role, from_branch_id, metadata)
         VALUES ($1, 'reprint', $2, 'teacher', $3, $4)`,
        [
          certificateId,
          teacherId,
          certificate.branch_id,
          JSON.stringify({
            student_name: studentName,
            module_id: moduleId || certificate.module_id,
            ptc_date: ptcDate,
          }),
        ],
      );

      await client.query("COMMIT");
      return print;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  static async getMyPrintHistory(
    teacherId,
    {
      startDate = null,
      endDate = null,
      certificateNumber = null,
      studentName = null,
      moduleId = null,
      page = 1,
      limit = 20,
    } = {},
  ) {
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    const conditions = ["cp.teacher_id = $1"];
    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`cp.ptc_date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`cp.ptc_date <= $${paramIndex++}`);
      params.push(endDate);
    }
    if (certificateNumber) {
      conditions.push(`c.certificate_number ILIKE $${paramIndex++}`);
      params.push(`%${certificateNumber}%`);
    }
    if (studentName) {
      conditions.push(
        `(s.name ILIKE $${paramIndex} OR cp.student_name ILIKE $${paramIndex})`,
      );
      params.push(`%${studentName}%`);
      paramIndex++;
    }
    if (moduleId) {
      conditions.push(`cp.module_id = $${paramIndex++}`);
      params.push(parseInt(moduleId, 10));
    }

    const whereClause = conditions.join(" AND ");

    const [printResult, countResult] = await Promise.all([
      query(
        `SELECT
           cp.id, cp.certificate_id, c.certificate_number,
           COALESCE(s.name, cp.student_name) AS student_name,
           cp.module_id, m.module_code, m.name AS module_name,
           cp.branch_id, b.code AS branch_code, b.name AS branch_name,
           cp.ptc_date, cp.is_reprint, cp.printed_at
         FROM certificate_prints cp
         JOIN certificates c ON cp.certificate_id = c.id
         LEFT JOIN students s ON cp.student_id = s.id
         JOIN modules m ON cp.module_id = m.id
         JOIN branches b ON cp.branch_id = b.id
         WHERE ${whereClause}
         ORDER BY cp.printed_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, l, offset],
      ),
      query(
        `SELECT COUNT(*)
         FROM certificate_prints cp
         JOIN certificates c ON cp.certificate_id = c.id
         LEFT JOIN students s ON cp.student_id = s.id
         WHERE ${whereClause}`,
        params,
      ),
    ]);

    return {
      prints: printResult.rows,
      pagination: PaginationHelper.buildResponse(
        p,
        l,
        parseInt(countResult.rows[0].count, 10),
      ),
    };
  }
}

module.exports = CertificateTeacherService;

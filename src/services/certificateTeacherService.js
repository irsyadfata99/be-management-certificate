const CertificateModel = require("../models/certificateModel");
const CertificatePrintModel = require("../models/certificatePrintModel");
const CertificateReservationModel = require("../models/certificateReservationModel");
const CertificateLogModel = require("../models/certificateLogModel");
const MedalStockModel = require("../models/medalStockModel");
const ModuleModel = require("../models/moduleModel");
const StudentService = require("../services/studentService");
const BranchModel = require("../models/branchModel");
const { query, getClient } = require("../config/database");

class CertificateTeacherService {
  // ─── Helpers ──────────────────────────────────────────────────────────────

  static async _isReprint(studentId, moduleId) {
    if (!studentId) return false;

    const result = await query(
      `SELECT id FROM certificate_prints
       WHERE student_id = $1
         AND module_id  = $2
       LIMIT 1`,
      [studentId, moduleId],
    );

    return result.rows.length > 0;
  }

  // ─── Available Certificates ───────────────────────────────────────────────

  // FIX: N+1 query — sebelumnya loop per branch melakukan 3 query sequential.
  // Sekarang stock, medal stock, dan next certificate diambil sekaligus
  // menggunakan Promise.all() per branch, lalu semua branch dijalankan paralel.
  static async getAvailableCertificates(teacherId) {
    const branchResult = await query(
      `SELECT DISTINCT b.id, b.code, b.name
       FROM teacher_branches tb
       JOIN branches b ON tb.branch_id = b.id
       WHERE tb.teacher_id = $1 AND b.is_active = true`,
      [teacherId],
    );

    const branches = branchResult.rows;

    if (branches.length === 0) {
      throw new Error("Teacher has no assigned branches");
    }

    const availability = await Promise.all(
      branches.map(async (branch) => {
        const [stock, medalStock, nextAvailable] = await Promise.all([
          CertificateModel.getStockCount(branch.id),
          MedalStockModel.findByBranch(branch.id),
          CertificateModel.findAvailableInBranch(branch.id, 1),
        ]);

        return {
          branch_id: branch.id,
          branch_code: branch.code,
          branch_name: branch.name,
          stock,
          medal_stock: medalStock ? medalStock.quantity : 0,
          can_print:
            parseInt(stock.in_stock, 10) > 0 &&
            (medalStock ? medalStock.quantity : 0) > 0,
          next_certificate: nextAvailable[0] || null,
        };
      }),
    );

    return { branches: availability };
  }

  // ─── Reserve ──────────────────────────────────────────────────────────────

  static async reserveCertificate({ branchId }, teacherId) {
    const accessResult = await query(
      `SELECT 1 FROM teacher_branches
       WHERE teacher_id = $1 AND branch_id = $2`,
      [teacherId, branchId],
    );

    if (accessResult.rows.length === 0) {
      throw new Error("Access denied to this branch");
    }

    const activeReservations =
      await CertificateReservationModel.findActiveByTeacher(teacherId);

    if (activeReservations.length >= 5) {
      throw new Error(
        "Maximum 5 active reservations allowed. Please complete or release existing reservations.",
      );
    }

    const teacherResult = await query("SELECT role FROM users WHERE id = $1", [
      teacherId,
    ]);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const available = await CertificateModel.findAvailableInBranch(
        branchId,
        1,
      );

      if (available.length === 0) {
        throw new Error("No certificates available in this branch");
      }

      const certificate = available[0];

      const reservation = await CertificateReservationModel.create(
        certificate.id,
        teacherId,
        client,
      );

      await CertificateModel.updateStatus(certificate.id, "reserved", client);

      await CertificateLogModel.create(
        {
          certificate_id: certificate.id,
          action_type: "reserve",
          actor_id: teacherId,
          actor_role: teacherResult.rows[0].role,
          to_branch_id: branchId,
          metadata: {
            reservation_id: reservation.id,
            expires_at: reservation.expires_at,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: "Certificate reserved successfully",
        reservation: {
          id: reservation.id,
          certificate_number: certificate.certificate_number,
          reserved_at: reservation.reserved_at,
          expires_at: reservation.expires_at,
          remaining_hours: 24,
        },
        certificate: {
          id: certificate.id,
          certificate_number: certificate.certificate_number,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Print ────────────────────────────────────────────────────────────────

  static async printCertificate(
    { certificateId, studentName, moduleId, ptcDate },
    teacherId,
  ) {
    const certificate = await CertificateModel.findById(certificateId);
    if (!certificate) throw new Error("Certificate not found");
    if (certificate.status !== "reserved")
      throw new Error("Certificate is not reserved");

    const reservation =
      await CertificateReservationModel.findActiveByCertificate(certificateId);

    if (!reservation || reservation.teacher_id !== teacherId) {
      throw new Error("Certificate is not reserved by you");
    }

    if (new Date(reservation.expires_at) < new Date()) {
      throw new Error("Reservation has expired");
    }

    const module = await ModuleModel.findById(moduleId);
    if (!module) throw new Error("Module not found");

    const teacherDivisionResult = await query(
      `SELECT 1 FROM teacher_divisions
       WHERE teacher_id = $1 AND division_id = $2`,
      [teacherId, module.division_id],
    );

    if (teacherDivisionResult.rows.length === 0) {
      throw new Error("Access denied to this module");
    }

    if (isNaN(new Date(ptcDate).getTime())) throw new Error("Invalid PTC date");

    const headBranch = await BranchModel.findById(certificate.head_branch_id);
    if (!headBranch) throw new Error("Head branch not found");

    const medalStockPreCheck = await MedalStockModel.findByBranch(
      certificate.current_branch_id,
    );
    if (!medalStockPreCheck || medalStockPreCheck.quantity < 1) {
      throw new Error(
        "Insufficient medal stock in this branch. Cannot print without medal.",
      );
    }

    const teacherResult = await query("SELECT role FROM users WHERE id = $1", [
      teacherId,
    ]);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const savedStudent = await StudentService.createOrGetStudent(
        studentName,
        headBranch.id,
        client,
      );

      const reprintFlag = await this._isReprint(savedStudent.id, moduleId);

      const printResult = await CertificatePrintModel.create(
        {
          certificate_id: certificateId,
          certificate_number: certificate.certificate_number,
          student_id: savedStudent.id,
          student_name: studentName.trim(),
          module_id: moduleId,
          ptc_date: ptcDate,
          teacher_id: teacherId,
          branch_id: certificate.current_branch_id,
          is_reprint: reprintFlag,
        },
        client,
      );

      await CertificateModel.updateStatus(certificateId, "printed", client);

      await CertificateReservationModel.updateStatus(
        reservation.id,
        "completed",
        client,
      );

      const actionType = reprintFlag ? "reprint" : "print";

      if (!reprintFlag) {
        const consumed = await MedalStockModel.consumeStock(
          certificate.current_branch_id,
          client,
        );

        if (!consumed) {
          throw new Error(
            "Insufficient medal stock in this branch. Cannot print without medal.",
          );
        }

        await MedalStockModel.createLog(
          {
            branch_id: certificate.current_branch_id,
            action_type: "consume",
            quantity: 1,
            actor_id: teacherId,
            reference_id: printResult.id,
            notes: `Certificate ${certificate.certificate_number} printed for ${studentName.trim()}`,
          },
          client,
        );
      }

      await CertificateLogModel.create(
        {
          certificate_id: certificateId,
          action_type: actionType,
          actor_id: teacherId,
          actor_role: teacherResult.rows[0].role,
          to_branch_id: certificate.current_branch_id,
          metadata: {
            print_id: printResult.id,
            student_id: savedStudent.id,
            student_name: studentName.trim(),
            module_id: moduleId,
            module_name: module.name,
            ptc_date: ptcDate,
            is_reprint: reprintFlag,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: reprintFlag
          ? "Certificate reprinted successfully (no medal consumed)"
          : "Certificate printed successfully",
        is_reprint: reprintFlag,
        print: {
          id: printResult.id,
          certificate_number: certificate.certificate_number,
          student: {
            id: savedStudent.id,
            name: savedStudent.name,
          },
          module: {
            id: module.id,
            code: module.module_code,
            name: module.name,
          },
          ptc_date: ptcDate,
          printed_at: printResult.printed_at,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Reprint ──────────────────────────────────────────────────────────────
  //
  // CHANGELOG [reprint-history]:
  //   Sebelumnya: updateForReprint() → UPDATE row existing (data lama hilang)
  //   Sekarang:   CertificatePrintModel.create(is_reprint=true) → INSERT row baru
  //
  // Validasi ownership tetap menggunakan findLatestByCertificateId()
  // agar teacher yang melakukan print terakhir yang berhak reprint.
  //
  // Histori lengkap tersimpan di certificate_prints:
  //   Row 1: is_reprint=false (print pertama)
  //   Row 2: is_reprint=true  (reprint pertama)
  //   Row N: is_reprint=true  (reprint N-1)

  static async reprintCertificate(
    { certificateId, studentName, moduleId, ptcDate },
    teacherId,
  ) {
    const certificate = await CertificateModel.findById(certificateId);
    if (!certificate) throw new Error("Certificate not found");
    if (certificate.status !== "printed")
      throw new Error("Certificate has not been printed yet");

    const latestPrint =
      await CertificatePrintModel.findLatestByCertificateId(certificateId);

    if (!latestPrint) throw new Error("Print record not found");
    if (latestPrint.teacher_id !== teacherId)
      throw new Error(
        "Access denied. You can only reprint your own certificates",
      );

    const module = await ModuleModel.findById(moduleId);
    if (!module) throw new Error("Module not found");

    const teacherDivisionResult = await query(
      `SELECT 1 FROM teacher_divisions
       WHERE teacher_id = $1 AND division_id = $2`,
      [teacherId, module.division_id],
    );

    if (teacherDivisionResult.rows.length === 0) {
      throw new Error("Access denied to this module");
    }

    if (isNaN(new Date(ptcDate).getTime())) throw new Error("Invalid PTC date");

    const headBranch = await BranchModel.findById(certificate.head_branch_id);
    if (!headBranch) throw new Error("Head branch not found");

    const teacherResult = await query("SELECT role FROM users WHERE id = $1", [
      teacherId,
    ]);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const savedStudent = await StudentService.createOrGetStudent(
        studentName,
        headBranch.id,
        client,
      );

      const printResult = await CertificatePrintModel.create(
        {
          certificate_id: certificateId,
          certificate_number: certificate.certificate_number,
          student_id: savedStudent.id,
          student_name: studentName.trim(),
          module_id: moduleId,
          ptc_date: ptcDate,
          teacher_id: teacherId,
          branch_id: certificate.current_branch_id,
          is_reprint: true,
        },
        client,
      );

      await CertificateLogModel.create(
        {
          certificate_id: certificateId,
          action_type: "reprint",
          actor_id: teacherId,
          actor_role: teacherResult.rows[0].role,
          to_branch_id: certificate.current_branch_id,
          metadata: {
            print_id: printResult.id,
            student_id: savedStudent.id,
            student_name: studentName.trim(),
            module_id: moduleId,
            module_name: module.name,
            ptc_date: ptcDate,
            is_reprint: true,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: "Certificate reprinted successfully (no medal consumed)",
        is_reprint: true,
        print: {
          id: printResult.id,
          certificate_number: certificate.certificate_number,
          student: {
            id: savedStudent.id,
            name: savedStudent.name,
          },
          module: {
            id: module.id,
            code: module.module_code,
            name: module.name,
          },
          ptc_date: ptcDate,
          printed_at: printResult.printed_at,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Release ──────────────────────────────────────────────────────────────

  static async releaseReservation(certificateId, teacherId) {
    const certificate = await CertificateModel.findById(certificateId);
    if (!certificate) throw new Error("Certificate not found");
    if (certificate.status !== "reserved")
      throw new Error("Certificate is not reserved");

    const reservation =
      await CertificateReservationModel.findActiveByCertificate(certificateId);

    if (!reservation || reservation.teacher_id !== teacherId) {
      throw new Error("Certificate is not reserved by you");
    }

    const teacherResult = await query("SELECT role FROM users WHERE id = $1", [
      teacherId,
    ]);

    const client = await getClient();
    try {
      await client.query("BEGIN");

      await CertificateReservationModel.updateStatus(
        reservation.id,
        "released",
        client,
      );

      await CertificateModel.updateStatus(certificateId, "in_stock", client);

      await CertificateLogModel.create(
        {
          certificate_id: certificateId,
          action_type: "release",
          actor_id: teacherId,
          actor_role: teacherResult.rows[0].role,
          metadata: {
            reservation_id: reservation.id,
            reason: "manual_release",
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: "Reservation released successfully",
        certificate_number: certificate.certificate_number,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Print History ────────────────────────────────────────────────────────

  static async getPrintHistory(
    teacherId,
    { startDate, endDate, moduleId, studentName, page = 1, limit = 20 } = {},
  ) {
    let sql = `
      SELECT
        cp.id,
        cp.certificate_id,
        c.certificate_number,
        cp.student_id,
        s.name          AS student_name,
        cp.student_name AS legacy_student_name,
        cp.module_id,
        m.module_code,
        m.name          AS module_name,
        cp.ptc_date,
        cp.branch_id,
        b.code          AS branch_code,
        b.name          AS branch_name,
        cp.is_reprint,
        cp.printed_at,
        cp.created_at   AS "createdAt",
        pdf.file_path   AS pdf_path
      FROM certificate_prints cp
      JOIN certificates c ON cp.certificate_id = c.id
      LEFT JOIN students s ON cp.student_id = s.id
      JOIN modules m ON cp.module_id = m.id
      JOIN branches b ON cp.branch_id = b.id
      LEFT JOIN certificate_pdfs pdf ON pdf.certificate_print_id = cp.id
      WHERE cp.teacher_id = $1
    `;

    const params = [teacherId];
    let paramIndex = 2;

    if (startDate) {
      sql += ` AND cp.ptc_date >= $${paramIndex++}`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND cp.ptc_date <= $${paramIndex++}`;
      params.push(endDate);
    }

    if (moduleId) {
      sql += ` AND cp.module_id = $${paramIndex++}`;
      params.push(moduleId);
    }

    if (studentName) {
      sql += ` AND (s.name ILIKE $${paramIndex} OR cp.student_name ILIKE $${paramIndex})`;
      params.push(`%${studentName}%`);
      paramIndex++;
    }

    sql += ` ORDER BY cp.printed_at DESC`;

    const offset = (page - 1) * limit;

    // FIX: pisahkan LIMIT dan OFFSET ke dua baris terpisah untuk menghindari
    // undefined behavior dari double paramIndex++ dalam satu expression
    const limitIndex = paramIndex++;
    const offsetIndex = paramIndex++;
    sql += ` LIMIT $${limitIndex} OFFSET $${offsetIndex}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    let countSql = `
      SELECT COUNT(*)
      FROM certificate_prints cp
      LEFT JOIN students s ON cp.student_id = s.id
      WHERE cp.teacher_id = $1
    `;
    const countParams = [teacherId];
    let countIndex = 2;

    if (startDate) {
      countSql += ` AND cp.ptc_date >= $${countIndex++}`;
      countParams.push(startDate);
    }

    if (endDate) {
      countSql += ` AND cp.ptc_date <= $${countIndex++}`;
      countParams.push(endDate);
    }

    if (moduleId) {
      countSql += ` AND cp.module_id = $${countIndex++}`;
      countParams.push(moduleId);
    }

    if (studentName) {
      countSql += ` AND (s.name ILIKE $${countIndex} OR cp.student_name ILIKE $${countIndex})`;
      countParams.push(`%${studentName}%`);
      countIndex++;
    }

    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count, 10);

    return {
      prints: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ─── Active Reservations ──────────────────────────────────────────────────

  static async getActiveReservations(teacherId) {
    const reservations =
      await CertificateReservationModel.findActiveByTeacher(teacherId);

    return reservations.map((r) => ({
      reservation_id: r.id,
      certificate_number: r.certificate_number,
      certificate_id: r.certificate_id,
      reserved_at: r.reserved_at,
      expires_at: r.expires_at,
      remaining_hours: Math.max(
        0,
        Math.ceil((new Date(r.expires_at) - new Date()) / (1000 * 60 * 60)),
      ),
    }));
  }
}

module.exports = CertificateTeacherService;

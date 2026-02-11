const CertificateModel = require("../models/certificateModel");
const CertificatePrintModel = require("../models/certificatePrintModel");
const CertificateReservationModel = require("../models/certificateReservationModel");
const CertificateLogModel = require("../models/certificateLogModel");
const ModuleModel = require("../models/moduleModel");
const { getClient } = require("../config/database");

class CertificateTeacherService {
  /**
   * Get available certificates in teacher's branches
   * @param {number} teacherId
   * @returns {Promise<Object>}
   */
  static async getAvailableCertificates(teacherId) {
    const { query } = require("../config/database");

    // Get teacher's branches
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

    // Get stock for each branch
    const availability = [];
    for (const branch of branches) {
      const stock = await CertificateModel.getStockCount(branch.id);
      const nextAvailable = await CertificateModel.findAvailableInBranch(
        branch.id,
        1,
      );

      availability.push({
        branch_id: branch.id,
        branch_code: branch.code,
        branch_name: branch.name,
        stock: stock,
        next_certificate: nextAvailable[0] || null,
      });
    }

    return { branches: availability };
  }

  /**
   * Reserve a certificate (auto-select next available)
   * @param {Object} data
   * @param {number} data.branchId
   * @param {number} teacherId
   * @returns {Promise<Object>}
   */
  static async reserveCertificate({ branchId }, teacherId) {
    const { query } = require("../config/database");

    // Verify teacher has access to branch
    const accessResult = await query(
      `SELECT 1 FROM teacher_branches
       WHERE teacher_id = $1 AND branch_id = $2`,
      [teacherId, branchId],
    );

    if (accessResult.rows.length === 0) {
      throw new Error("Access denied to this branch");
    }

    // Check if teacher already has active reservations
    const activeReservations =
      await CertificateReservationModel.findActiveByTeacher(teacherId);

    if (activeReservations.length >= 5) {
      throw new Error(
        "Maximum 5 active reservations allowed. Please complete or release existing reservations.",
      );
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Get next available certificate
      const available = await CertificateModel.findAvailableInBranch(
        branchId,
        1,
      );

      if (available.length === 0) {
        throw new Error("No certificates available in this branch");
      }

      const certificate = available[0];

      // Create reservation
      const reservation = await CertificateReservationModel.create(
        certificate.id,
        teacherId,
        client,
      );

      // Update certificate status to reserved
      await CertificateModel.updateStatus(certificate.id, "reserved", client);

      // Get teacher info
      const teacherResult = await query(
        "SELECT role FROM users WHERE id = $1",
        [teacherId],
      );

      // Create log entry
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
          medal_included: certificate.medal_included,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Print certificate (complete reservation)
   * @param {Object} data
   * @param {number} data.certificateId
   * @param {string} data.studentName
   * @param {number} data.moduleId
   * @param {string} data.ptcDate - ISO date string
   * @param {number} teacherId
   * @returns {Promise<Object>}
   */
  static async printCertificate(
    { certificateId, studentName, moduleId, ptcDate },
    teacherId,
  ) {
    const { query } = require("../config/database");

    // Verify certificate exists and is reserved by this teacher
    const certificate = await CertificateModel.findById(certificateId);
    if (!certificate) {
      throw new Error("Certificate not found");
    }

    if (certificate.status !== "reserved") {
      throw new Error("Certificate is not reserved");
    }

    const reservation =
      await CertificateReservationModel.findActiveByCertificate(certificateId);

    if (!reservation || reservation.teacher_id !== teacherId) {
      throw new Error("Certificate is not reserved by you");
    }

    if (new Date(reservation.expires_at) < new Date()) {
      throw new Error("Reservation has expired");
    }

    // Verify module exists and teacher has access
    const module = await ModuleModel.findById(moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    const teacherDivisionResult = await query(
      `SELECT 1 FROM teacher_divisions
       WHERE teacher_id = $1 AND division_id = $2`,
      [teacherId, module.division_id],
    );

    if (teacherDivisionResult.rows.length === 0) {
      throw new Error("Access denied to this module");
    }

    // Verify PTC date is valid
    const ptcDateObj = new Date(ptcDate);
    if (isNaN(ptcDateObj.getTime())) {
      throw new Error("Invalid PTC date");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Create print record
      const print = await CertificatePrintModel.create(
        {
          certificate_id: certificateId,
          student_name: studentName.trim(),
          module_id: moduleId,
          ptc_date: ptcDate,
          teacher_id: teacherId,
          branch_id: certificate.current_branch_id,
        },
        client,
      );

      // Update certificate status to printed
      await CertificateModel.updateStatus(certificateId, "printed", client);

      // Complete reservation
      await CertificateReservationModel.updateStatus(
        reservation.id,
        "completed",
        client,
      );

      // Get teacher info
      const teacherResult = await query(
        "SELECT role FROM users WHERE id = $1",
        [teacherId],
      );

      // Create log entry
      await CertificateLogModel.create(
        {
          certificate_id: certificateId,
          action_type: "print",
          actor_id: teacherId,
          actor_role: teacherResult.rows[0].role,
          to_branch_id: certificate.current_branch_id,
          metadata: {
            print_id: print.id,
            student_name: studentName,
            module_id: moduleId,
            ptc_date: ptcDate,
          },
        },
        client,
      );

      await client.query("COMMIT");

      return {
        message: "Certificate printed successfully",
        print: {
          id: print.id,
          certificate_number: certificate.certificate_number,
          student_name: studentName,
          module_name: module.name,
          ptc_date: ptcDate,
          printed_at: print.printed_at,
          medal_included: certificate.medal_included,
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Release reservation (manual release before expiry)
   * @param {number} certificateId
   * @param {number} teacherId
   * @returns {Promise<Object>}
   */
  static async releaseReservation(certificateId, teacherId) {
    const { query } = require("../config/database");

    const certificate = await CertificateModel.findById(certificateId);
    if (!certificate) {
      throw new Error("Certificate not found");
    }

    if (certificate.status !== "reserved") {
      throw new Error("Certificate is not reserved");
    }

    const reservation =
      await CertificateReservationModel.findActiveByCertificate(certificateId);

    if (!reservation || reservation.teacher_id !== teacherId) {
      throw new Error("Certificate is not reserved by you");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Release reservation
      await CertificateReservationModel.updateStatus(
        reservation.id,
        "released",
        client,
      );

      // Update certificate back to in_stock
      await CertificateModel.updateStatus(certificateId, "in_stock", client);

      // Get teacher info
      const teacherResult = await query(
        "SELECT role FROM users WHERE id = $1",
        [teacherId],
      );

      // Create log entry
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

  /**
   * Get teacher's print history
   * @param {number} teacherId
   * @param {Object} filters
   * @returns {Promise<Object>}
   */
  static async getPrintHistory(
    teacherId,
    { startDate, endDate, moduleId, page = 1, limit = 20 } = {},
  ) {
    const offset = (page - 1) * limit;

    const prints = await CertificatePrintModel.findByTeacher(teacherId, {
      startDate,
      endDate,
      moduleId,
      limit,
      offset,
    });

    const total = await CertificatePrintModel.countByTeacher(teacherId);

    return {
      prints,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get teacher's active reservations
   * @param {number} teacherId
   * @returns {Promise<Array>}
   */
  static async getActiveReservations(teacherId) {
    const reservations =
      await CertificateReservationModel.findActiveByTeacher(teacherId);

    return reservations.map((r) => ({
      reservation_id: r.id,
      certificate_id: r.certificate_id,
      certificate_number: r.certificate_number,
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

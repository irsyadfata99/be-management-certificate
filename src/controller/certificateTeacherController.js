const CertificateTeacherService = require("../services/certificateTeacherService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class CertificateTeacherController {
  /**
   * GET /certificates/available
   * Get available certificates in teacher's branches
   */
  static async getAvailable(req, res, next) {
    try {
      const result = await CertificateTeacherService.getAvailableCertificates(req.user.userId);

      return ResponseHelper.success(res, 200, "Available certificates retrieved successfully", result);
    } catch (error) {
      if (error.message === "Teacher has no assigned branches") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * POST /certificates/reserve
   * Reserve a certificate
   */
  static async reserve(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { branchId } = req.body;

      const result = await CertificateTeacherService.reserveCertificate({ branchId }, req.user.userId);

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = ["Access denied to this branch", "No certificates available in this branch"];

      if (clientErrors.includes(error.message) || error.message.includes("Maximum") || error.message.includes("reservations")) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * POST /certificates/print
   * Print certificate (complete reservation)
   */
  static async print(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { certificateId, studentName, moduleId, ptcDate } = req.body;

      const result = await CertificateTeacherService.printCertificate({ certificateId, studentName, moduleId, ptcDate }, req.user.userId);

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = ["Certificate not found", "Certificate is not reserved", "Certificate is not reserved by you", "Reservation has expired", "Module not found", "Access denied to this module", "Invalid PTC date"];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * POST /certificates/:id/release
   * Release reservation manually
   */
  static async release(req, res, next) {
    try {
      const certificateId = parseInt(req.params.id, 10);

      if (isNaN(certificateId)) {
        return ResponseHelper.error(res, 400, "Invalid certificate ID");
      }

      const result = await CertificateTeacherService.releaseReservation(certificateId, req.user.userId);

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = ["Certificate not found", "Certificate is not reserved", "Certificate is not reserved by you"];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /certificates/my-prints
   * Get teacher's print history
   */
  static async getMyPrints(req, res, next) {
    try {
      const { startDate, endDate, moduleId, page, limit, search } = req.query;

      const result = await CertificateTeacherService.getPrintHistory(req.user.userId, {
        startDate,
        endDate,
        moduleId: moduleId ? parseInt(moduleId, 10) : undefined,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        studentName: search,
      });

      return ResponseHelper.success(res, 200, "Print history retrieved successfully", result);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /certificates/my-reservations
   * Get teacher's active reservations
   */
  static async getMyReservations(req, res, next) {
    try {
      const result = await CertificateTeacherService.getActiveReservations(req.user.userId);

      return ResponseHelper.success(res, 200, "Active reservations retrieved successfully", { reservations: result });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CertificateTeacherController;

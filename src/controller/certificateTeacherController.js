const CertificateTeacherService = require("../services/certificateTeacherService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class CertificateTeacherController {
  static async getAvailable(req, res, next) {
    try {
      const result = await CertificateTeacherService.getAvailableCertificates(
        req.user.userId,
      );

      return ResponseHelper.success(
        res,
        200,
        "Available certificates retrieved successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Teacher has no assigned branches") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async reserve(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { branchId } = req.body;

      const result = await CertificateTeacherService.reserveCertificate(
        { branchId },
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Access denied to this branch",
        "No certificates available in this branch",
      ];

      if (
        clientErrors.includes(error.message) ||
        error.message.includes("Maximum") ||
        error.message.includes("reservations")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async print(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { certificateId, studentName, moduleId, ptcDate } = req.body;

      const result = await CertificateTeacherService.printCertificate(
        { certificateId, studentName, moduleId, ptcDate },
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Certificate not found",
        "Certificate is not reserved",
        "Certificate is not reserved by you",
        "Reservation has expired",
        "Module not found",
        "Access denied to this module",
        "Invalid PTC date",
      ];

      if (
        clientErrors.includes(error.message) ||
        error.message.includes("Insufficient medal stock")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async reprint(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const certificateId = parseInt(req.params.id, 10);

      if (isNaN(certificateId)) {
        return ResponseHelper.error(res, 400, "Invalid certificate ID");
      }

      const { studentName, moduleId, ptcDate } = req.body;

      const result = await CertificateTeacherService.reprintCertificate(
        { certificateId, studentName, moduleId, ptcDate },
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Certificate not found",
        "Certificate has not been printed yet",
        "Print record not found",
        "Access denied. You can only reprint your own certificates",
        "Module not found",
        "Access denied to this module",
        "Invalid PTC date",
      ];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async release(req, res, next) {
    try {
      const certificateId = parseInt(req.params.id, 10);

      if (isNaN(certificateId)) {
        return ResponseHelper.error(res, 400, "Invalid certificate ID");
      }

      const result = await CertificateTeacherService.releaseReservation(
        certificateId,
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Certificate not found",
        "Certificate is not reserved",
        "Certificate is not reserved by you",
      ];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async getMyPrints(req, res, next) {
    try {
      const { startDate, endDate, moduleId, page, limit, search } = req.query;

      const result = await CertificateTeacherService.getPrintHistory(
        req.user.userId,
        {
          startDate,
          endDate,
          moduleId: moduleId ? parseInt(moduleId, 10) : undefined,
          page: page ? parseInt(page, 10) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
          studentName: search,
        },
      );

      return ResponseHelper.success(
        res,
        200,
        "Print history retrieved successfully",
        result,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getMyReservations(req, res, next) {
    try {
      const result = await CertificateTeacherService.getActiveReservations(
        req.user.userId,
      );

      return ResponseHelper.success(
        res,
        200,
        "Active reservations retrieved successfully",
        { reservations: result },
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CertificateTeacherController;

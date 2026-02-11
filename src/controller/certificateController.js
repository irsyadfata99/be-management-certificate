const CertificateService = require("../services/certificateService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class CertificateController {
  /**
   * POST /certificates/bulk-create
   * Create certificates in bulk (Admin - Head Branch)
   */
  static async bulkCreate(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { startNumber, endNumber } = req.body;
      const result = await CertificateService.bulkCreateCertificates(
        { startNumber, endNumber },
        req.user.userId,
      );

      return ResponseHelper.success(res, 201, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can create certificates",
        "Branch is inactive",
        "Certificate numbers must be positive",
        "Start number must be less than or equal to end number",
        "Maximum 10,000 certificates per batch",
      ];

      if (
        clientErrors.includes(error.message) ||
        error.message.includes("already exist")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /certificates
   * Get certificates with filters (Admin)
   */
  static async getAll(req, res, next) {
    try {
      const { status, currentBranchId, page, limit } = req.query;

      const result = await CertificateService.getCertificates(req.user.userId, {
        status,
        currentBranchId: currentBranchId
          ? parseInt(currentBranchId, 10)
          : undefined,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return ResponseHelper.success(
        res,
        200,
        "Certificates retrieved successfully",
        result,
      );
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can view certificates"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /certificates/stock
   * Get stock summary for all branches (Admin)
   */
  static async getStock(req, res, next) {
    try {
      const result = await CertificateService.getStockSummary(req.user.userId);

      return ResponseHelper.success(
        res,
        200,
        "Stock summary retrieved successfully",
        result,
      );
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can view stock summary"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * POST /certificates/migrate
   * Migrate certificates to sub branch (Admin)
   */
  static async migrate(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const { startNumber, endNumber, toBranchId } = req.body;

      const result = await CertificateService.migrateCertificates(
        { startNumber, endNumber, toBranchId },
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can migrate certificates",
        "Target branch not found",
        "Cannot migrate to another head branch",
        "Target branch is inactive",
      ];

      if (
        clientErrors.includes(error.message) ||
        error.message.includes("No certificates found") ||
        error.message.includes("Cannot migrate") ||
        error.message.includes("must be a sub branch")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = CertificateController;

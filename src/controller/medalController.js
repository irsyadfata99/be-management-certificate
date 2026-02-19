const CertificateService = require("../services/certificateService");
const ResponseHelper = require("../utils/responseHelper");
const logger = require("../utils/logger");

class MedalController {
  // ─── GET /medals/stock ────────────────────────────────────────────────────

  static async getStock(req, res, next) {
    try {
      const summary = await CertificateService.getStockSummary(req.user.userId);

      const data = {
        head_branch: {
          id: summary.head_branch.id,
          code: summary.head_branch.code,
          name: summary.head_branch.name,
          medal_stock: summary.head_branch.medal_stock,
          certificate_in_stock: parseInt(
            summary.head_branch.certificate_stock.in_stock,
            10,
          ),
          imbalance: summary.head_branch.imbalance,
        },
        sub_branches: summary.sub_branches.map((b) => ({
          id: b.branch_id,
          code: b.branch_code,
          name: b.branch_name,
          medal_stock: b.medal_stock,
          certificate_in_stock: parseInt(b.certificate_stock.in_stock, 10),
          imbalance: b.imbalance,
        })),
      };

      return ResponseHelper.success(
        res,
        200,
        "Stock summary retrieved successfully",
        data,
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

  // ─── POST /medals/add ─────────────────────────────────────────────────────

  static async addStock(req, res, next) {
    try {
      const { quantity } = req.body;

      if (!quantity) {
        return ResponseHelper.error(res, 400, "quantity is required");
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return ResponseHelper.error(
          res,
          400,
          "quantity must be a positive integer",
        );
      }

      const result = await CertificateService.bulkAddMedals(
        { quantity: parsedQty },
        req.user.userId,
      );

      return ResponseHelper.success(res, 201, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can add medals",
        "Branch is inactive",
        "Quantity must be a positive integer",
        "Maximum 10,000 medals per batch",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  // ─── POST /medals/migrate ─────────────────────────────────────────────────

  static async migrateStock(req, res, next) {
    try {
      const { to_branch_id, quantity } = req.body;

      if (!to_branch_id || !quantity) {
        return ResponseHelper.error(
          res,
          400,
          "to_branch_id and quantity are required",
        );
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return ResponseHelper.error(
          res,
          400,
          "quantity must be a positive integer",
        );
      }

      const parsedToBranchId = parseInt(to_branch_id, 10);
      if (isNaN(parsedToBranchId) || parsedToBranchId < 1) {
        return ResponseHelper.error(
          res,
          400,
          "to_branch_id must be a positive integer",
        );
      }

      const result = await CertificateService.migrateMedals(
        { toBranchId: parsedToBranchId, quantity: parsedQty },
        req.user.userId,
      );

      return ResponseHelper.success(res, 200, result.message, result);
    } catch (error) {
      const clientErrors = [
        "Admin does not have an assigned branch",
        "Only head branch admins can migrate medals",
        "Branch is inactive",
        "Target branch not found",
        "Cannot migrate medals to another head branch",
        "Target branch must be a sub branch of your head branch",
        "Target branch is inactive",
        "Quantity must be a positive integer",
      ];
      if (
        clientErrors.includes(error.message) ||
        error.message.startsWith("Insufficient medal stock")
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  // ─── GET /medals/logs ─────────────────────────────────────────────────────

  static async getLogs(req, res, next) {
    try {
      const {
        action_type,
        start_date,
        end_date,
        page = 1,
        limit = 20,
      } = req.query;

      const validActionTypes = ["add", "migrate_in", "migrate_out", "consume"];
      if (action_type && !validActionTypes.includes(action_type)) {
        return ResponseHelper.error(
          res,
          400,
          `Invalid action_type. Must be one of: ${validActionTypes.join(", ")}`,
        );
      }

      const parsedPage = Math.max(1, parseInt(page, 10) || 1);
      const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const result = await CertificateService.getMedalLogs(req.user.userId, {
        actionType: action_type,
        startDate: start_date,
        endDate: end_date,
        page: parsedPage,
        limit: parsedLimit,
      });

      return ResponseHelper.success(
        res,
        200,
        "Medal logs retrieved successfully",
        result,
      );
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can view medal logs"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  // ─── GET /medals/alerts ───────────────────────────────────────────────────

  static async getAlerts(req, res, next) {
    try {
      const rawThreshold = req.query.threshold;
      const threshold =
        rawThreshold !== undefined ? parseInt(rawThreshold, 10) : 10;

      if (isNaN(threshold) || threshold < 1 || threshold > 1000) {
        return ResponseHelper.error(
          res,
          400,
          "threshold must be a number between 1 and 1000",
        );
      }

      const result = await CertificateService.getStockAlerts(
        req.user.userId,
        threshold,
      );

      return ResponseHelper.success(
        res,
        200,
        "Stock alerts retrieved successfully",
        result,
      );
    } catch (error) {
      if (
        error.message === "Admin does not have an assigned branch" ||
        error.message === "Only head branch admins can view stock alerts"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = MedalController;

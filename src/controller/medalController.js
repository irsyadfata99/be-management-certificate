const CertificateService = require("../services/certificateService");
const ResponseHelper = require("../utils/responseHelper");

class MedalController {
  // ─── GET /medals/stock ────────────────────────────────────────────────────
  // Ringkasan medal stock semua branch di bawah head branch admin

  static async getStock(req, res, next) {
    try {
      const summary = await CertificateService.getStockSummary(req.user.userId);

      return ResponseHelper.success(res, {
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
      });
    } catch (error) {
      next(error);
    }
  }

  // ─── POST /medals/add ─────────────────────────────────────────────────────
  // Tambah medal stock ke head branch admin

  static async addStock(req, res, next) {
    try {
      const { quantity } = req.body;

      if (!quantity) {
        return ResponseHelper.badRequest(res, "quantity is required");
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return ResponseHelper.badRequest(
          res,
          "quantity must be a positive integer",
        );
      }

      const result = await CertificateService.bulkAddMedals(
        { quantity: parsedQty },
        req.user.userId,
      );

      return ResponseHelper.created(res, result);
    } catch (error) {
      next(error);
    }
  }

  // ─── POST /medals/migrate ─────────────────────────────────────────────────
  // Transfer medal dari head branch ke sub branch

  static async migrateStock(req, res, next) {
    try {
      const { to_branch_id, quantity } = req.body;

      if (!to_branch_id || !quantity) {
        return ResponseHelper.badRequest(
          res,
          "to_branch_id and quantity are required",
        );
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return ResponseHelper.badRequest(
          res,
          "quantity must be a positive integer",
        );
      }

      const result = await CertificateService.migrateMedals(
        { toBranchId: parseInt(to_branch_id, 10), quantity: parsedQty },
        req.user.userId,
      );

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  // ─── GET /medals/logs ─────────────────────────────────────────────────────
  // Riwayat aktivitas medal stock (add, migrate, consume)

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
        return ResponseHelper.badRequest(
          res,
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

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  // ─── GET /medals/alerts ───────────────────────────────────────────────────
  // Daftar branch dengan medal stock rendah

  static async getAlerts(req, res, next) {
    try {
      const rawThreshold = req.query.threshold;

      // Default to 10 jika tidak dikirim
      const threshold =
        rawThreshold !== undefined ? parseInt(rawThreshold, 10) : 10;

      // Validasi: NaN (threshold=abc), atau di luar range (threshold=0 termasuk di sini)
      if (isNaN(threshold) || threshold < 1 || threshold > 1000) {
        return ResponseHelper.badRequest(
          res,
          "threshold must be a number between 1 and 1000",
        );
      }

      const result = await CertificateService.getStockAlerts(
        req.user.userId,
        threshold,
      );

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = MedalController;

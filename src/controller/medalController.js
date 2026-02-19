const CertificateService = require("../services/certificateService");

class MedalController {
  // ─── GET /medals/stock ────────────────────────────────────────────────────
  // Ringkasan medal stock semua branch di bawah head branch admin

  static async getStock(req, res) {
    try {
      const summary = await CertificateService.getStockSummary(req.user.userId);

      return res.status(200).json({
        success: true,
        data: {
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
        },
      });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ─── POST /medals/add ─────────────────────────────────────────────────────
  // Tambah medal stock ke head branch admin

  static async addStock(req, res) {
    try {
      const { quantity } = req.body;

      if (!quantity) {
        return res.status(400).json({
          success: false,
          message: "quantity is required",
        });
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({
          success: false,
          message: "quantity must be a positive integer",
        });
      }

      const result = await CertificateService.bulkAddMedals(
        { quantity: parsedQty },
        req.user.userId,
      );

      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ─── POST /medals/migrate ─────────────────────────────────────────────────
  // Transfer medal dari head branch ke sub branch

  static async migrateStock(req, res) {
    try {
      const { to_branch_id, quantity } = req.body;

      if (!to_branch_id || !quantity) {
        return res.status(400).json({
          success: false,
          message: "to_branch_id and quantity are required",
        });
      }

      const parsedQty = parseInt(quantity, 10);
      if (isNaN(parsedQty) || parsedQty < 1) {
        return res.status(400).json({
          success: false,
          message: "quantity must be a positive integer",
        });
      }

      const result = await CertificateService.migrateMedals(
        { toBranchId: parseInt(to_branch_id, 10), quantity: parsedQty },
        req.user.userId,
      );

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ─── GET /medals/logs ─────────────────────────────────────────────────────
  // Riwayat aktivitas medal stock (add, migrate, consume)

  static async getLogs(req, res) {
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
        return res.status(400).json({
          success: false,
          message: `Invalid action_type. Must be one of: ${validActionTypes.join(", ")}`,
        });
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

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }

  // ─── GET /medals/alerts ───────────────────────────────────────────────────
  // Daftar branch dengan medal stock rendah

  static async getAlerts(req, res) {
    try {
      const threshold = parseInt(req.query.threshold, 10) || 10;

      if (threshold < 1 || threshold > 1000) {
        return res.status(400).json({
          success: false,
          message: "threshold must be between 1 and 1000",
        });
      }

      const result = await CertificateService.getStockAlerts(
        req.user.userId,
        threshold,
      );

      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return res.status(400).json({ success: false, message: error.message });
    }
  }
}

module.exports = MedalController;

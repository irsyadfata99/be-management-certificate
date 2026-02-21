const CertificateLogService = require("../services/certificateLogService");
const ResponseHelper = require("../utils/responseHelper");
const logger = require("../utils/logger");

class CertificateLogController {
  static async getLogs(req, res, next) {
    try {
      const { actionType, actorId, startDate, endDate, certificateNumber, page, limit } = req.query;

      const role = (req.user.role || "").toLowerCase();
      let result;

      if (role === "admin" || role === "superadmin") {
        result = await CertificateLogService.getAdminLogs(req.user.userId, {
          actionType,
          actorId: actorId ? parseInt(actorId, 10) : undefined,
          startDate,
          endDate,
          certificateNumber,
          page: page ? parseInt(page, 10) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        });
      } else {
        result = await CertificateLogService.getTeacherLogs(req.user.userId, {
          startDate,
          endDate,
          certificateNumber,
          page: page ? parseInt(page, 10) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        });
      }

      return ResponseHelper.success(res, 200, "Logs retrieved successfully", result);
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async exportLogs(req, res, next) {
    try {
      const { actionType, actorId, startDate, endDate, certificateNumber } = req.query;

      const role = (req.user.role || "").toLowerCase();
      const date = new Date().toISOString().split("T")[0];

      if (role === "admin" || role === "superadmin") {
        const filename = `certificate_logs_${date}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

        await CertificateLogService.exportAdminLogsToExcel(
          req.user.userId,
          {
            actionType,
            actorId: actorId ? parseInt(actorId, 10) : undefined,
            startDate,
            endDate,
            certificateNumber,
          },
          res,
        );
      } else {
        const filename = `my_print_history_${date}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

        await CertificateLogService.exportTeacherLogsToExcel(
          req.user.userId,
          {
            startDate,
            endDate,
            certificateNumber,
          },
          res,
        );
      }
    } catch (error) {
      if (!res.headersSent) {
        if (error.message === "Admin does not have an assigned branch") {
          return ResponseHelper.error(res, 400, error.message);
        }
        return next(error);
      }

      logger.error("[CertificateLogController.exportLogs] Stream error after headers sent", {
        error: error.message,
        userId: req.user?.userId,
      });
      res.destroy(error);
    }
  }

  static async getStatistics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const result = await CertificateLogService.getPrintStatistics(req.user.userId, {
        startDate,
        endDate,
      });

      return ResponseHelper.success(res, 200, "Statistics retrieved successfully", result);
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async getMigrations(req, res, next) {
    try {
      const { startDate, endDate, fromBranchId, toBranchId, page, limit } = req.query;

      const result = await CertificateLogService.getMigrationHistory(req.user.userId, {
        startDate,
        endDate,
        fromBranchId: fromBranchId ? parseInt(fromBranchId, 10) : undefined,
        toBranchId: toBranchId ? parseInt(toBranchId, 10) : undefined,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return ResponseHelper.success(res, 200, "Migration history retrieved successfully", result);
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = CertificateLogController;

const CertificateLogService = require("../services/certificateLogService");
const ResponseHelper = require("../utils/responseHelper");

class CertificateLogController {
  static async getLogs(req, res, next) {
    try {
      const {
        actionType,
        actorId,
        startDate,
        endDate,
        certificateNumber,
        page,
        limit,
      } = req.query;

      let result;

      if (req.user.role === "admin" || req.user.role === "superAdmin") {
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

      return ResponseHelper.success(
        res,
        200,
        "Logs retrieved successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async exportLogs(req, res, next) {
    try {
      const { actionType, actorId, startDate, endDate, certificateNumber } =
        req.query;

      let buffer;
      let filename;

      if (req.user.role === "admin" || req.user.role === "superAdmin") {
        buffer = await CertificateLogService.exportAdminLogsToExcel(
          req.user.userId,
          {
            actionType,
            actorId: actorId ? parseInt(actorId, 10) : undefined,
            startDate,
            endDate,
            certificateNumber,
          },
        );
        filename = `certificate_logs_${new Date().toISOString().split("T")[0]}.xlsx`;
      } else {
        buffer = await CertificateLogService.exportTeacherLogsToExcel(
          req.user.userId,
          {
            startDate,
            endDate,
            certificateNumber,
          },
        );
        filename = `my_print_history_${new Date().toISOString().split("T")[0]}.xlsx`;
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

      return res.send(buffer);
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async getStatistics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const result = await CertificateLogService.getPrintStatistics(
        req.user.userId,
        {
          startDate,
          endDate,
        },
      );

      return ResponseHelper.success(
        res,
        200,
        "Statistics retrieved successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async getMigrations(req, res, next) {
    try {
      const { startDate, endDate, fromBranchId, toBranchId, page, limit } =
        req.query;

      const result = await CertificateLogService.getMigrationHistory(
        req.user.userId,
        {
          startDate,
          endDate,
          fromBranchId: fromBranchId ? parseInt(fromBranchId, 10) : undefined,
          toBranchId: toBranchId ? parseInt(toBranchId, 10) : undefined,
          page: page ? parseInt(page, 10) : undefined,
          limit: limit ? parseInt(limit, 10) : undefined,
        },
      );

      return ResponseHelper.success(
        res,
        200,
        "Migration history retrieved successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = CertificateLogController;

const CertificateLogService = require("../services/certificateLogService");
const ResponseHelper = require("../utils/responseHelper");
const PaginationHelper = require("../utils/paginationHelper");

class CertificateLogController {
  static async getAdminLogs(req, res, next) {
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

      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await CertificateLogService.getAdminLogs(req.user.id, {
        actionType,
        actorId,
        startDate,
        endDate,
        certificateNumber,
        page: p,
        limit: l,
      });

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async getTeacherLogs(req, res, next) {
    try {
      const { startDate, endDate, certificateNumber, page, limit } = req.query;

      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await CertificateLogService.getTeacherLogs(req.user.id, {
        startDate,
        endDate,
        certificateNumber,
        page: p,
        limit: l,
      });

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async exportAdminLogs(req, res, next) {
    try {
      const { actionType, actorId, startDate, endDate, certificateNumber } =
        req.query;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="certificate-logs.xlsx"',
      );

      await CertificateLogService.exportAdminLogsToExcel(
        req.user.id,
        { actionType, actorId, startDate, endDate, certificateNumber },
        res,
      );
    } catch (error) {
      next(error);
    }
  }

  static async exportTeacherLogs(req, res, next) {
    try {
      const { startDate, endDate, certificateNumber, studentName, moduleId } =
        req.query;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="my-print-history.xlsx"',
      );

      await CertificateLogService.exportTeacherLogsToExcel(
        req.user.id,
        { startDate, endDate, certificateNumber, studentName, moduleId },
        res,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getPrintStatistics(req, res, next) {
    try {
      const { startDate, endDate } = req.query;

      const result = await CertificateLogService.getPrintStatistics(
        req.user.id,
        { startDate, endDate },
      );

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async getMigrationHistory(req, res, next) {
    try {
      const { startDate, endDate, fromBranchId, toBranchId, page, limit } =
        req.query;

      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await CertificateLogService.getMigrationHistory(
        req.user.id,
        {
          startDate,
          endDate,
          fromBranchId,
          toBranchId,
          page: p,
          limit: l,
        },
      );

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = CertificateLogController;

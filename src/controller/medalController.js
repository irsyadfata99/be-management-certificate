const MedalService = require("../services/medalService");
const ResponseHelper = require("../utils/responseHelper");
const PaginationHelper = require("../utils/paginationHelper");

class MedalController {
  static async getAllMedals(req, res, next) {
    try {
      const { search, isActive, page, limit } = req.query;
      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await MedalService.getAllMedals(req.user.id, {
        search,
        isActive:
          isActive === "true" ? true : isActive === "false" ? false : undefined,
        page: p,
        limit: l,
      });

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async getMedalById(req, res, next) {
    try {
      const medal = await MedalService.getMedalById(
        parseInt(req.params.id, 10),
        req.user.id,
      );
      return ResponseHelper.success(res, { medal });
    } catch (error) {
      next(error);
    }
  }

  static async createMedal(req, res, next) {
    try {
      const medal = await MedalService.createMedal(req.body, req.user.id);
      return ResponseHelper.created(res, { medal });
    } catch (error) {
      next(error);
    }
  }

  static async updateMedal(req, res, next) {
    try {
      const medal = await MedalService.updateMedal(
        parseInt(req.params.id, 10),
        req.body,
        req.user.id,
      );
      return ResponseHelper.success(res, { medal });
    } catch (error) {
      next(error);
    }
  }

  static async toggleMedalActive(req, res, next) {
    try {
      const medal = await MedalService.toggleMedalActive(
        parseInt(req.params.id, 10),
        req.user.id,
      );
      return ResponseHelper.success(res, { medal });
    } catch (error) {
      next(error);
    }
  }

  static async getMedalStock(req, res, next) {
    try {
      const { branchId, page, limit } = req.query;
      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await MedalService.getMedalStock(req.user.id, {
        branchId: branchId ? parseInt(branchId, 10) : undefined,
        page: p,
        limit: l,
      });

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }

  static async addMedalStock(req, res, next) {
    try {
      const stock = await MedalService.addMedalStock(req.body, req.user.id);
      return ResponseHelper.created(res, { stock });
    } catch (error) {
      next(error);
    }
  }

  static async adjustMedalStock(req, res, next) {
    try {
      const stock = await MedalService.adjustMedalStock(
        parseInt(req.params.id, 10),
        req.body,
        req.user.id,
      );
      return ResponseHelper.success(res, { stock });
    } catch (error) {
      next(error);
    }
  }

  static async getMedalStockHistory(req, res, next) {
    try {
      const { medalId, branchId, startDate, endDate, page, limit } = req.query;
      const { page: p, limit: l } = PaginationHelper.fromQuery({ page, limit });

      const result = await MedalService.getMedalStockHistory(req.user.id, {
        medalId: medalId ? parseInt(medalId, 10) : undefined,
        branchId: branchId ? parseInt(branchId, 10) : undefined,
        startDate,
        endDate,
        page: p,
        limit: l,
      });

      return ResponseHelper.success(res, result);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = MedalController;

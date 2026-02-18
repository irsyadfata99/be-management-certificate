const DivisionService = require("../services/divisionService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class DivisionController {
  // ─── Division ─────────────────────────────────────────────────────────────

  static async getAll(req, res, next) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const data = await DivisionService.getAllDivisions(req.user.userId, {
        includeInactive,
      });
      return ResponseHelper.success(
        res,
        200,
        "Divisions retrieved successfully",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid division ID");

      const data = await DivisionService.getDivisionById(id, req.user.userId);
      return ResponseHelper.success(
        res,
        200,
        "Division retrieved successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const { name, sub_divisions } = req.body;
      const data = await DivisionService.createDivision(
        { name, sub_divisions },
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        201,
        "Division created successfully",
        data,
      );
    } catch (error) {
      const clientErrors = [
        "age_min and age_max must be numbers",
        "age_min cannot be negative",
        "age_max must be greater than age_min",
      ];
      const overlapPattern = /overlaps with/;
      if (
        clientErrors.includes(error.message) ||
        overlapPattern.test(error.message)
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async update(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid division ID");

      const data = await DivisionService.updateDivision(
        id,
        req.body.name,
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        200,
        "Division updated successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  static async toggleActive(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid division ID");

      const data = await DivisionService.toggleDivisionActive(
        id,
        req.user.userId,
      );
      const msg = data.is_active
        ? "Division activated successfully"
        : "Division deactivated successfully";
      return ResponseHelper.success(res, 200, msg, data);
    } catch (error) {
      if (error.message === "Division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  static async destroy(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid division ID");

      await DivisionService.deleteDivision(id, req.user.userId);
      return ResponseHelper.success(res, 200, "Division deleted successfully");
    } catch (error) {
      if (error.message === "Division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      if (error.code === "23503")
        return ResponseHelper.error(
          res,
          409,
          "Division is referenced by modules and cannot be deleted. Deactivate it instead.",
        );
      next(error);
    }
  }

  // ─── Sub Division ──────────────────────────────────────────────────────────

  static async createSub(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const divisionId = parseInt(req.params.id, 10);
      if (isNaN(divisionId))
        return ResponseHelper.error(res, 400, "Invalid division ID");

      const { name, age_min, age_max } = req.body;
      const data = await DivisionService.createSubDivision(
        divisionId,
        { name, age_min, age_max },
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        201,
        "Sub division created successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      const clientErrors = [
        "age_min and age_max must be numbers",
        "age_min cannot be negative",
        "age_max must be greater than age_min",
      ];
      if (
        clientErrors.includes(error.message) ||
        /overlaps with/.test(error.message)
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async updateSub(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const subId = parseInt(req.params.subId, 10);
      if (isNaN(subId))
        return ResponseHelper.error(res, 400, "Invalid sub division ID");

      const { name, age_min, age_max } = req.body;
      const data = await DivisionService.updateSubDivision(
        subId,
        { name, age_min, age_max },
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        200,
        "Sub division updated successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Sub division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      const clientErrors = [
        "age_min and age_max must be numbers",
        "age_min cannot be negative",
        "age_max must be greater than age_min",
      ];
      if (
        clientErrors.includes(error.message) ||
        /overlaps with/.test(error.message)
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async toggleSubActive(req, res, next) {
    try {
      const subId = parseInt(req.params.subId, 10);
      if (isNaN(subId))
        return ResponseHelper.error(res, 400, "Invalid sub division ID");

      const data = await DivisionService.toggleSubDivisionActive(
        subId,
        req.user.userId,
      );
      const msg = data.is_active
        ? "Sub division activated successfully"
        : "Sub division deactivated successfully";
      return ResponseHelper.success(res, 200, msg, data);
    } catch (error) {
      if (error.message === "Sub division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  static async destroySub(req, res, next) {
    try {
      const subId = parseInt(req.params.subId, 10);
      if (isNaN(subId))
        return ResponseHelper.error(res, 400, "Invalid sub division ID");

      await DivisionService.deleteSubDivision(subId, req.user.userId);
      return ResponseHelper.success(
        res,
        200,
        "Sub division deleted successfully",
      );
    } catch (error) {
      if (error.message === "Sub division not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      if (error.code === "23503")
        return ResponseHelper.error(
          res,
          409,
          "Sub division is referenced by modules and cannot be deleted.",
        );
      next(error);
    }
  }
}

module.exports = DivisionController;

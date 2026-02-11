const ModuleService = require("../services/moduleService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class ModuleController {
  /**
   * GET /modules
   */
  static async getAll(req, res, next) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const data = await ModuleService.getAllModules(req.user.userId, {
        includeInactive,
      });
      return ResponseHelper.success(
        res,
        200,
        "Modules retrieved successfully",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /modules/:id
   */
  static async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid module ID");

      const data = await ModuleService.getModuleById(id, req.user.userId);
      return ResponseHelper.success(
        res,
        200,
        "Module retrieved successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Module not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  /**
   * POST /modules
   */
  static async create(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const { module_code, name, division_id, sub_div_id } = req.body;
      const data = await ModuleService.createModule(
        { module_code, name, division_id, sub_div_id },
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        201,
        "Module created successfully",
        data,
      );
    } catch (error) {
      const clientErrors = [
        "Module code already exists",
        "Division not found",
        "Sub division not found",
        "Division is inactive",
        "Sub division does not belong to the selected division",
        "Access denied to this division",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * PUT /modules/:id
   */
  static async update(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid module ID");

      const { module_code, name, division_id, sub_div_id } = req.body;
      const data = await ModuleService.updateModule(
        id,
        { module_code, name, division_id, sub_div_id },
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        200,
        "Module updated successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Module not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      const clientErrors = [
        "Module code already exists",
        "Division not found",
        "Sub division not found",
        "Division is inactive",
        "Sub division does not belong to the selected division",
        "Access denied to this division",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * PATCH /modules/:id/toggle-active
   */
  static async toggleActive(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid module ID");

      const data = await ModuleService.toggleModuleActive(id, req.user.userId);
      const msg = data.is_active
        ? "Module activated successfully"
        : "Module deactivated successfully";
      return ResponseHelper.success(res, 200, msg, data);
    } catch (error) {
      if (error.message === "Module not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  /**
   * DELETE /modules/:id
   */
  static async destroy(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid module ID");

      await ModuleService.deleteModule(id, req.user.userId);
      return ResponseHelper.success(res, 200, "Module deleted successfully");
    } catch (error) {
      if (error.message === "Module not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }
}

module.exports = ModuleController;

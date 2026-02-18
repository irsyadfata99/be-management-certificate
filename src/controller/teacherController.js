const TeacherService = require("../services/teacherService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class TeacherController {
  static async getAll(req, res, next) {
    try {
      const { includeInactive, search, branchId, divisionId, page, limit } =
        req.query;

      const data = await TeacherService.getAllTeachers(req.user.userId, {
        includeInactive: includeInactive === "true",
        search: search || "",
        branchId: branchId || null,
        divisionId: divisionId || null,
        page: page ? parseInt(page, 10) : 1,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      return ResponseHelper.success(
        res,
        200,
        "Teachers retrieved successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Admin does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid teacher ID");

      const data = await TeacherService.getTeacherById(id, req.user.userId);
      return ResponseHelper.success(
        res,
        200,
        "Teacher retrieved successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Teacher not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      if (error.message === "Admin does not have an assigned branch")
        return ResponseHelper.error(res, 400, error.message);
      next(error);
    }
  }

  static async create(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const { username, full_name, branch_ids, division_ids } = req.body;
      const result = await TeacherService.createTeacher(
        { username, full_name, branch_ids, division_ids },
        req.user.userId,
      );

      return ResponseHelper.success(
        res,
        201,
        "Teacher created successfully",
        result,
      );
    } catch (error) {
      const clientErrors = [
        "Username already exists",
        "At least one branch is required",
        "At least one division is required",
        "Admin does not have an assigned branch",
      ];
      const dynamicErrorPattern =
        /^(Branch|Division) (ID \d+|[A-Z]+) (not found|is inactive|does not belong)/;
      if (
        clientErrors.includes(error.message) ||
        dynamicErrorPattern.test(error.message)
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
        return ResponseHelper.error(res, 400, "Invalid teacher ID");

      const { username, full_name, branch_ids, division_ids } = req.body;
      const data = await TeacherService.updateTeacher(
        id,
        { username, full_name, branch_ids, division_ids },
        req.user.userId,
      );

      return ResponseHelper.success(
        res,
        200,
        "Teacher updated successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Teacher not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      const clientErrors = [
        "Username already exists",
        "At least one branch is required",
        "At least one division is required",
        "Admin does not have an assigned branch",
      ];
      const dynamicErrorPattern =
        /^(Branch|Division) (ID \d+|[A-Z]+) (not found|is inactive|does not belong)/;
      if (
        clientErrors.includes(error.message) ||
        dynamicErrorPattern.test(error.message)
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  static async resetPassword(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid teacher ID");

      const result = await TeacherService.resetTeacherPassword(
        id,
        req.user.userId,
      );
      return ResponseHelper.success(
        res,
        200,
        "Password reset successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Teacher not found")
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
        return ResponseHelper.error(res, 400, "Invalid teacher ID");

      const data = await TeacherService.toggleTeacherActive(
        id,
        req.user.userId,
      );
      const msg = data.is_active
        ? "Teacher activated successfully"
        : "Teacher deactivated successfully";
      return ResponseHelper.success(res, 200, msg, data);
    } catch (error) {
      if (error.message === "Teacher not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Access denied")
        return ResponseHelper.forbidden(res, error.message);
      next(error);
    }
  }

  static async migrate(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const id = parseInt(req.params.id, 10);
      if (isNaN(id))
        return ResponseHelper.error(res, 400, "Invalid teacher ID");

      const { target_branch_id } = req.body;

      const data = await TeacherService.migrateTeacher(
        id,
        parseInt(target_branch_id, 10),
        req.user.userId,
      );

      return ResponseHelper.success(
        res,
        200,
        "Teacher migrated successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Teacher not found")
        return ResponseHelper.notFound(res, error.message);
      if (error.message === "Target branch not found")
        return ResponseHelper.notFound(res, error.message);
      if (
        error.message === "Access denied" ||
        error.message === "Target branch does not belong to your head branch"
      ) {
        return ResponseHelper.forbidden(res, error.message);
      }
      if (
        error.message === "Target branch is inactive" ||
        error.message === "Teacher is already assigned to this branch" ||
        error.message === "Admin does not have an assigned branch"
      ) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = TeacherController;

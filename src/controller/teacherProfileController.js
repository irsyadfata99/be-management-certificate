const TeacherProfileService = require("../services/teacherProfileService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class TeacherProfileController {
  static async getMyProfile(req, res, next) {
    try {
      const teacherId = req.user.userId;

      const profile = await TeacherProfileService.getProfile(teacherId);

      return ResponseHelper.success(
        res,
        200,
        "Profile retrieved successfully",
        profile,
      );
    } catch (error) {
      if (error.message === "Teacher not found") {
        return ResponseHelper.notFound(res, "Teacher not found");
      }
      next(error);
    }
  }

  static async updateMyProfile(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const teacherId = req.user.userId;
      const { full_name } = req.body;

      const updated = await TeacherProfileService.updateProfile(teacherId, {
        full_name,
      });

      return ResponseHelper.success(
        res,
        200,
        "Profile updated successfully",
        updated,
      );
    } catch (error) {
      if (error.message === "Teacher not found") {
        return ResponseHelper.notFound(res, "Teacher not found");
      }
      next(error);
    }
  }

  static async getMyBranches(req, res, next) {
    try {
      const teacherId = req.user.userId;

      const branches =
        await TeacherProfileService.getAssignedBranches(teacherId);

      return ResponseHelper.success(
        res,
        200,
        "Assigned branches retrieved successfully",
        { branches },
      );
    } catch (error) {
      next(error);
    }
  }

  static async getMyDivisions(req, res, next) {
    try {
      const teacherId = req.user.userId;

      const divisions =
        await TeacherProfileService.getAssignedDivisions(teacherId);

      return ResponseHelper.success(
        res,
        200,
        "Assigned divisions retrieved successfully",
        { divisions },
      );
    } catch (error) {
      next(error);
    }
  }

  static async getMyModules(req, res, next) {
    try {
      const teacherId = req.user.userId;

      const modules =
        await TeacherProfileService.getAccessibleModules(teacherId);

      return ResponseHelper.success(
        res,
        200,
        "Accessible modules retrieved successfully",
        { modules },
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = TeacherProfileController;

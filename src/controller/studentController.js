const StudentService = require("../services/studentService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class StudentController {
  /**
   * GET /students/search?name=xxx
   * Search students (autocomplete)
   */
  static async search(req, res, next) {
    try {
      const { name } = req.query;

      if (!name || name.trim().length < 2) {
        return ResponseHelper.success(res, 200, "Search query too short", []);
      }

      const students = await StudentService.searchStudents(req.user.userId, name);

      return ResponseHelper.success(res, 200, "Students found", { students });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /students
   * Get all students with pagination and detail columns
   */
  static async getAll(req, res, next) {
    try {
      const { search, page, limit, includeInactive } = req.query;

      const result = await StudentService.getAllStudents(req.user.userId, {
        search,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
        includeInactive: includeInactive === "true",
      });

      return ResponseHelper.success(res, 200, "Students retrieved successfully", result);
    } catch (error) {
      if (error.message === "User does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /students/:id
   * Get student by ID with full detail
   */
  static async getById(req, res, next) {
    try {
      const studentId = parseInt(req.params.id, 10);

      if (isNaN(studentId)) {
        return ResponseHelper.error(res, 400, "Invalid student ID");
      }

      const student = await StudentService.getStudentById(studentId, req.user.userId);

      return ResponseHelper.success(res, 200, "Student retrieved successfully", student);
    } catch (error) {
      if (error.message === "Student not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Access denied to this student") {
        return ResponseHelper.forbidden(res, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /students/:id/history
   * Get student's certificate print history
   */
  static async getHistory(req, res, next) {
    try {
      const studentId = parseInt(req.params.id, 10);

      if (isNaN(studentId)) {
        return ResponseHelper.error(res, 400, "Invalid student ID");
      }

      const { startDate, endDate, page, limit } = req.query;

      const result = await StudentService.getStudentHistory(studentId, req.user.userId, {
        startDate,
        endDate,
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return ResponseHelper.success(res, 200, "Student history retrieved successfully", result);
    } catch (error) {
      if (error.message === "Student not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Access denied to this student") {
        return ResponseHelper.forbidden(res, error.message);
      }
      next(error);
    }
  }

  /**
   * PUT /students/:id
   * Update student name (Admin only)
   */
  static async update(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const studentId = parseInt(req.params.id, 10);

      if (isNaN(studentId)) {
        return ResponseHelper.error(res, 400, "Invalid student ID");
      }

      const { name } = req.body;

      const updated = await StudentService.updateStudent(studentId, name, req.user.userId);

      return ResponseHelper.success(res, 200, "Student updated successfully", updated);
    } catch (error) {
      if (error.message === "Student not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Access denied to this student" || error.message === "User does not have an assigned branch") {
        return ResponseHelper.forbidden(res, error.message);
      }
      if (error.message === "Student with this name already exists") {
        return ResponseHelper.error(res, 409, error.message);
      }
      next(error);
    }
  }

  /**
   * PATCH /students/:id/toggle-active
   * Toggle student active status (Admin only)
   */
  static async toggleActive(req, res, next) {
    try {
      const studentId = parseInt(req.params.id, 10);

      if (isNaN(studentId)) {
        return ResponseHelper.error(res, 400, "Invalid student ID");
      }

      const updated = await StudentService.toggleStudentActive(studentId, req.user.userId);

      const message = updated.is_active ? "Student activated successfully" : "Student deactivated successfully";

      return ResponseHelper.success(res, 200, message, updated);
    } catch (error) {
      if (error.message === "Student not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Access denied to this student" || error.message === "User does not have an assigned branch") {
        return ResponseHelper.forbidden(res, error.message);
      }
      next(error);
    }
  }

  /**
   * POST /students/:id/migrate
   * Migrate student to another sub-branch within the same head branch (Admin only)
   */
  static async migrate(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return ResponseHelper.validationError(res, errors.array());
      }

      const studentId = parseInt(req.params.id, 10);
      if (isNaN(studentId)) {
        return ResponseHelper.error(res, 400, "Invalid student ID");
      }

      const { target_branch_id } = req.body;

      const result = await StudentService.migrateStudent(studentId, parseInt(target_branch_id, 10), req.user.userId);

      return ResponseHelper.success(res, 200, "Student migrated successfully", result);
    } catch (error) {
      if (error.message === "Student not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Target branch not found") {
        return ResponseHelper.notFound(res, error.message);
      }
      if (error.message === "Access denied to this student" || error.message === "User does not have an assigned branch" || error.message === "Target branch does not belong to your head branch") {
        return ResponseHelper.forbidden(res, error.message);
      }
      if (error.message === "Target branch is inactive" || error.message === "Cannot migrate student across different head branches") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * GET /students/statistics
   * Get student statistics
   */
  static async getStatistics(req, res, next) {
    try {
      const statistics = await StudentService.getStudentStatistics(req.user.userId);

      return ResponseHelper.success(res, 200, "Statistics retrieved successfully", statistics);
    } catch (error) {
      if (error.message === "User does not have an assigned branch") {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }
}

module.exports = StudentController;

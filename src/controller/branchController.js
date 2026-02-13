const BranchService = require("../services/branchService");
const ResponseHelper = require("../utils/responseHelper");
const { validationResult } = require("express-validator");

class BranchController {
  /**
   * Get all branches (tree structure)
   * GET /branches
   */
  static async getAll(req, res, next) {
    try {
      const includeInactive = req.query.includeInactive === "true";
      const data = await BranchService.getAllBranches({ includeInactive });
      return ResponseHelper.success(
        res,
        200,
        "Branches retrieved successfully",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get head branches only (for dropdowns)
   * GET /branches/heads
   */
  static async getHeads(req, res, next) {
    try {
      const data = await BranchService.getHeadBranches();
      return ResponseHelper.success(
        res,
        200,
        "Head branches retrieved successfully",
        data,
      );
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get single branch by ID
   * GET /branches/:id
   */
  static async getById(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid branch ID");

      const data = await BranchService.getBranchById(id);
      return ResponseHelper.success(
        res,
        200,
        "Branch retrieved successfully",
        data,
      );
    } catch (error) {
      if (error.message === "Branch not found") {
        return ResponseHelper.notFound(res, "Branch not found");
      }
      next(error);
    }
  }

  /**
   * Create new branch
   * POST /branches
   */
  static async create(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const { code, name, is_head_branch, parent_id, admin_username } =
        req.body;

      const result = await BranchService.createBranch({
        code,
        name,
        is_head_branch: Boolean(is_head_branch),
        parent_id: parent_id || null,
        admin_username,
      });

      return ResponseHelper.success(
        res,
        201,
        "Branch created successfully",
        result,
      );
    } catch (error) {
      const clientErrors = [
        "Branch code already exists",
        "Sub branch must have a parent branch",
        "Parent branch not found",
        "Parent must be a head branch",
        "Parent branch is inactive",
        "Admin username is required for head branch (min 3 characters)",
        "Admin username already exists",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * Update branch
   * PUT /branches/:id
   */
  static async update(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid branch ID");

      const { code, name, parent_id } = req.body;
      const result = await BranchService.updateBranch(id, {
        code,
        name,
        parent_id,
      });

      return ResponseHelper.success(
        res,
        200,
        "Branch updated successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Branch not found") {
        return ResponseHelper.notFound(res, "Branch not found");
      }
      const clientErrors = [
        "Branch code already exists",
        "Sub branch must have a parent branch",
        "Parent branch not found",
        "Parent must be a head branch",
        "Parent branch is inactive",
        "Branch cannot be its own parent",
        "Cannot set parent for a head branch",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * Toggle branch active/inactive
   * PATCH /branches/:id/toggle-active
   */
  static async toggleActive(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid branch ID");

      const result = await BranchService.toggleBranchActive(id);
      const msg = result.branch.is_active
        ? "Branch activated successfully"
        : "Branch deactivated successfully";

      return ResponseHelper.success(
        res,
        200,
        result.message || msg,
        result.branch,
      );
    } catch (error) {
      if (error.message === "Branch not found") {
        return ResponseHelper.notFound(res, "Branch not found");
      }
      if (error.message.startsWith("Cannot activate")) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * Toggle head/sub branch type
   * PATCH /branches/:id/toggle-head
   */
  static async toggleHead(req, res, next) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty())
        return ResponseHelper.validationError(res, errors.array());

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return ResponseHelper.error(res, 400, "Invalid branch ID");

      const { is_head_branch, parent_id, admin_username } = req.body;

      const result = await BranchService.toggleHeadBranch(id, {
        is_head_branch: Boolean(is_head_branch),
        parent_id: parent_id || null,
        admin_username,
      });

      return ResponseHelper.success(
        res,
        200,
        "Branch type updated successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Branch not found") {
        return ResponseHelper.notFound(res, "Branch not found");
      }
      const clientErrors = [
        "Branch is already a head branch",
        "Branch is already a sub branch",
        "Cannot convert to sub branch while it has active sub-branches",
        "parent_id is required when converting to sub branch",
        "Parent branch not found",
        "Parent must be a head branch",
        "Parent branch is inactive",
        "Admin username is required when promoting to head branch",
        "Admin username already exists",
      ];
      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }
      next(error);
    }
  }

  /**
   * Reset admin password for head branch
   * POST /branches/:id/reset-admin-password
   */
  static async resetAdminPassword(req, res, next) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return ResponseHelper.error(res, 400, "Invalid branch ID");
      }

      const result = await BranchService.resetAdminPassword(id);

      return ResponseHelper.success(
        res,
        200,
        "Admin password reset successfully",
        result,
      );
    } catch (error) {
      if (error.message === "Branch not found") {
        return ResponseHelper.notFound(res, "Branch not found");
      }

      const clientErrors = [
        "Only head branches have admin accounts",
        "Admin account not found for this branch",
      ];

      if (clientErrors.includes(error.message)) {
        return ResponseHelper.error(res, 400, error.message);
      }

      next(error);
    }
  }
}

module.exports = BranchController;

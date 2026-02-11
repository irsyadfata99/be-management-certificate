const BranchModel = require("../models/branchModel");
const UserModel = require("../models/userModel");
const { getClient } = require("../config/database");
const crypto = require("crypto");
const PaginationHelper = require("../utils/paginationHelper");

class BranchService {
  /**
   * Generate a random password
   * Format: 8 chars alphanumeric + special
   * @returns {string}
   */
  static _generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from(
      { length: 10 },
      () => chars[crypto.randomInt(0, chars.length)],
    ).join("");
  }

  /**
   * Get all branches (structured as tree) with pagination
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getAllBranches({
    includeInactive = false,
    page = 1,
    limit = 50,
  } = {}) {
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    // Get all branches with limit/offset
    const branches = await BranchModel.findAll({
      includeInactive,
      limit: l,
      offset,
    });

    // Get total count for pagination
    const total = await BranchModel.count({ includeInactive });

    // Build tree: head branches with nested sub_branches
    const heads = branches.filter((b) => b.is_head_branch);
    const subs = branches.filter((b) => !b.is_head_branch);

    const treeData = heads.map((head) => ({
      ...head,
      sub_branches: subs.filter((s) => s.parent_id === head.id),
    }));

    return {
      branches: treeData,
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  /**
   * Get a single branch by ID
   * @param {number} id
   * @returns {Promise<Object>}
   */
  static async getBranchById(id) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    if (branch.is_head_branch) {
      const subBranches = await BranchModel.findSubBranches(id, {
        includeInactive: true,
      });
      return { ...branch, sub_branches: subBranches };
    }

    return branch;
  }

  /**
   * Get list of head branches (for dropdown) - no pagination needed
   * @returns {Promise<Array>}
   */
  static async getHeadBranches() {
    return BranchModel.findHeadBranches();
  }

  /**
   * Create a new branch
   * When creating a HEAD branch, also create an admin user account.
   *
   * @param {Object} data
   * @param {string} data.code
   * @param {string} data.name
   * @param {boolean} data.is_head_branch
   * @param {number|null} data.parent_id - required when is_head_branch = false
   * @param {string} data.admin_username - required when is_head_branch = true
   * @returns {Promise<Object>}
   */
  static async createBranch({
    code,
    name,
    is_head_branch,
    parent_id,
    admin_username,
  }) {
    // Validate code uniqueness
    const existing = await BranchModel.findByCode(code);
    if (existing) throw new Error("Branch code already exists");

    // Sub-branch must have a valid parent
    if (!is_head_branch) {
      if (!parent_id) throw new Error("Sub branch must have a parent branch");

      const parent = await BranchModel.findById(parent_id);
      if (!parent) throw new Error("Parent branch not found");
      if (!parent.is_head_branch)
        throw new Error("Parent must be a head branch");
      if (!parent.is_active) throw new Error("Parent branch is inactive");
    }

    // Head branch requires admin_username
    if (is_head_branch) {
      if (!admin_username || admin_username.trim().length < 3) {
        throw new Error(
          "Admin username is required for head branch (min 3 characters)",
        );
      }

      const existingUser = await UserModel.findByUsername(
        admin_username.trim(),
      );
      if (existingUser) throw new Error("Admin username already exists");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      // Create branch
      const branch = await BranchModel.create(
        {
          code,
          name,
          is_head_branch,
          parent_id: is_head_branch ? null : parent_id,
        },
        client,
      );

      let adminAccount = null;

      // Create admin account for head branch
      if (is_head_branch) {
        const generatedPassword = this._generatePassword();
        adminAccount = await UserModel.create(
          {
            username: admin_username.trim(),
            password: generatedPassword,
            role: "admin",
            branch_id: branch.id,
          },
          client,
        );
        // Return plain password only once (not stored anywhere)
        adminAccount.plainPassword = generatedPassword;
      }

      await client.query("COMMIT");

      return {
        branch,
        ...(adminAccount && {
          admin: {
            id: adminAccount.id,
            username: adminAccount.username,
            role: adminAccount.role,
            // Returned once - admin must change on first login
            temporaryPassword: adminAccount.plainPassword,
          },
        }),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update a branch
   * @param {number} id
   * @param {Object} data - fields to update
   * @returns {Promise<Object>}
   */
  static async updateBranch(id, { code, name, parent_id }) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    // Validate new code uniqueness
    if (code && code.toUpperCase() !== branch.code.toUpperCase()) {
      const existing = await BranchModel.findByCode(code);
      if (existing) throw new Error("Branch code already exists");
    }

    // Validate parent for sub-branch updates
    if (!branch.is_head_branch && parent_id !== undefined) {
      if (!parent_id) throw new Error("Sub branch must have a parent branch");

      const parent = await BranchModel.findById(parent_id);
      if (!parent) throw new Error("Parent branch not found");
      if (!parent.is_head_branch)
        throw new Error("Parent must be a head branch");
      if (!parent.is_active) throw new Error("Parent branch is inactive");
      if (parent.id === id) throw new Error("Branch cannot be its own parent");
    }

    // Head branches cannot have their parent changed
    if (branch.is_head_branch && parent_id !== undefined) {
      throw new Error("Cannot set parent for a head branch");
    }

    const updated = await BranchModel.update(id, { code, name, parent_id });
    if (!updated) throw new Error("Branch not found");

    return updated;
  }

  /**
   * Toggle branch active status
   * - Deactivating a HEAD branch also deactivates all its sub-branches
   * - Activating a sub-branch requires active parent
   *
   * @param {number} id
   * @returns {Promise<Object>}
   */
  static async toggleBranchActive(id) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updated = await BranchModel.toggleActive(id, client);

      const deactivatedSubCount =
        branch.is_head_branch && !updated.is_active
          ? await BranchModel.deactivateSubBranches(id, client)
          : 0;

      // If activating a sub-branch, parent must be active
      if (!branch.is_head_branch && updated.is_active && branch.parent_id) {
        const parent = await BranchModel.findById(branch.parent_id);
        if (parent && !parent.is_active) {
          await client.query("ROLLBACK");
          throw new Error(
            "Cannot activate sub branch because parent branch is inactive",
          );
        }
      }

      await client.query("COMMIT");

      return {
        branch: updated,
        ...(deactivatedSubCount > 0 && {
          message: `Branch deactivated along with ${deactivatedSubCount} sub branch(es)`,
        }),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Toggle is_head_branch flag
   * - Converting sub → head: removes parent_id
   * - Converting head → sub: requires parent_id, must have no active sub-branches
   *
   * @param {number} id
   * @param {Object} data
   * @param {boolean} data.is_head_branch
   * @param {number|null} data.parent_id - required when converting to sub-branch
   * @param {string} data.admin_username - required when converting to head branch
   * @returns {Promise<Object>}
   */
  static async toggleHeadBranch(
    id,
    { is_head_branch, parent_id, admin_username },
  ) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    if (branch.is_head_branch === is_head_branch) {
      throw new Error(
        `Branch is already a ${is_head_branch ? "head" : "sub"} branch`,
      );
    }

    // Converting HEAD → SUB
    if (!is_head_branch) {
      const hasActiveSubs = await BranchModel.hasActiveSubBranches(id);
      if (hasActiveSubs) {
        throw new Error(
          "Cannot convert to sub branch while it has active sub-branches",
        );
      }

      if (!parent_id)
        throw new Error("parent_id is required when converting to sub branch");

      const parent = await BranchModel.findById(parent_id);
      if (!parent) throw new Error("Parent branch not found");
      if (!parent.is_head_branch)
        throw new Error("Parent must be a head branch");
      if (!parent.is_active) throw new Error("Parent branch is inactive");
    }

    // Converting SUB → HEAD: need admin account
    if (is_head_branch) {
      if (!admin_username || admin_username.trim().length < 3) {
        throw new Error(
          "Admin username is required when promoting to head branch",
        );
      }
      const existingUser = await UserModel.findByUsername(
        admin_username.trim(),
      );
      if (existingUser) throw new Error("Admin username already exists");
    }

    const client = await getClient();
    try {
      await client.query("BEGIN");

      const updateData = {
        is_head_branch,
        parent_id: is_head_branch ? null : parent_id,
      };

      const updated = await BranchModel.update(id, updateData, client);
      if (!updated) throw new Error("Branch not found");

      let adminAccount = null;

      if (is_head_branch) {
        const generatedPassword = this._generatePassword();
        adminAccount = await UserModel.create(
          {
            username: admin_username.trim(),
            password: generatedPassword,
            role: "admin",
            branch_id: updated.id,
          },
          client,
        );
        adminAccount.plainPassword = generatedPassword;
      }

      await client.query("COMMIT");

      return {
        branch: updated,
        ...(adminAccount && {
          admin: {
            id: adminAccount.id,
            username: adminAccount.username,
            role: adminAccount.role,
            temporaryPassword: adminAccount.plainPassword,
          },
        }),
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = BranchService;

const BranchModel = require("../models/branchModel");
const UserModel = require("../models/userModel");
const { getClient, query } = require("../config/database");
const crypto = require("crypto");
const PaginationHelper = require("../utils/paginationHelper");

class BranchService {
  static _generatePassword() {
    const chars =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
    return Array.from(
      { length: 10 },
      () => chars[crypto.randomInt(0, chars.length)],
    ).join("");
  }

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
    const branches = await BranchModel.findAll({
      includeInactive,
      limit: l,
      offset,
    });

    const total = await BranchModel.count({ includeInactive });

    const heads = branches.filter((b) => b.is_head_branch);
    const subs = branches.filter((b) => !b.is_head_branch);

    const treeData = heads.map((head) => ({
      ...head,
      sub_branches: subs.filter((s) => s.parent_id === head.id),
    }));

    const allBranches = branches;
    const activeBranches = branches.filter((b) => b.is_active);

    return {
      branches: treeData,
      stats: {
        total: allBranches.length,
        active: activeBranches.length,
        inactive: allBranches.length - activeBranches.length,
        headBranches: heads.length,
        subBranches: subs.length,
      },
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  static async getBranchById(id) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    const response = {
      ...branch,
      sub_branches: [],
      admin: null,
    };

    if (branch.is_head_branch) {
      const adminResult = await query(
        `SELECT id, username, full_name 
         FROM users 
         WHERE branch_id = $1 AND role = 'admin' AND is_active = true
         LIMIT 1`,
        [id],
      );

      if (adminResult.rows.length > 0) {
        response.admin = {
          id: adminResult.rows[0].id,
          username: adminResult.rows[0].username,
          full_name: adminResult.rows[0].full_name,
        };
      }
      const subBranches = await BranchModel.findSubBranches(id, {
        includeInactive: true,
      });
      response.sub_branches = subBranches;
    }

    return response;
  }

  static async getHeadBranches() {
    return BranchModel.findHeadBranches();
  }

  static async createBranch({
    code,
    name,
    is_head_branch,
    parent_id,
    admin_username,
  }) {
    const existing = await BranchModel.findByCode(code);
    if (existing) throw new Error("Branch code already exists");

    if (!is_head_branch) {
      if (!parent_id) throw new Error("Sub branch must have a parent branch");

      const parent = await BranchModel.findById(parent_id);
      if (!parent) throw new Error("Parent branch not found");
      if (!parent.is_head_branch)
        throw new Error("Parent must be a head branch");
      if (!parent.is_active) throw new Error("Parent branch is inactive");
    }

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
      if (is_head_branch) {
        const generatedPassword = this._generatePassword();
        adminAccount = await UserModel.create(
          {
            username: admin_username.trim(),
            password: generatedPassword,
            role: "admin",
            full_name: `Admin ${name}`,
            branch_id: branch.id,
          },
          client,
        );
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

  static async updateBranch(id, { code, name, parent_id }) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    if (code && code.toUpperCase() !== branch.code.toUpperCase()) {
      const existing = await BranchModel.findByCode(code);
      if (existing) throw new Error("Branch code already exists");
    }

    if (!branch.is_head_branch && parent_id !== undefined) {
      if (!parent_id) throw new Error("Sub branch must have a parent branch");

      const parent = await BranchModel.findById(parent_id);
      if (!parent) throw new Error("Parent branch not found");
      if (!parent.is_head_branch)
        throw new Error("Parent must be a head branch");
      if (!parent.is_active) throw new Error("Parent branch is inactive");
      if (parent.id === id) throw new Error("Branch cannot be its own parent");
    }

    if (branch.is_head_branch && parent_id !== undefined) {
      throw new Error("Cannot set parent for a head branch");
    }

    const updated = await BranchModel.update(id, { code, name, parent_id });
    if (!updated) throw new Error("Branch not found");

    return updated;
  }

  static async deleteBranch(id) {
    const branch = await BranchModel.findById(id);
    if (!branch) throw new Error("Branch not found");

    if (branch.is_head_branch) {
      const hasActiveSubs = await BranchModel.hasActiveSubBranches(id);
      if (hasActiveSubs) {
        throw new Error("Cannot delete branch with active sub-branches");
      }
    }

    const teacherCheck = await query(
      `SELECT COUNT(*) FROM users 
       WHERE branch_id = $1 AND role = 'teacher' AND is_active = true`,
      [id],
    );

    if (parseInt(teacherCheck.rows[0].count, 10) > 0) {
      throw new Error("Cannot delete branch with active teachers");
    }

    const certCheck = await query(
      `SELECT COUNT(*) FROM certificates 
       WHERE current_branch_id = $1 OR head_branch_id = $1`,
      [id],
    );

    if (parseInt(certCheck.rows[0].count, 10) > 0) {
      throw new Error("Cannot delete branch with certificates");
    }
    await query(`DELETE FROM branches WHERE id = $1`, [id]);
  }

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
            full_name: `Admin ${branch.name}`,
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

  static async resetAdminPassword(branchId) {
    const branch = await BranchModel.findById(branchId);
    if (!branch) throw new Error("Branch not found");

    if (!branch.is_head_branch) {
      throw new Error("Only head branches have admin accounts");
    }

    const result = await query(
      `SELECT id, username, full_name 
       FROM users 
       WHERE branch_id = $1 AND role = 'admin' AND is_active = true
       LIMIT 1`,
      [branchId],
    );

    if (result.rows.length === 0) {
      throw new Error("Admin account not found for this branch");
    }

    const admin = result.rows[0];
    const newPassword = this._generatePassword();

    await UserModel.updatePassword(admin.id, newPassword);

    return {
      username: admin.username,
      full_name: admin.full_name,
      temporaryPassword: newPassword,
    };
  }
}

module.exports = BranchService;

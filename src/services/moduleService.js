const ModuleModel = require("../models/moduleModel");
const DivisionModel = require("../models/divisionModel");
const { query } = require("../config/database");
const PaginationHelper = require("../utils/paginationHelper");

class ModuleService {
  /**
   * Validate division ownership by admin
   * @param {number} divisionId
   * @param {number} adminId
   * @returns {Promise<Object>} division
   */
  static async _validateDivisionOwnership(divisionId, adminId) {
    const division = await DivisionModel.findById(divisionId);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId)
      throw new Error("Access denied to this division");
    if (!division.is_active) throw new Error("Division is inactive");
    return division;
  }

  /**
   * Get all modules by admin with pagination
   * @param {number} adminId
   * @param {Object} options
   * @param {boolean} [options.includeInactive=false]
   * @param {number}  [options.page=1]   - Page number (1-indexed)
   * @param {number}  [options.limit=8]  - Items per page (max 50)
   * @returns {Promise<{ modules: Array, pagination: Object }>}
   */
  static async getAllModules(
    adminId,
    { includeInactive = false, page = 1, limit = 8 } = {},
  ) {
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    const modules = await ModuleModel.findAllByAdmin(adminId, {
      includeInactive,
      limit: l,
      offset,
    });

    const total = await ModuleModel.countByAdmin(adminId, { includeInactive });

    return {
      modules,
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  /**
   * Get module by ID (validates admin ownership)
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getModuleById(id, adminId) {
    const module = await ModuleModel.findById(id);
    if (!module) throw new Error("Module not found");
    if (module.created_by !== adminId) throw new Error("Access denied");
    return module;
  }

  /**
   * Create module
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async createModule(
    { module_code, name, division_id, sub_div_id },
    adminId,
  ) {
    // Validate code uniqueness
    const existing = await ModuleModel.findByCode(module_code);
    if (existing) throw new Error("Module code already exists");

    // Validate division
    await this._validateDivisionOwnership(division_id, adminId);

    // Validate sub_div_id belongs to division
    if (sub_div_id) {
      const sub = await DivisionModel.findSubById(sub_div_id);
      if (!sub) throw new Error("Sub division not found");
      if (sub.division_id !== division_id) {
        throw new Error(
          "Sub division does not belong to the selected division",
        );
      }
    }

    return ModuleModel.create({
      module_code: module_code.trim(),
      name: name.trim(),
      division_id,
      sub_div_id: sub_div_id || null,
      created_by: adminId,
    });
  }

  /**
   * Update module
   * @param {number} id
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateModule(
    id,
    { module_code, name, division_id, sub_div_id },
    adminId,
  ) {
    const module = await ModuleModel.findById(id);
    if (!module) throw new Error("Module not found");
    if (module.created_by !== adminId) throw new Error("Access denied");

    // Validate new code uniqueness
    if (
      module_code &&
      module_code.toUpperCase() !== module.module_code.toUpperCase()
    ) {
      const existing = await ModuleModel.findByCode(module_code);
      if (existing) throw new Error("Module code already exists");
    }

    // Resolve final division_id for sub_div validation
    const finalDivisionId = division_id ?? module.division_id;

    // Validate new division
    if (division_id !== undefined) {
      await this._validateDivisionOwnership(division_id, adminId);
    }

    // Validate sub_div belongs to division
    if (sub_div_id !== undefined && sub_div_id !== null) {
      const sub = await DivisionModel.findSubById(sub_div_id);
      if (!sub) throw new Error("Sub division not found");
      if (sub.division_id !== finalDivisionId) {
        throw new Error(
          "Sub division does not belong to the selected division",
        );
      }
    }

    const updated = await ModuleModel.update(id, {
      module_code: module_code?.trim(),
      name: name?.trim(),
      division_id,
      sub_div_id,
    });

    if (!updated) throw new Error("Module not found");
    return ModuleModel.findById(id);
  }

  /**
   * Toggle module active
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleModuleActive(id, adminId) {
    const module = await ModuleModel.findById(id);
    if (!module) throw new Error("Module not found");
    if (module.created_by !== adminId) throw new Error("Access denied");

    return ModuleModel.toggleActive(id);
  }

  /**
   * Delete module
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<void>}
   */
  static async deleteModule(id, adminId) {
    const module = await ModuleModel.findById(id);
    if (!module) throw new Error("Module not found");
    if (module.created_by !== adminId) throw new Error("Access denied");

    const deleted = await ModuleModel.deleteById(id);
    if (!deleted) throw new Error("Module not found");
  }

  /**
   * Get modules accessible by a teacher (based on their divisions)
   * @param {number} teacherId
   * @returns {Promise<Array>}
   */
  static async getModulesForTeacher(teacherId) {
    return ModuleModel.findByTeacher(teacherId);
  }
}

module.exports = ModuleService;

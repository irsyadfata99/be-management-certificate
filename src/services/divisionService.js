const DivisionModel = require("../models/divisionModel");
const { getClient } = require("../config/database");

class DivisionService {
  /**
   * Get all divisions for the current admin with pagination
   * @param {number} adminId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getAllDivisions(
    adminId,
    { includeInactive = false, page = 1, limit = 50 } = {},
  ) {
    const offset = (page - 1) * limit;

    const divisions = await DivisionModel.findAllByAdmin(adminId, {
      includeInactive,
      limit,
      offset,
    });

    const total = await DivisionModel.countByAdmin(adminId, {
      includeInactive,
    });

    return {
      divisions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get single division by ID (validates ownership)
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async getDivisionById(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");
    return division;
  }

  /**
   * Create division with optional sub divisions
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async createDivision({ name, sub_divisions = [] }, adminId) {
    const client = await getClient();
    try {
      await client.query("BEGIN");

      const division = await DivisionModel.create(
        { name: name.trim(), created_by: adminId },
        client,
      );

      const createdSubs = [];
      for (const sub of sub_divisions) {
        this._validateAgeRange(sub.age_min, sub.age_max);

        // Check overlap among subs being created (in-memory check before DB)
        const overlapInBatch = createdSubs.some(
          (s) => s.age_min <= sub.age_max && s.age_max >= sub.age_min,
        );
        if (overlapInBatch) {
          throw new Error(
            `Age range ${sub.age_min}-${sub.age_max} overlaps with another sub division in this request`,
          );
        }

        const created = await DivisionModel.createSub(
          {
            division_id: division.id,
            name: sub.name.trim(),
            age_min: sub.age_min,
            age_max: sub.age_max,
          },
          client,
        );
        createdSubs.push(created);
      }

      await client.query("COMMIT");
      return { ...division, sub_divisions: createdSubs };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update division name
   * @param {number} id
   * @param {string} name
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateDivision(id, name, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    const updated = await DivisionModel.update(id, name.trim());
    return updated;
  }

  /**
   * Toggle division active
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleDivisionActive(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    return DivisionModel.toggleActive(id);
  }

  /**
   * Delete division (only if no modules depend on it)
   * @param {number} id
   * @param {number} adminId
   * @returns {Promise<void>}
   */
  static async deleteDivision(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    const deleted = await DivisionModel.deleteById(id);
    if (!deleted) throw new Error("Division not found");
  }

  // ─── Sub Division ─────────────────────────────────────────────────────────

  /**
   * Add sub division to a division
   * @param {number} divisionId
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async createSubDivision(
    divisionId,
    { name, age_min, age_max },
    adminId,
  ) {
    const division = await DivisionModel.findById(divisionId);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    this._validateAgeRange(age_min, age_max);

    const hasOverlap = await DivisionModel.hasAgeRangeOverlap(
      divisionId,
      age_min,
      age_max,
    );
    if (hasOverlap) {
      throw new Error(
        `Age range ${age_min}-${age_max} overlaps with an existing sub division`,
      );
    }

    return DivisionModel.createSub({
      division_id: divisionId,
      name: name.trim(),
      age_min,
      age_max,
    });
  }

  /**
   * Update sub division
   * @param {number} subId
   * @param {Object} data
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async updateSubDivision(subId, { name, age_min, age_max }, adminId) {
    const sub = await DivisionModel.findSubById(subId);
    if (!sub) throw new Error("Sub division not found");

    const division = await DivisionModel.findById(sub.division_id);
    if (!division || division.created_by !== adminId)
      throw new Error("Access denied");

    if (age_min !== undefined && age_max !== undefined) {
      this._validateAgeRange(age_min, age_max);
      const hasOverlap = await DivisionModel.hasAgeRangeOverlap(
        sub.division_id,
        age_min,
        age_max,
        subId,
      );
      if (hasOverlap)
        throw new Error(
          `Age range ${age_min}-${age_max} overlaps with an existing sub division`,
        );
    }

    return DivisionModel.updateSub(subId, {
      name: name?.trim(),
      age_min,
      age_max,
    });
  }

  /**
   * Toggle sub division active
   * @param {number} subId
   * @param {number} adminId
   * @returns {Promise<Object>}
   */
  static async toggleSubDivisionActive(subId, adminId) {
    const sub = await DivisionModel.findSubById(subId);
    if (!sub) throw new Error("Sub division not found");

    const division = await DivisionModel.findById(sub.division_id);
    if (!division || division.created_by !== adminId)
      throw new Error("Access denied");

    return DivisionModel.toggleSubActive(subId);
  }

  /**
   * Delete sub division
   * @param {number} subId
   * @param {number} adminId
   * @returns {Promise<void>}
   */
  static async deleteSubDivision(subId, adminId) {
    const sub = await DivisionModel.findSubById(subId);
    if (!sub) throw new Error("Sub division not found");

    const division = await DivisionModel.findById(sub.division_id);
    if (!division || division.created_by !== adminId)
      throw new Error("Access denied");

    const deleted = await DivisionModel.deleteSubById(subId);
    if (!deleted) throw new Error("Sub division not found");
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  static _validateAgeRange(ageMin, ageMax) {
    if (typeof ageMin !== "number" || typeof ageMax !== "number") {
      throw new Error("age_min and age_max must be numbers");
    }
    if (ageMin < 0) throw new Error("age_min cannot be negative");
    if (ageMax <= ageMin)
      throw new Error("age_max must be greater than age_min");
  }
}

module.exports = DivisionService;

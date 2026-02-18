const DivisionModel = require("../models/divisionModel");
const { getClient } = require("../config/database");
const PaginationHelper = require("../utils/paginationHelper");

class DivisionService {
  static async getAllDivisions(
    adminId,
    { includeInactive = false, page = 1, limit = 50 } = {},
  ) {
    const {
      page: p,
      limit: l,
      offset,
    } = PaginationHelper.fromQuery({ page, limit });

    const divisions = await DivisionModel.findAllByAdmin(adminId, {
      includeInactive,
      limit: l,
      offset,
    });

    const total = await DivisionModel.countByAdmin(adminId, {
      includeInactive,
    });

    return {
      divisions,
      pagination: PaginationHelper.buildResponse(p, l, total),
    };
  }

  static async getDivisionById(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");
    return division;
  }
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

  static async updateDivision(id, name, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    const updated = await DivisionModel.update(id, name.trim());
    return updated;
  }

  static async toggleDivisionActive(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    return DivisionModel.toggleActive(id);
  }

  static async deleteDivision(id, adminId) {
    const division = await DivisionModel.findById(id);
    if (!division) throw new Error("Division not found");
    if (division.created_by !== adminId) throw new Error("Access denied");

    const deleted = await DivisionModel.deleteById(id);
    if (!deleted) throw new Error("Division not found");
  }

  // ─── Sub Division ─────────────────────────────────────────────────────────

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

  static async toggleSubDivisionActive(subId, adminId) {
    const sub = await DivisionModel.findSubById(subId);
    if (!sub) throw new Error("Sub division not found");

    const division = await DivisionModel.findById(sub.division_id);
    if (!division || division.created_by !== adminId)
      throw new Error("Access denied");

    return DivisionModel.toggleSubActive(subId);
  }

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

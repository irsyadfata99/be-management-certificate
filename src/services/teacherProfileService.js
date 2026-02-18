const TeacherModel = require("../models/teacherModel");
const ModuleModel = require("../models/moduleModel");
const { query } = require("../config/database");

class TeacherProfileService {
  static async getProfile(teacherId) {
    const teacher = await TeacherModel.findById(teacherId);

    if (!teacher) {
      throw new Error("Teacher not found");
    }

    return {
      id: teacher.id,
      username: teacher.username,
      full_name: teacher.full_name,
      is_active: teacher.is_active,
      branches: teacher.branches,
      divisions: teacher.divisions,
      createdAt: teacher.createdAt,
      updatedAt: teacher.updatedAt,
    };
  }

  static async updateProfile(teacherId, { full_name }) {
    const teacher = await TeacherModel.findById(teacherId);

    if (!teacher) {
      throw new Error("Teacher not found");
    }

    const updated = await TeacherModel.update(teacherId, {
      full_name: full_name.trim(),
    });

    if (!updated) {
      throw new Error("Failed to update profile");
    }

    return {
      id: updated.id,
      username: updated.username,
      full_name: updated.full_name,
      updatedAt: updated.updatedAt,
    };
  }

  static async getAssignedBranches(teacherId) {
    const result = await query(
      `SELECT 
         b.id,
         b.code,
         b.name,
         b.is_head_branch,
         b.parent_id,
         pb.code AS parent_code,
         pb.name AS parent_name
       FROM teacher_branches tb
       JOIN branches b ON tb.branch_id = b.id
       LEFT JOIN branches pb ON b.parent_id = pb.id
       WHERE tb.teacher_id = $1 AND b.is_active = true
       ORDER BY b.is_head_branch DESC, b.code ASC`,
      [teacherId],
    );

    return result.rows;
  }

  static async getAssignedDivisions(teacherId) {
    const result = await query(
      `SELECT 
         d.id,
         d.name,
         d.is_active,
         COUNT(sd.id) AS sub_division_count
       FROM teacher_divisions td
       JOIN divisions d ON td.division_id = d.id
       LEFT JOIN sub_divisions sd ON sd.division_id = d.id AND sd.is_active = true
       WHERE td.teacher_id = $1 AND d.is_active = true
       GROUP BY d.id, d.name, d.is_active
       ORDER BY d.name ASC`,
      [teacherId],
    );

    return result.rows;
  }

  static async getAccessibleModules(teacherId) {
    return ModuleModel.findByTeacher(teacherId);
  }
}

module.exports = TeacherProfileService;

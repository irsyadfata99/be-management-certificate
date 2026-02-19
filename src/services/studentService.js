const StudentModel = require("../models/studentModel");
const { query } = require("../config/database");

class StudentService {
  static async _getHeadBranchId(userId) {
    const result = await query(
      `SELECT u.branch_id, u.role, b.is_head_branch, b.parent_id
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId],
    );

    const user = result.rows[0];
    if (!user) throw new Error("User not found");

    if (user.role === "superAdmin") return null;

    if (!user.branch_id) throw new Error("User does not have an assigned branch");

    return user.is_head_branch ? user.branch_id : user.parent_id;
  }

  static _formatDetail(s) {
    return {
      id: s.id,
      name: s.name,
      head_branch_id: s.head_branch_id,
      head_branch_code: s.head_branch_code,
      head_branch_name: s.head_branch_name,
      is_active: s.is_active,
      division: s.division_id ? { id: s.division_id, name: s.division_name } : null,
      sub_division: s.sub_division_id ? { id: s.sub_division_id, name: s.sub_division_name } : null,
      current_module: s.current_module_id ? { id: s.current_module_id, name: s.current_module_name } : null,
      current_teacher: s.current_teacher_id ? { id: s.current_teacher_id, name: s.current_teacher_name } : null,
      last_issued_certificate: s.last_print_id
        ? {
            id: s.last_print_id,
            issued_at: s.last_issued_at,
            branch_id: s.last_issued_branch_id,
            branch_code: s.last_issued_branch_code,
            branch_name: s.last_issued_branch_name,
          }
        : null,
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  }

  static async findOrBuildStudent(studentName, headBranchId) {
    if (!studentName || studentName.trim().length === 0) {
      throw new Error("Student name is required");
    }

    if (!headBranchId) {
      throw new Error("Head branch ID is required");
    }

    const trimmedName = studentName.trim();

    // Hanya cari, tidak buat
    const existing = await StudentModel.findByNameAndBranch(trimmedName, headBranchId);

    // Return existing student atau object sementara tanpa id
    // (id = null berarti student baru, reprint pasti false)
    return existing || { id: null, name: trimmedName };
  }

  static async createOrGetStudent(studentName, headBranchId, client = null) {
    if (!studentName || studentName.trim().length === 0) {
      throw new Error("Student name is required");
    }

    if (!headBranchId) {
      throw new Error("Head branch ID is required");
    }

    const trimmedName = studentName.trim();

    const existing = await StudentModel.findByNameAndBranch(trimmedName, headBranchId);
    if (existing) return existing;

    return StudentModel.create({ name: trimmedName, head_branch_id: headBranchId }, client);
  }

  static async searchStudents(userId, searchTerm) {
    const headBranchId = await this._getHeadBranchId(userId);

    const students = await StudentModel.searchByName(searchTerm, headBranchId, {
      limit: 50,
      offset: 0,
      includeInactive: false,
    });

    return students.map((s) => ({
      id: s.id,
      name: s.name,
      head_branch_id: s.head_branch_id,
      head_branch_code: s.head_branch_code,
      head_branch_name: s.head_branch_name,
    }));
  }

  static async getAllStudents(userId, { page = 1, limit = 50, search = null, includeInactive = false } = {}) {
    const headBranchId = await this._getHeadBranchId(userId);
    const offset = (page - 1) * limit;

    let students;

    if (search && search.trim().length >= 2) {
      students = await StudentModel.searchByName(search, headBranchId, {
        limit,
        offset,
        includeInactive,
      });
    } else {
      students = await StudentModel.findByHeadBranch(headBranchId, {
        limit,
        offset,
        includeInactive,
      });
    }

    const total = await StudentModel.countByHeadBranch(headBranchId, includeInactive);

    return {
      students: students.map(this._formatDetail),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getStudentById(studentId, userId) {
    const headBranchId = await this._getHeadBranchId(userId);

    const student = await StudentModel.findByIdWithDetail(studentId);
    if (!student) throw new Error("Student not found");

    // superAdmin: akses semua
    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return this._formatDetail(student);
  }

  static async _getStudentWithAccess(studentId, userId) {
    const headBranchId = await this._getHeadBranchId(userId);

    const student = await StudentModel.findById(studentId);
    if (!student) throw new Error("Student not found");

    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return { student, headBranchId };
  }

  static async getStudentHistory(studentId, userId, { startDate, endDate, page = 1, limit = 20 } = {}) {
    await this._getStudentWithAccess(studentId, userId);

    const offset = (page - 1) * limit;
    const params = [studentId];
    let paramIndex = 2;
    let dateFilter = "";

    if (startDate) {
      dateFilter += ` AND cp.created_at >= $${paramIndex++}`;
      params.push(startDate);
    }
    if (endDate) {
      dateFilter += ` AND cp.created_at <= $${paramIndex++}`;
      params.push(endDate);
    }

    const historyResult = await query(
      `SELECT
         cp.id,
         cp.created_at AS issued_at,
         m.id   AS module_id,       m.name AS module_name,
         sd.id  AS sub_division_id, sd.name AS sub_division_name,
         d.id   AS division_id,     d.name AS division_name,
         t.id   AS teacher_id,      t.full_name AS teacher_name,
         b.id   AS branch_id,       b.code AS branch_code, b.name AS branch_name
       FROM certificate_prints cp
       JOIN modules m        ON cp.module_id    = m.id
       LEFT JOIN sub_divisions sd ON m.sub_div_id    = sd.id   -- FIX: was INNER JOIN
       LEFT JOIN divisions     d  ON sd.division_id  = d.id    -- FIX: was INNER JOIN
       JOIN users t          ON cp.teacher_id   = t.id
       JOIN branches b       ON cp.branch_id    = b.id
       WHERE cp.student_id = $1${dateFilter}
       ORDER BY cp.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset],
    );

    const countResult = await query(`SELECT COUNT(*) FROM certificate_prints cp WHERE cp.student_id = $1${dateFilter}`, params);

    return {
      history: historyResult.rows.map((r) => ({
        id: r.id,
        issued_at: r.issued_at,
        module: { id: r.module_id, name: r.module_name },
        sub_division: r.sub_division_id ? { id: r.sub_division_id, name: r.sub_division_name } : null,
        division: r.division_id ? { id: r.division_id, name: r.division_name } : null,
        teacher: { id: r.teacher_id, name: r.teacher_name },
        branch: { id: r.branch_id, code: r.branch_code, name: r.branch_name },
      })),
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(parseInt(countResult.rows[0].count, 10) / limit),
      },
    };
  }

  static async updateStudent(studentId, name, userId) {
    const { student } = await this._getStudentWithAccess(studentId, userId);

    const duplicate = await StudentModel.findByNameAndBranch(name, student.head_branch_id);
    if (duplicate && duplicate.id !== studentId) {
      throw new Error("Student with this name already exists");
    }

    const updated = await StudentModel.update(studentId, { name });

    return {
      id: updated.id,
      name: updated.name,
      head_branch_id: updated.head_branch_id,
      is_active: updated.is_active,
      updated_at: updated.updated_at,
    };
  }

  static async toggleStudentActive(studentId, userId) {
    await this._getStudentWithAccess(studentId, userId);
    return StudentModel.toggleActive(studentId);
  }

  static async migrateStudent(studentId, targetBranchId, userId) {
    const { student, headBranchId } = await this._getStudentWithAccess(studentId, userId);

    const branchResult = await query(
      `SELECT id, code, name, is_active, is_head_branch, parent_id
       FROM branches WHERE id = $1`,
      [targetBranchId],
    );

    const targetBranch = branchResult.rows[0];
    if (!targetBranch) throw new Error("Target branch not found");
    if (!targetBranch.is_active) throw new Error("Target branch is inactive");

    const targetHeadBranchId = targetBranch.is_head_branch ? targetBranch.id : targetBranch.parent_id;

    if (headBranchId !== null && targetHeadBranchId !== headBranchId) {
      throw new Error("Target branch does not belong to your head branch");
    }

    if (targetHeadBranchId !== student.head_branch_id) {
      throw new Error("Cannot migrate student across different head branches");
    }

    return {
      id: student.id,
      name: student.name,
      head_branch_id: student.head_branch_id,
      is_active: student.is_active,
      migrated_to_branch: {
        id: targetBranch.id,
        code: targetBranch.code,
        name: targetBranch.name,
      },
      note: "Student migration recorded. Future certificate prints should use the target branch.",
    };
  }

  static async getStudentStatistics(userId) {
    const headBranchId = await this._getHeadBranchId(userId);

    const stats = await StudentModel.getStatistics(headBranchId);

    return {
      head_branch_id: headBranchId,
      statistics: stats,
    };
  }
}

module.exports = StudentService;

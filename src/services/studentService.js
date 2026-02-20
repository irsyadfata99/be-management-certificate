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

    if (!user.branch_id)
      throw new Error("User does not have an assigned branch");

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
      division: s.division_id
        ? { id: s.division_id, name: s.division_name }
        : null,
      sub_division: s.sub_division_id
        ? { id: s.sub_division_id, name: s.sub_division_name }
        : null,
      current_module: s.current_module_id
        ? { id: s.current_module_id, name: s.current_module_name }
        : null,
      current_teacher: s.current_teacher_id
        ? { id: s.current_teacher_id, name: s.current_teacher_name }
        : null,
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

  // FIX: Hapus findOrBuildStudent() — dead code, sudah digantikan sepenuhnya
  // oleh createOrGetStudent() yang atomic (INSERT ... ON CONFLICT).

  static async createOrGetStudent(studentName, headBranchId, client = null) {
    if (!studentName || studentName.trim().length === 0) {
      throw new Error("Student name is required");
    }

    if (!headBranchId) {
      throw new Error("Head branch ID is required");
    }

    const trimmedName = studentName.trim();

    // Gunakan INSERT ... ON CONFLICT di model untuk atomic upsert,
    // menghindari race condition dari dua query terpisah (find + create).
    return StudentModel.create(
      { name: trimmedName, head_branch_id: headBranchId },
      client,
    );
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

  static async getAllStudents(
    userId,
    { page = 1, limit = 50, search = null, includeInactive = false } = {},
  ) {
    const headBranchId = await this._getHeadBranchId(userId);
    const offset = (page - 1) * limit;

    const isSearching = search && search.trim().length >= 2;

    let students;
    let total;

    if (isSearching) {
      // FIX: total harus pakai countBySearch agar pagination akurat saat search aktif
      [students, total] = await Promise.all([
        StudentModel.searchByName(search, headBranchId, {
          limit,
          offset,
          includeInactive,
        }),
        StudentModel.countBySearch(search, headBranchId, includeInactive),
      ]);
    } else {
      [students, total] = await Promise.all([
        StudentModel.findByHeadBranch(headBranchId, {
          limit,
          offset,
          includeInactive,
        }),
        StudentModel.countByHeadBranch(headBranchId, includeInactive),
      ]);
    }

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

  static async getStudentHistory(
    studentId,
    userId,
    { startDate, endDate, page = 1, limit = 20 } = {},
  ) {
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

    // FIX: LIMIT dan OFFSET pakai paramIndex eksplisit lewat push,
    // hindari ekspresi $${paramIndex} dan $${paramIndex + 1} yang rawan off-by-one
    const limitIndex = paramIndex++;
    const offsetIndex = paramIndex++;

    const [historyResult, countResult] = await Promise.all([
      query(
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
         LEFT JOIN sub_divisions sd ON m.sub_div_id    = sd.id
         LEFT JOIN divisions     d  ON sd.division_id  = d.id
         JOIN users t          ON cp.teacher_id   = t.id
         JOIN branches b       ON cp.branch_id    = b.id
         WHERE cp.student_id = $1${dateFilter}
         ORDER BY cp.created_at DESC
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        [...params, limit, offset],
      ),
      query(
        `SELECT COUNT(*) FROM certificate_prints cp WHERE cp.student_id = $1${dateFilter}`,
        params,
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    return {
      history: historyResult.rows.map((r) => ({
        id: r.id,
        issued_at: r.issued_at,
        module: { id: r.module_id, name: r.module_name },
        sub_division: r.sub_division_id
          ? { id: r.sub_division_id, name: r.sub_division_name }
          : null,
        division: r.division_id
          ? { id: r.division_id, name: r.division_name }
          : null,
        teacher: { id: r.teacher_id, name: r.teacher_name },
        branch: { id: r.branch_id, code: r.branch_code, name: r.branch_name },
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async updateStudent(studentId, name, userId) {
    const { student } = await this._getStudentWithAccess(studentId, userId);

    const duplicate = await StudentModel.findByNameAndBranch(
      name,
      student.head_branch_id,
    );
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
    const { student, headBranchId } = await this._getStudentWithAccess(
      studentId,
      userId,
    );

    const branchResult = await query(
      `SELECT id, code, name, is_active, is_head_branch, parent_id
       FROM branches WHERE id = $1`,
      [targetBranchId],
    );

    const targetBranch = branchResult.rows[0];
    if (!targetBranch) throw new Error("Target branch not found");
    if (!targetBranch.is_active) throw new Error("Target branch is inactive");

    const targetHeadBranchId = targetBranch.is_head_branch
      ? targetBranch.id
      : targetBranch.parent_id;

    // FIX: Gabungkan dua check redundant menjadi satu check yang jelas.
    // Untuk non-superAdmin: pastikan target masih dalam head branch yang sama.
    // Untuk superAdmin (headBranchId === null): hanya cegah migrasi lintas head branch.
    if (
      headBranchId !== null
        ? targetHeadBranchId !== headBranchId
        : targetHeadBranchId !== student.head_branch_id
    ) {
      throw new Error(
        "Target branch does not belong to the same head branch as the student",
      );
    }

    await StudentModel.update(studentId, {
      head_branch_id: targetHeadBranchId,
    });

    return {
      id: student.id,
      name: student.name,
      head_branch_id: targetHeadBranchId,
      is_active: student.is_active,
      migrated_to_branch: {
        id: targetBranch.id,
        code: targetBranch.code,
        name: targetBranch.name,
      },
      note: "Student migrated successfully. Future certificate prints will use the new branch.",
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

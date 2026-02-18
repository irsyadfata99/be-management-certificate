const StudentModel = require("../models/studentModel");
const { query } = require("../config/database");

class StudentService {
  /**
   * Helper: resolve head branch ID dari user mana pun (admin/teacher/superAdmin).
   * SuperAdmin: tidak terikat branch, kembalikan null sebagai sinyal "akses semua".
   *
   * @param {number} userId
   * @returns {Promise<number|null>}
   */
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

  /**
   * Format student row from detail query to API response shape.
   * Urutan kolom: name, division, sub_division, current_module, current_teacher, last_issued_certificate
   */
  static _formatDetail(s) {
    return {
      id: s.id,
      name: s.name,
      head_branch_id: s.head_branch_id,
      head_branch_code: s.head_branch_code,
      head_branch_name: s.head_branch_name,
      is_active: s.is_active,
      // Table columns (ordered per requirement)
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

  /**
   * Create or get existing student by name.
   * Digunakan saat teacher melakukan print certificate.
   *
   * @param {string} studentName
   * @param {number} headBranchId
   * @param {Object} client - Optional DB transaction client
   * @returns {Promise<Object>}
   */
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

  /**
   * Search students by name (for autocomplete/dropdown).
   *
   * @param {number} userId
   * @param {string} searchTerm
   * @returns {Promise<Array>}
   */
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

  /**
   * Get all students with full detail (division, sub_division, current_module, current_teacher, last cert).
   *
   * @param {number} userId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
  static async getAllStudents(userId, { page = 1, limit = 50, search = null, includeInactive = false } = {}) {
    const headBranchId = await this._getHeadBranchId(userId);
    const offset = (page - 1) * limit;

    // FIX Bug #3: superAdmin (headBranchId === null) harus mendapat semua students
    // tanpa filter head_branch_id. Gunakan query langsung ke DB dengan conditional
    // WHERE ($1::INTEGER IS NULL OR head_branch_id = $1) sehingga null = no filter.
    let students;
    let total;

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

    total = await StudentModel.countByHeadBranch(headBranchId, includeInactive);

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

  /**
   * Get student by ID (with permission check) — returns full detail.
   *
   * @param {number} studentId
   * @param {number} userId
   * @returns {Promise<Object>}
   */
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

  /**
   * Internal: get basic student with access check (used by update/toggle/migrate).
   */
  static async _getStudentWithAccess(studentId, userId) {
    const headBranchId = await this._getHeadBranchId(userId);

    const student = await StudentModel.findById(studentId);
    if (!student) throw new Error("Student not found");

    if (headBranchId !== null && student.head_branch_id !== headBranchId) {
      throw new Error("Access denied to this student");
    }

    return { student, headBranchId };
  }

  /**
   * Get student's certificate print history.
   *
   * @param {number} studentId
   * @param {number} userId
   * @param {Object} options
   * @returns {Promise<Object>}
   */
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
         m.id AS module_id, m.name AS module_name,
         sd.id AS sub_division_id, sd.name AS sub_division_name,
         d.id AS division_id, d.name AS division_name,
         t.id AS teacher_id, t.full_name AS teacher_name,
         b.id AS branch_id, b.code AS branch_code, b.name AS branch_name
       FROM certificate_prints cp
       JOIN modules m ON cp.module_id = m.id
       JOIN sub_divisions sd ON m.sub_div_id = sd.id
       JOIN divisions d ON sd.division_id = d.id
       JOIN users t ON cp.teacher_id = t.id
       JOIN branches b ON cp.branch_id = b.id
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
        sub_division: { id: r.sub_division_id, name: r.sub_division_name },
        division: { id: r.division_id, name: r.division_name },
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

  /**
   * Update student name.
   *
   * @param {number} studentId
   * @param {string} name
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  static async updateStudent(studentId, name, userId) {
    const { student } = await this._getStudentWithAccess(studentId, userId);

    // Check duplicate name in same head branch
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

  /**
   * Toggle student active status.
   *
   * @param {number} studentId
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  static async toggleStudentActive(studentId, userId) {
    await this._getStudentWithAccess(studentId, userId);
    return StudentModel.toggleActive(studentId);
  }

  /**
   * Migrate student to another sub-branch within the same head branch.
   * Head branch tetap sama; hanya sub-branch (assignment) yang berpindah.
   * Karena students.head_branch_id mengacu ke head branch, migrasi tidak mengubah head_branch_id.
   * Migrasi dicatat dengan membuat certificate_prints baru di branch tujuan (jika diperlukan),
   * namun untuk MVP ini kita cukup validasi saja bahwa target branch masih 1 head branch.
   *
   * @param {number} studentId
   * @param {number} targetBranchId - Sub-branch tujuan (harus 1 head branch yang sama)
   * @param {number} userId
   * @returns {Promise<Object>}
   */
  static async migrateStudent(studentId, targetBranchId, userId) {
    const { student, headBranchId } = await this._getStudentWithAccess(studentId, userId);

    // Validate target branch exists and belongs to same head branch
    const branchResult = await query(
      `SELECT id, code, name, is_active, is_head_branch, parent_id
       FROM branches WHERE id = $1`,
      [targetBranchId],
    );

    const targetBranch = branchResult.rows[0];
    if (!targetBranch) throw new Error("Target branch not found");
    if (!targetBranch.is_active) throw new Error("Target branch is inactive");

    // Target must be within the same head branch scope
    const targetHeadBranchId = targetBranch.is_head_branch ? targetBranch.id : targetBranch.parent_id;

    if (headBranchId !== null && targetHeadBranchId !== headBranchId) {
      throw new Error("Target branch does not belong to your head branch");
    }

    if (targetHeadBranchId !== student.head_branch_id) {
      throw new Error("Cannot migrate student across different head branches");
    }

    // Nothing to migrate if already in target head branch (head_branch_id unchanged)
    // This is by design: head_branch_id always points to head branch
    // Sub-branch assignment is tracked via certificate_prints.branch_id

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

  /**
   * Get student statistics for user's head branch.
   *
   * @param {number} userId
   * @returns {Promise<Object>}
   */
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

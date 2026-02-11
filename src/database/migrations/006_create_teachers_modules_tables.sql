-- =============================================
-- Tables: teacher_branches, teacher_divisions, modules
-- Created: 2026-02-11
-- =============================================

-- Teacher ↔ Branch (many-to-many, within same head branch)
CREATE TABLE teacher_branches (
    id          SERIAL PRIMARY KEY,
    teacher_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id   INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_teacher_branch UNIQUE (teacher_id, branch_id)
);

-- Teacher ↔ Division (many-to-many)
CREATE TABLE teacher_divisions (
    id           SERIAL PRIMARY KEY,
    teacher_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division_id  INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_teacher_division UNIQUE (teacher_id, division_id)
);

-- Modules
CREATE TABLE modules (
    id           SERIAL PRIMARY KEY,
    module_code  VARCHAR(50) UNIQUE NOT NULL,
    name         VARCHAR(150) NOT NULL,
    division_id  INTEGER NOT NULL REFERENCES divisions(id) ON DELETE RESTRICT,
    sub_div_id   INTEGER REFERENCES sub_divisions(id) ON DELETE SET NULL,
    created_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_module_code CHECK (LENGTH(TRIM(module_code)) >= 2),
    CONSTRAINT check_module_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Indexes
CREATE INDEX idx_teacher_branches_teacher  ON teacher_branches(teacher_id);
CREATE INDEX idx_teacher_branches_branch   ON teacher_branches(branch_id);
CREATE INDEX idx_teacher_divisions_teacher ON teacher_divisions(teacher_id);
CREATE INDEX idx_teacher_divisions_div     ON teacher_divisions(division_id);
CREATE INDEX idx_modules_division_id       ON modules(division_id);
CREATE INDEX idx_modules_sub_div_id        ON modules(sub_div_id);
CREATE INDEX idx_modules_created_by        ON modules(created_by);
CREATE INDEX idx_modules_is_active         ON modules(is_active);

-- Trigger
CREATE TRIGGER set_timestamp_modules
    BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Comments
COMMENT ON TABLE teacher_branches IS 'Many-to-many: teacher can belong to multiple branches under same head branch';
COMMENT ON TABLE teacher_divisions IS 'Many-to-many: teacher can belong to multiple divisions';
COMMENT ON TABLE modules IS 'Learning modules managed by admin, linked to division/sub-division';
COMMENT ON COLUMN modules.module_code IS 'Unique module identifier e.g. MOD-001';
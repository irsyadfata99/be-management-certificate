-- =============================================
-- Table: students
-- Description: Student records per head branch
-- Created: 2026-02-11
-- =============================================

CREATE TABLE students (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(150) NOT NULL,
    head_branch_id  INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_student_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Indexes
CREATE INDEX idx_students_head_branch ON students(head_branch_id);
CREATE INDEX idx_students_name ON students(name);
CREATE INDEX idx_students_is_active ON students(is_active);
CREATE INDEX idx_students_name_branch ON students(name, head_branch_id);

-- Trigger for automatic updatedAt
CREATE TRIGGER set_timestamp_students
    BEFORE UPDATE ON students
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Comments
COMMENT ON TABLE students IS 'Student records linked to head branch';
COMMENT ON COLUMN students.name IS 'Student full name';
COMMENT ON COLUMN students.head_branch_id IS 'Head branch where student is registered';
COMMENT ON COLUMN students.is_active IS 'Soft delete flag';

-- =============================================
-- Update certificate_prints table
-- Add student_id column and make student_name optional
-- =============================================

-- Add student_id column
ALTER TABLE certificate_prints
    ADD COLUMN student_id INTEGER REFERENCES students(id) ON DELETE RESTRICT;

-- Make student_name nullable (backward compatibility)
ALTER TABLE certificate_prints
    ALTER COLUMN student_name DROP NOT NULL;

-- Add check constraint: either student_id or student_name must be provided
ALTER TABLE certificate_prints
    ADD CONSTRAINT check_student_data 
    CHECK (student_id IS NOT NULL OR (student_name IS NOT NULL AND LENGTH(TRIM(student_name)) >= 2));

-- Index
CREATE INDEX idx_certificate_prints_student ON certificate_prints(student_id);

-- Comment
COMMENT ON COLUMN certificate_prints.student_id IS 'Reference to students table (preferred over student_name)';
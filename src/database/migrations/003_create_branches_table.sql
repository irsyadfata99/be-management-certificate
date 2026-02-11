-- =============================================
-- Table: branches
-- Description: Branch management with head/sub branch hierarchy
-- Created: 2026-02-11
-- =============================================

CREATE TABLE branches (
    id            SERIAL PRIMARY KEY,
    code          VARCHAR(10) UNIQUE NOT NULL,
    name          VARCHAR(100) NOT NULL,
    is_head_branch BOOLEAN NOT NULL DEFAULT false,
    parent_id     INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_code_not_empty   CHECK (LENGTH(TRIM(code)) >= 2),
    CONSTRAINT check_name_not_empty   CHECK (LENGTH(TRIM(name)) >= 2),
    CONSTRAINT check_no_self_parent   CHECK (id <> parent_id)
);

-- Indexes
CREATE INDEX idx_branches_code           ON branches(code);
CREATE INDEX idx_branches_parent_id      ON branches(parent_id);
CREATE INDEX idx_branches_is_active      ON branches(is_active);
CREATE INDEX idx_branches_is_head_branch ON branches(is_head_branch);

-- Trigger for automatic updatedAt
CREATE TRIGGER set_timestamp_branches
    BEFORE UPDATE ON branches
    FOR EACH ROW
    EXECUTE FUNCTION trigger_set_timestamp();

-- Comments
COMMENT ON TABLE  branches                IS 'Branch offices with head/sub branch hierarchy';
COMMENT ON COLUMN branches.code           IS 'Unique branch code e.g. SND, BSD, PIK';
COMMENT ON COLUMN branches.name           IS 'Full branch name e.g. SUNDA, BSD, PIK';
COMMENT ON COLUMN branches.is_head_branch IS 'true = head branch, false = sub branch';
COMMENT ON COLUMN branches.parent_id      IS 'NULL for head branch; references head branch id for sub branch';
COMMENT ON COLUMN branches.is_active      IS 'Soft-delete flag; false = deactivated';
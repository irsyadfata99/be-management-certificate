-- =============================================
-- Table: divisions
-- Description: Division with sub divisions (age range)
-- Created: 2026-02-11
-- =============================================

CREATE TABLE divisions (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    created_by  INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_division_name CHECK (LENGTH(TRIM(name)) >= 2)
);

-- Sub divisions with age range
CREATE TABLE sub_divisions (
    id           SERIAL PRIMARY KEY,
    division_id  INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    age_min      SMALLINT NOT NULL,
    age_max      SMALLINT NOT NULL,
    is_active    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_sub_division_name CHECK (LENGTH(TRIM(name)) >= 2),
    CONSTRAINT check_age_range         CHECK (age_min >= 0 AND age_max > age_min)
);

-- Indexes
CREATE INDEX idx_divisions_created_by    ON divisions(created_by);
CREATE INDEX idx_divisions_is_active     ON divisions(is_active);
CREATE INDEX idx_sub_divisions_div_id    ON sub_divisions(division_id);
CREATE INDEX idx_sub_divisions_is_active ON sub_divisions(is_active);

-- Triggers
CREATE TRIGGER set_timestamp_divisions
    BEFORE UPDATE ON divisions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_sub_divisions
    BEFORE UPDATE ON sub_divisions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp();

-- Comments
COMMENT ON TABLE  divisions              IS 'Divisions managed by admin';
COMMENT ON COLUMN divisions.created_by   IS 'Admin user who created this division';
COMMENT ON TABLE  sub_divisions          IS 'Sub divisions with age range (e.g. 5-7 years)';
COMMENT ON COLUMN sub_divisions.age_min  IS 'Minimum age (inclusive)';
COMMENT ON COLUMN sub_divisions.age_max  IS 'Maximum age (inclusive)';
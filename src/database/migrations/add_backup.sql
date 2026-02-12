-- =============================================
-- Database Backup Table
-- Add this to your existing database
-- =============================================

-- Create database_backups table
CREATE TABLE IF NOT EXISTS database_backups (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    description TEXT,
    created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    is_restore BOOLEAN DEFAULT false,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT check_filename_not_empty CHECK (LENGTH(TRIM(filename)) >= 5),
    CONSTRAINT check_file_size_positive CHECK (file_size > 0)
);

-- Create indexes
CREATE INDEX idx_database_backups_branch ON database_backups(branch_id);
CREATE INDEX idx_database_backups_created_by ON database_backups(created_by);
CREATE INDEX idx_database_backups_created_at ON database_backups("createdAt" DESC);
CREATE INDEX idx_database_backups_is_restore ON database_backups(is_restore);

COMMENT ON TABLE database_backups IS 'Database backup records';
COMMENT ON COLUMN database_backups.is_restore IS 'true if this is a restore log entry, false if backup creation';
COMMENT ON COLUMN database_backups.file_path IS 'Full path to backup file on server';
COMMENT ON COLUMN database_backups.file_size IS 'File size in bytes';

-- Grant permissions (adjust as needed)
-- GRANT SELECT, INSERT, DELETE ON database_backups TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE database_backups_id_seq TO your_app_user;
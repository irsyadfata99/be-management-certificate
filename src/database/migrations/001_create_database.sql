-- =============================================
-- Database: saas_certificate
-- Description: Main database for SaaS Certificate Management System
-- Created: 2026-02-11
-- =============================================

-- Drop database if exists (optional - uncomment if needed)
-- DROP DATABASE IF EXISTS saas_certificate;

-- Create database
CREATE DATABASE saas_certificate
    WITH 
    OWNER = postgres
    ENCODING = 'UTF8'
    LC_COLLATE = 'English_United States.1252'
    LC_CTYPE = 'English_United States.1252'
    TABLESPACE = pg_default
    CONNECTION LIMIT = -1;

COMMENT ON DATABASE saas_certificate
    IS 'SaaS Certificate Management System Database';

-- Connect to the database
\c saas_certificate;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trigger_set_timestamp()
    IS 'Automatically updates the updatedAt timestamp on row modification';
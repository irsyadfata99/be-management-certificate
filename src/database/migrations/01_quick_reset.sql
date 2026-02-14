-- =============================================
-- QUICK RESET: Clear + Init Database (All-in-One)
-- =============================================
-- Jalankan file ini untuk reset total dari awal
-- File ini menggabungkan 01_database_clear.sql + 02_database_init.sql
-- =============================================

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: CLEAR DATABASE
-- ═══════════════════════════════════════════════════════════════════════════

SET session_replication_role = 'replica';

DELETE FROM certificate_pdfs;
DELETE FROM certificate_logs;
DELETE FROM certificate_reservations;
DELETE FROM certificate_migrations;
DELETE FROM certificate_prints;
DELETE FROM certificates;
DELETE FROM students;
DELETE FROM teacher_divisions;
DELETE FROM teacher_branches;
DELETE FROM modules;
DELETE FROM sub_divisions;
DELETE FROM divisions;
DELETE FROM users WHERE username != 'gem';
DELETE FROM branches;
DELETE FROM database_backups;
DELETE FROM login_attempts;
DELETE FROM refresh_tokens;

SET session_replication_role = 'origin';

ALTER SEQUENCE branches_id_seq RESTART WITH 1;
ALTER SEQUENCE divisions_id_seq RESTART WITH 1;
ALTER SEQUENCE sub_divisions_id_seq RESTART WITH 1;
ALTER SEQUENCE modules_id_seq RESTART WITH 1;
ALTER SEQUENCE certificates_id_seq RESTART WITH 1;
ALTER SEQUENCE students_id_seq RESTART WITH 1;
ALTER SEQUENCE certificate_prints_id_seq RESTART WITH 1;
ALTER SEQUENCE certificate_migrations_id_seq RESTART WITH 1;
ALTER SEQUENCE certificate_reservations_id_seq RESTART WITH 1;
ALTER SEQUENCE certificate_logs_id_seq RESTART WITH 1;
ALTER SEQUENCE teacher_branches_id_seq RESTART WITH 1;
ALTER SEQUENCE teacher_divisions_id_seq RESTART WITH 1;
ALTER SEQUENCE database_backups_id_seq RESTART WITH 1;
ALTER SEQUENCE certificate_pdfs_id_seq RESTART WITH 1;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: INITIALIZE DATABASE
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── BRANCHES ─────────────────────────────────────────────────────────────

INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('SND', 'SUNDA', true, NULL),
    ('BSD', 'BSD',   true, NULL),
    ('PIK', 'PIK',   true, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('MKW', 'MEKARWANGI',            false, (SELECT id FROM branches WHERE code = 'SND' LIMIT 1)),
    ('KBP', 'KOTA BARU PARAHYANGAN', false, (SELECT id FROM branches WHERE code = 'SND' LIMIT 1))
ON CONFLICT (code) DO NOTHING;

-- ─── ADMIN ACCOUNTS ───────────────────────────────────────────────────────
-- Password: admin123
-- Hash: $2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK

INSERT INTO users (username, password, role, full_name, branch_id)
VALUES
    (
        'gulam',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin SUNDA',
        (SELECT id FROM branches WHERE code = 'SND' LIMIT 1)
    ),
    (
        'vormes',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin BSD',
        (SELECT id FROM branches WHERE code = 'BSD' LIMIT 1)
    ),
    (
        'rayyan',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin PIK',
        (SELECT id FROM branches WHERE code = 'PIK' LIMIT 1)
    )
ON CONFLICT (username) DO NOTHING;

UPDATE users 
SET password = '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK'
WHERE username = 'gem';

-- ─── DIVISIONS ────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_id INTEGER;
BEGIN
    SELECT id INTO v_admin_id FROM users WHERE username = 'gulam' LIMIT 1;
    
    INSERT INTO divisions (name, created_by)
    SELECT 'Children', v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM divisions WHERE name = 'Children');
    
    INSERT INTO divisions (name, created_by)
    SELECT 'Teenager', v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM divisions WHERE name = 'Teenager');
    
    INSERT INTO divisions (name, created_by)
    SELECT 'Adult', v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM divisions WHERE name = 'Adult');
END $$;

-- ─── SUB DIVISIONS ────────────────────────────────────────────────────────

DO $$
DECLARE
    v_children_id INTEGER;
    v_teenager_id INTEGER;
    v_adult_id INTEGER;
BEGIN
    SELECT id INTO v_children_id FROM divisions WHERE name = 'Children' LIMIT 1;
    SELECT id INTO v_teenager_id FROM divisions WHERE name = 'Teenager' LIMIT 1;
    SELECT id INTO v_adult_id FROM divisions WHERE name = 'Adult' LIMIT 1;
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Toddler', 2, 4
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_children_id AND name = 'Toddler');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Kindergarten', 5, 6
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_children_id AND name = 'Kindergarten');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Elementary', 7, 12
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_children_id AND name = 'Elementary');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_teenager_id, 'Junior High', 13, 15
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_teenager_id AND name = 'Junior High');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_teenager_id, 'Senior High', 16, 18
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_teenager_id AND name = 'Senior High');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Young Adult', 19, 30
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_adult_id AND name = 'Young Adult');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Adult', 31, 50
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_adult_id AND name = 'Adult');
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Senior', 51, 100
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_adult_id AND name = 'Senior');
END $$;

-- ─── MODULES ──────────────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_id INTEGER;
    v_children_id INTEGER;
    v_teenager_id INTEGER;
    v_toddler_id INTEGER;
    v_kindergarten_id INTEGER;
    v_elementary_id INTEGER;
    v_junior_high_id INTEGER;
BEGIN
    SELECT id INTO v_admin_id FROM users WHERE username = 'gulam' LIMIT 1;
    SELECT id INTO v_children_id FROM divisions WHERE name = 'Children' LIMIT 1;
    SELECT id INTO v_teenager_id FROM divisions WHERE name = 'Teenager' LIMIT 1;
    SELECT id INTO v_toddler_id FROM sub_divisions WHERE name = 'Toddler' LIMIT 1;
    SELECT id INTO v_kindergarten_id FROM sub_divisions WHERE name = 'Kindergarten' LIMIT 1;
    SELECT id INTO v_elementary_id FROM sub_divisions WHERE name = 'Elementary' LIMIT 1;
    SELECT id INTO v_junior_high_id FROM sub_divisions WHERE name = 'Junior High' LIMIT 1;
    
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'ENG-KID-001', 'English for Toddlers - Level 1', v_children_id, v_toddler_id, v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'ENG-KID-001');
    
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'ENG-KID-002', 'English for Kindergarten - Level 1', v_children_id, v_kindergarten_id, v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'ENG-KID-002');
    
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'MATH-ELEM-001', 'Mathematics - Elementary Level 1', v_children_id, v_elementary_id, v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'MATH-ELEM-001');
    
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'ENG-TEEN-001', 'English Conversation - Junior High', v_teenager_id, v_junior_high_id, v_admin_id
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'ENG-TEEN-001');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- FINAL VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    v_user_count INTEGER;
    v_branch_count INTEGER;
    v_division_count INTEGER;
    v_module_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_user_count FROM users;
    SELECT COUNT(*) INTO v_branch_count FROM branches;
    SELECT COUNT(*) INTO v_division_count FROM divisions;
    SELECT COUNT(*) INTO v_module_count FROM modules;
    
    RAISE NOTICE '✓ Database reset & initialized successfully';
    RAISE NOTICE '═════════════════════════════════════════';
    RAISE NOTICE 'USER ACCOUNTS (Password: admin123)';
    RAISE NOTICE '─────────────────────────────────────────';
    RAISE NOTICE '✓ Super Admin : username=gem    (All access)';
    RAISE NOTICE '✓ Admin SUNDA : username=gulam  (SND branch)';
    RAISE NOTICE '✓ Admin BSD   : username=vormes (BSD branch)';
    RAISE NOTICE '✓ Admin PIK   : username=rayyan (PIK branch)';
    RAISE NOTICE '═════════════════════════════════════════';
    RAISE NOTICE 'DATA SUMMARY';
    RAISE NOTICE '─────────────────────────────────────────';
    RAISE NOTICE '✓ Total users     : %', v_user_count;
    RAISE NOTICE '✓ Total branches  : % (3 head + 2 sub)', v_branch_count;
    RAISE NOTICE '✓ Total divisions : %', v_division_count;
    RAISE NOTICE '✓ Total modules   : %', v_module_count;
    RAISE NOTICE '═════════════════════════════════════════';
    RAISE NOTICE '✓ Ready to test with Postman!';
END $$;
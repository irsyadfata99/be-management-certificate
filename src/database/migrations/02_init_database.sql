-- =============================================
-- FILE 2: INITIALIZE DATABASE WITH SEED DATA
-- =============================================
-- Password untuk SEMUA user: admin123
-- Hash menggunakan bcryptjs (Node.js compatible)
-- Cost factor: 10
-- =============================================

-- ─── SEED DATA: BRANCHES ──────────────────────────────────────────────────

-- Head Branches
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('SND', 'SUNDA', true, NULL),
    ('BSD', 'BSD',   true, NULL),
    ('PIK', 'PIK',   true, NULL)
ON CONFLICT (code) DO NOTHING;

-- Sub Branches (under SND)
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('MKW', 'MEKARWANGI',            false, (SELECT id FROM branches WHERE code = 'SND')),
    ('KBP', 'KOTA BARU PARAHYANGAN', false, (SELECT id FROM branches WHERE code = 'SND'))
ON CONFLICT (code) DO NOTHING;

-- ─── SEED DATA: ADMIN ACCOUNTS ────────────────────────────────────────────
-- Password: admin123
-- Hash: $2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK
-- Generated dengan bcryptjs cost 10 (Node.js compatible)

INSERT INTO users (username, password, role, full_name, branch_id)
VALUES
    (
        'gulam',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin SUNDA',
        (SELECT id FROM branches WHERE code = 'SND')
    ),
    (
        'vormes',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin BSD',
        (SELECT id FROM branches WHERE code = 'BSD')
    ),
    (
        'rayyan',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin PIK',
        (SELECT id FROM branches WHERE code = 'PIK')
    )
ON CONFLICT (username) DO NOTHING;

-- ─── UPDATE SUPERADMIN PASSWORD ───────────────────────────────────────────
-- Pastikan superadmin 'gem' juga pakai hash yang benar

UPDATE users 
SET password = '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK'
WHERE username = 'gem';

-- ─── SEED DATA: DIVISIONS (OPTIONAL - FOR TESTING) ────────────────────────

-- Use DO block to handle inserts properly and avoid subquery errors
DO $$
DECLARE
    v_admin_id INTEGER;
BEGIN
    -- Get admin user ID
    SELECT id INTO v_admin_id FROM users WHERE username = 'gulam' LIMIT 1;
    
    -- Insert divisions if not exists
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

-- ─── SEED DATA: SUB DIVISIONS ─────────────────────────────────────────────

DO $$
DECLARE
    v_children_id INTEGER;
    v_teenager_id INTEGER;
    v_adult_id INTEGER;
BEGIN
    -- Get division IDs
    SELECT id INTO v_children_id FROM divisions WHERE name = 'Children' LIMIT 1;
    SELECT id INTO v_teenager_id FROM divisions WHERE name = 'Teenager' LIMIT 1;
    SELECT id INTO v_adult_id FROM divisions WHERE name = 'Adult' LIMIT 1;
    
    -- Insert sub-divisions for Children
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Toddler', 2, 4
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_children_id AND name = 'Toddler'
    );
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Kindergarten', 5, 6
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_children_id AND name = 'Kindergarten'
    );
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_children_id, 'Elementary', 7, 12
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_children_id AND name = 'Elementary'
    );
    
    -- Insert sub-divisions for Teenager
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_teenager_id, 'Junior High', 13, 15
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_teenager_id AND name = 'Junior High'
    );
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_teenager_id, 'Senior High', 16, 18
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_teenager_id AND name = 'Senior High'
    );
    
    -- Insert sub-divisions for Adult
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Young Adult', 19, 30
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_adult_id AND name = 'Young Adult'
    );
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Adult', 31, 50
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_adult_id AND name = 'Adult'
    );
    
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_adult_id, 'Senior', 51, 100
    WHERE NOT EXISTS (
        SELECT 1 FROM sub_divisions 
        WHERE division_id = v_adult_id AND name = 'Senior'
    );
END $$;

-- ─── SEED DATA: MODULES (SAMPLE) ──────────────────────────────────────────

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
    -- Get IDs
    SELECT id INTO v_admin_id FROM users WHERE username = 'gulam' LIMIT 1;
    SELECT id INTO v_children_id FROM divisions WHERE name = 'Children' LIMIT 1;
    SELECT id INTO v_teenager_id FROM divisions WHERE name = 'Teenager' LIMIT 1;
    SELECT id INTO v_toddler_id FROM sub_divisions WHERE name = 'Toddler' LIMIT 1;
    SELECT id INTO v_kindergarten_id FROM sub_divisions WHERE name = 'Kindergarten' LIMIT 1;
    SELECT id INTO v_elementary_id FROM sub_divisions WHERE name = 'Elementary' LIMIT 1;
    SELECT id INTO v_junior_high_id FROM sub_divisions WHERE name = 'Junior High' LIMIT 1;
    
    -- Insert modules
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

-- ─── VERIFICATION ─────────────────────────────────────────────────────────

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
    
    RAISE NOTICE '✓ Database initialized successfully';
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
    RAISE NOTICE '⚠  IMPORTANT:';
    RAISE NOTICE '   - All passwords are: admin123';
    RAISE NOTICE '   - Change passwords after first login!';
    RAISE NOTICE '   - Hash format: $2a$ (bcryptjs compatible)';
    RAISE NOTICE '═════════════════════════════════════════';
    RAISE NOTICE '✓ Ready to test with Postman!';
END $$;
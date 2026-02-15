-- =============================================
-- SEED DATA: Complete Sample Data for All Tables
-- =============================================
-- Semua password: admin123
-- Hash bcryptjs cost 10 (Node.js compatible):
--   $2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK
-- =============================================

-- ─── 1. BRANCHES ──────────────────────────────────────────────────────────

-- Head Branches
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active)
VALUES
    ('SND', 'SUNDA', true,  NULL, true),
    ('BSD', 'BSD',   true,  NULL, true),
    ('PIK', 'PIK',   true,  NULL, true)
ON CONFLICT (code) DO NOTHING;

-- Sub Branches (under SND)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active)
VALUES
    ('MKW', 'MEKARWANGI',             false, (SELECT id FROM branches WHERE code = 'SND'), true),
    ('KBP', 'KOTA BARU PARAHYANGAN',  false, (SELECT id FROM branches WHERE code = 'SND'), true),
    ('CML', 'CIMAHI LEMBANG',         false, (SELECT id FROM branches WHERE code = 'SND'), true)
ON CONFLICT (code) DO NOTHING;

-- Sub Branches (under BSD)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active)
VALUES
    ('TGR', 'TANGERANG',  false, (SELECT id FROM branches WHERE code = 'BSD'), true),
    ('SRP', 'SERPONG',    false, (SELECT id FROM branches WHERE code = 'BSD'), true)
ON CONFLICT (code) DO NOTHING;

-- Sub Branches (under PIK)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active)
VALUES
    ('KLP', 'KELAPA GADING', false, (SELECT id FROM branches WHERE code = 'PIK'), true),
    ('PLM', 'PLUIT MUARA',   false, (SELECT id FROM branches WHERE code = 'PIK'), true)
ON CONFLICT (code) DO NOTHING;


-- ─── 2. USERS (SuperAdmin + Admin per Head Branch) ─────────────────────────
-- Password: admin123
-- Hash: $2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK

-- SuperAdmin (no branch)
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES (
    'gem',
    '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
    'superAdmin',
    'Super Administrator',
    NULL,
    true
)
ON CONFLICT (username) DO UPDATE
    SET password  = EXCLUDED.password,
        full_name = EXCLUDED.full_name;

-- Admin Head Branches
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES
    (
        'gulam',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin SUNDA',
        (SELECT id FROM branches WHERE code = 'SND'),
        true
    ),
    (
        'vormes',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin BSD',
        (SELECT id FROM branches WHERE code = 'BSD'),
        true
    ),
    (
        'rayyan',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'admin',
        'Admin PIK',
        (SELECT id FROM branches WHERE code = 'PIK'),
        true
    )
ON CONFLICT (username) DO NOTHING;

-- Teachers (SND branch)
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES
    (
        'teacher_snd_01',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Budi Santoso',
        (SELECT id FROM branches WHERE code = 'MKW'),
        true
    ),
    (
        'teacher_snd_02',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Siti Rahayu',
        (SELECT id FROM branches WHERE code = 'KBP'),
        true
    ),
    (
        'teacher_snd_03',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Ahmad Fauzi',
        (SELECT id FROM branches WHERE code = 'SND'),
        true
    )
ON CONFLICT (username) DO NOTHING;

-- Teachers (BSD branch)
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES
    (
        'teacher_bsd_01',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Dewi Putri',
        (SELECT id FROM branches WHERE code = 'TGR'),
        true
    ),
    (
        'teacher_bsd_02',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Rizky Pratama',
        (SELECT id FROM branches WHERE code = 'SRP'),
        true
    )
ON CONFLICT (username) DO NOTHING;

-- Teachers (PIK branch)
INSERT INTO users (username, password, role, full_name, branch_id, is_active)
VALUES
    (
        'teacher_pik_01',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Nurul Hidayah',
        (SELECT id FROM branches WHERE code = 'KLP'),
        true
    ),
    (
        'teacher_pik_02',
        '$2a$10$rOZSD6KrqTWEXhXt.zHyDOH7LKZd.Cr7yRJJlNBLfVIKk8U8HJbRK',
        'teacher',
        'Hendra Wijaya',
        (SELECT id FROM branches WHERE code = 'PLM'),
        true
    )
ON CONFLICT (username) DO NOTHING;


-- ─── 3. DIVISIONS ─────────────────────────────────────────────────────────
-- Setiap admin membuat divisions-nya sendiri (created_by = admin masing-masing)

DO $$
DECLARE
    v_admin_snd INTEGER;
    v_admin_bsd INTEGER;
    v_admin_pik INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    -- Divisions milik Admin SND
    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Children', true, v_admin_snd
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Children' AND created_by = v_admin_snd
    );

    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Teenager', true, v_admin_snd
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_snd
    );

    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Adult', true, v_admin_snd
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Adult' AND created_by = v_admin_snd
    );

    -- Divisions milik Admin BSD
    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Children', true, v_admin_bsd
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Children' AND created_by = v_admin_bsd
    );

    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Teenager', true, v_admin_bsd
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_bsd
    );

    -- Divisions milik Admin PIK
    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Children', true, v_admin_pik
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Children' AND created_by = v_admin_pik
    );

    INSERT INTO divisions (name, is_active, created_by)
    SELECT 'Adult', true, v_admin_pik
    WHERE NOT EXISTS (
        SELECT 1 FROM divisions WHERE name = 'Adult' AND created_by = v_admin_pik
    );
END $$;


-- ─── 4. SUB DIVISIONS ─────────────────────────────────────────────────────

DO $$
DECLARE
    -- SND divisions
    v_snd_children  INTEGER;
    v_snd_teenager  INTEGER;
    v_snd_adult     INTEGER;
    -- BSD divisions
    v_bsd_children  INTEGER;
    v_bsd_teenager  INTEGER;
    -- PIK divisions
    v_pik_children  INTEGER;
    v_pik_adult     INTEGER;

    v_admin_snd INTEGER;
    v_admin_bsd INTEGER;
    v_admin_pik INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    SELECT id INTO v_snd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_snd LIMIT 1;

    SELECT id INTO v_bsd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_bsd LIMIT 1;

    SELECT id INTO v_pik_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_pik LIMIT 1;

    -- ── Sub Divisions SND > Children ──────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_children, 'Toddler', 2, 4
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Toddler');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_children, 'Kindergarten', 5, 6
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Kindergarten');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_children, 'Elementary', 7, 12
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Elementary');

    -- ── Sub Divisions SND > Teenager ──────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_teenager, 'Junior High', 13, 15
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_teenager AND name = 'Junior High');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_teenager, 'Senior High', 16, 18
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_teenager AND name = 'Senior High');

    -- ── Sub Divisions SND > Adult ─────────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_adult, 'Young Adult', 19, 30
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_adult AND name = 'Young Adult');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_adult, 'Middle Adult', 31, 50
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_adult AND name = 'Middle Adult');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_snd_adult, 'Senior', 51, 100
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_snd_adult AND name = 'Senior');

    -- ── Sub Divisions BSD > Children ──────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_bsd_children, 'Toddler', 2, 4
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Toddler');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_bsd_children, 'Kindergarten', 5, 6
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Kindergarten');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_bsd_children, 'Elementary', 7, 12
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Elementary');

    -- ── Sub Divisions BSD > Teenager ──────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_bsd_teenager, 'Junior High', 13, 15
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_bsd_teenager AND name = 'Junior High');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_bsd_teenager, 'Senior High', 16, 18
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_bsd_teenager AND name = 'Senior High');

    -- ── Sub Divisions PIK > Children ──────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_pik_children, 'Toddler', 2, 4
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_pik_children AND name = 'Toddler');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_pik_children, 'Kindergarten', 5, 6
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_pik_children AND name = 'Kindergarten');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_pik_children, 'Elementary', 7, 12
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_pik_children AND name = 'Elementary');

    -- ── Sub Divisions PIK > Adult ─────────────────────────────────────────
    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_pik_adult, 'Young Adult', 19, 30
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_pik_adult AND name = 'Young Adult');

    INSERT INTO sub_divisions (division_id, name, age_min, age_max)
    SELECT v_pik_adult, 'Middle Adult', 31, 50
    WHERE NOT EXISTS (SELECT 1 FROM sub_divisions WHERE division_id = v_pik_adult AND name = 'Middle Adult');
END $$;


-- ─── 5. MODULES ───────────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd  INTEGER;
    v_admin_bsd  INTEGER;
    v_admin_pik  INTEGER;

    -- SND division IDs
    v_snd_children  INTEGER;
    v_snd_teenager  INTEGER;
    v_snd_adult     INTEGER;
    -- SND sub division IDs
    v_snd_toddler      INTEGER;
    v_snd_kindergarten INTEGER;
    v_snd_elementary   INTEGER;
    v_snd_junior_high  INTEGER;
    v_snd_senior_high  INTEGER;
    v_snd_young_adult  INTEGER;
    v_snd_mid_adult    INTEGER;

    -- BSD division IDs
    v_bsd_children  INTEGER;
    v_bsd_teenager  INTEGER;
    v_bsd_toddler      INTEGER;
    v_bsd_kindergarten INTEGER;
    v_bsd_elementary   INTEGER;
    v_bsd_junior_high  INTEGER;

    -- PIK division IDs
    v_pik_children  INTEGER;
    v_pik_adult     INTEGER;
    v_pik_toddler      INTEGER;
    v_pik_elementary   INTEGER;
    v_pik_young_adult  INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    -- Resolve SND division IDs
    SELECT id INTO v_snd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_snd LIMIT 1;

    SELECT id INTO v_snd_toddler      FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Toddler'      LIMIT 1;
    SELECT id INTO v_snd_kindergarten FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Kindergarten' LIMIT 1;
    SELECT id INTO v_snd_elementary   FROM sub_divisions WHERE division_id = v_snd_children AND name = 'Elementary'   LIMIT 1;
    SELECT id INTO v_snd_junior_high  FROM sub_divisions WHERE division_id = v_snd_teenager AND name = 'Junior High'  LIMIT 1;
    SELECT id INTO v_snd_senior_high  FROM sub_divisions WHERE division_id = v_snd_teenager AND name = 'Senior High'  LIMIT 1;
    SELECT id INTO v_snd_young_adult  FROM sub_divisions WHERE division_id = v_snd_adult    AND name = 'Young Adult'  LIMIT 1;
    SELECT id INTO v_snd_mid_adult    FROM sub_divisions WHERE division_id = v_snd_adult    AND name = 'Middle Adult' LIMIT 1;

    -- Resolve BSD division IDs
    SELECT id INTO v_bsd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_bsd LIMIT 1;

    SELECT id INTO v_bsd_toddler      FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Toddler'      LIMIT 1;
    SELECT id INTO v_bsd_kindergarten FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Kindergarten' LIMIT 1;
    SELECT id INTO v_bsd_elementary   FROM sub_divisions WHERE division_id = v_bsd_children AND name = 'Elementary'   LIMIT 1;
    SELECT id INTO v_bsd_junior_high  FROM sub_divisions WHERE division_id = v_bsd_teenager AND name = 'Junior High'  LIMIT 1;

    -- Resolve PIK division IDs
    SELECT id INTO v_pik_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_pik LIMIT 1;

    SELECT id INTO v_pik_toddler    FROM sub_divisions WHERE division_id = v_pik_children AND name = 'Toddler'     LIMIT 1;
    SELECT id INTO v_pik_elementary FROM sub_divisions WHERE division_id = v_pik_children AND name = 'Elementary'  LIMIT 1;
    SELECT id INTO v_pik_young_adult FROM sub_divisions WHERE division_id = v_pik_adult   AND name = 'Young Adult' LIMIT 1;

    -- ── Modules SND ───────────────────────────────────────────────────────
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-TOD-1', 'English for Toddlers Level 1',       v_snd_children, v_snd_toddler,      v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-TOD-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-TOD-2', 'English for Toddlers Level 2',       v_snd_children, v_snd_toddler,      v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-TOD-2');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-KND-1', 'English for Kindergarten Level 1',   v_snd_children, v_snd_kindergarten, v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-KND-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-KND-2', 'English for Kindergarten Level 2',   v_snd_children, v_snd_kindergarten, v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-KND-2');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-MTH-ELM-1', 'Mathematics Elementary Level 1',     v_snd_children, v_snd_elementary,   v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-MTH-ELM-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-ELM-1', 'English Elementary Level 1',         v_snd_children, v_snd_elementary,   v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-ELM-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-JNR-1', 'English Conversation Junior High',   v_snd_teenager, v_snd_junior_high,  v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-JNR-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-SNR-1', 'English Conversation Senior High',   v_snd_teenager, v_snd_senior_high,  v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-SNR-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-YA-1',  'Business English Young Adult',       v_snd_adult,    v_snd_young_adult,  v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-YA-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'SND-ENG-MA-1',  'Conversational English Middle Adult', v_snd_adult,   v_snd_mid_adult,    v_admin_snd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'SND-ENG-MA-1');

    -- ── Modules BSD ───────────────────────────────────────────────────────
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'BSD-ENG-TOD-1', 'English for Toddlers Level 1',       v_bsd_children, v_bsd_toddler,      v_admin_bsd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'BSD-ENG-TOD-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'BSD-ENG-KND-1', 'English for Kindergarten Level 1',   v_bsd_children, v_bsd_kindergarten, v_admin_bsd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'BSD-ENG-KND-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'BSD-MTH-ELM-1', 'Mathematics Elementary Level 1',     v_bsd_children, v_bsd_elementary,   v_admin_bsd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'BSD-MTH-ELM-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'BSD-ENG-JNR-1', 'English Conversation Junior High',   v_bsd_teenager, v_bsd_junior_high,  v_admin_bsd
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'BSD-ENG-JNR-1');

    -- ── Modules PIK ───────────────────────────────────────────────────────
    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'PIK-ENG-TOD-1', 'English for Toddlers Level 1',       v_pik_children, v_pik_toddler,      v_admin_pik
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'PIK-ENG-TOD-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'PIK-ENG-ELM-1', 'English Elementary Level 1',         v_pik_children, v_pik_elementary,   v_admin_pik
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'PIK-ENG-ELM-1');

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by)
    SELECT 'PIK-ENG-YA-1',  'Business English Young Adult',       v_pik_adult,    v_pik_young_adult,  v_admin_pik
    WHERE NOT EXISTS (SELECT 1 FROM modules WHERE module_code = 'PIK-ENG-YA-1');
END $$;


-- ─── 6. TEACHER BRANCHES ─────────────────────────────────────────────────
-- Assign teachers ke branches (sesuai branch_id di users + 1 branch tambahan)

DO $$
DECLARE
    v_t_snd_01 INTEGER;
    v_t_snd_02 INTEGER;
    v_t_snd_03 INTEGER;
    v_t_bsd_01 INTEGER;
    v_t_bsd_02 INTEGER;
    v_t_pik_01 INTEGER;
    v_t_pik_02 INTEGER;

    v_br_snd INTEGER;
    v_br_mkw INTEGER;
    v_br_kbp INTEGER;
    v_br_cml INTEGER;
    v_br_bsd INTEGER;
    v_br_tgr INTEGER;
    v_br_srp INTEGER;
    v_br_pik INTEGER;
    v_br_klp INTEGER;
    v_br_plm INTEGER;
BEGIN
    SELECT id INTO v_t_snd_01 FROM users WHERE username = 'teacher_snd_01' LIMIT 1;
    SELECT id INTO v_t_snd_02 FROM users WHERE username = 'teacher_snd_02' LIMIT 1;
    SELECT id INTO v_t_snd_03 FROM users WHERE username = 'teacher_snd_03' LIMIT 1;
    SELECT id INTO v_t_bsd_01 FROM users WHERE username = 'teacher_bsd_01' LIMIT 1;
    SELECT id INTO v_t_bsd_02 FROM users WHERE username = 'teacher_bsd_02' LIMIT 1;
    SELECT id INTO v_t_pik_01 FROM users WHERE username = 'teacher_pik_01' LIMIT 1;
    SELECT id INTO v_t_pik_02 FROM users WHERE username = 'teacher_pik_02' LIMIT 1;

    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_mkw FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_kbp FROM branches WHERE code = 'KBP' LIMIT 1;
    SELECT id INTO v_br_cml FROM branches WHERE code = 'CML' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_tgr FROM branches WHERE code = 'TGR' LIMIT 1;
    SELECT id INTO v_br_srp FROM branches WHERE code = 'SRP' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;
    SELECT id INTO v_br_klp FROM branches WHERE code = 'KLP' LIMIT 1;
    SELECT id INTO v_br_plm FROM branches WHERE code = 'PLM' LIMIT 1;

    -- teacher_snd_01: assigned ke MKW + KBP
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_01, v_br_mkw) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_01, v_br_kbp) ON CONFLICT DO NOTHING;

    -- teacher_snd_02: assigned ke KBP + CML
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_02, v_br_kbp) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_02, v_br_cml) ON CONFLICT DO NOTHING;

    -- teacher_snd_03: assigned ke SND (head) + MKW
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_03, v_br_snd) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_snd_03, v_br_mkw) ON CONFLICT DO NOTHING;

    -- teacher_bsd_01: assigned ke TGR + SRP
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_bsd_01, v_br_tgr) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_bsd_01, v_br_srp) ON CONFLICT DO NOTHING;

    -- teacher_bsd_02: assigned ke SRP + BSD (head)
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_bsd_02, v_br_srp) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_bsd_02, v_br_bsd) ON CONFLICT DO NOTHING;

    -- teacher_pik_01: assigned ke KLP + PLM
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_pik_01, v_br_klp) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_pik_01, v_br_plm) ON CONFLICT DO NOTHING;

    -- teacher_pik_02: assigned ke PLM + PIK (head)
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_pik_02, v_br_plm) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES (v_t_pik_02, v_br_pik) ON CONFLICT DO NOTHING;
END $$;


-- ─── 7. TEACHER DIVISIONS ─────────────────────────────────────────────────

DO $$
DECLARE
    v_t_snd_01 INTEGER;
    v_t_snd_02 INTEGER;
    v_t_snd_03 INTEGER;
    v_t_bsd_01 INTEGER;
    v_t_bsd_02 INTEGER;
    v_t_pik_01 INTEGER;
    v_t_pik_02 INTEGER;

    v_admin_snd INTEGER;
    v_admin_bsd INTEGER;
    v_admin_pik INTEGER;

    v_snd_children INTEGER;
    v_snd_teenager INTEGER;
    v_snd_adult    INTEGER;
    v_bsd_children INTEGER;
    v_bsd_teenager INTEGER;
    v_pik_children INTEGER;
    v_pik_adult    INTEGER;
BEGIN
    SELECT id INTO v_t_snd_01 FROM users WHERE username = 'teacher_snd_01' LIMIT 1;
    SELECT id INTO v_t_snd_02 FROM users WHERE username = 'teacher_snd_02' LIMIT 1;
    SELECT id INTO v_t_snd_03 FROM users WHERE username = 'teacher_snd_03' LIMIT 1;
    SELECT id INTO v_t_bsd_01 FROM users WHERE username = 'teacher_bsd_01' LIMIT 1;
    SELECT id INTO v_t_bsd_02 FROM users WHERE username = 'teacher_bsd_02' LIMIT 1;
    SELECT id INTO v_t_pik_01 FROM users WHERE username = 'teacher_pik_01' LIMIT 1;
    SELECT id INTO v_t_pik_02 FROM users WHERE username = 'teacher_pik_02' LIMIT 1;

    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    SELECT id INTO v_snd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_bsd_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_teenager FROM divisions WHERE name = 'Teenager' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_pik_children FROM divisions WHERE name = 'Children' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_adult    FROM divisions WHERE name = 'Adult'    AND created_by = v_admin_pik LIMIT 1;

    -- teacher_snd_01: Children + Teenager
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_snd_01, v_snd_children) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_snd_01, v_snd_teenager)  ON CONFLICT DO NOTHING;

    -- teacher_snd_02: Children
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_snd_02, v_snd_children) ON CONFLICT DO NOTHING;

    -- teacher_snd_03: Teenager + Adult
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_snd_03, v_snd_teenager) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_snd_03, v_snd_adult)    ON CONFLICT DO NOTHING;

    -- teacher_bsd_01: Children + Teenager
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_bsd_01, v_bsd_children) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_bsd_01, v_bsd_teenager) ON CONFLICT DO NOTHING;

    -- teacher_bsd_02: Children
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_bsd_02, v_bsd_children) ON CONFLICT DO NOTHING;

    -- teacher_pik_01: Children
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_pik_01, v_pik_children) ON CONFLICT DO NOTHING;

    -- teacher_pik_02: Children + Adult
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_pik_02, v_pik_children) ON CONFLICT DO NOTHING;
    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES (v_t_pik_02, v_pik_adult)    ON CONFLICT DO NOTHING;
END $$;


-- ─── 8. CERTIFICATES ──────────────────────────────────────────────────────
-- SND: No. 000001 – 000050 (30 di head, 10 ke MKW, 10 ke KBP)
-- BSD: No. 000101 – 000130 (20 di head, 10 ke TGR)
-- PIK: No. 000201 – 000220 (15 di head, 5 ke KLP)

DO $$
DECLARE
    v_admin_snd INTEGER;
    v_admin_bsd INTEGER;
    v_admin_pik INTEGER;
    v_br_snd    INTEGER;
    v_br_mkw    INTEGER;
    v_br_kbp    INTEGER;
    v_br_bsd    INTEGER;
    v_br_tgr    INTEGER;
    v_br_pik    INTEGER;
    v_br_klp    INTEGER;
    i           INTEGER;
    v_cert_num  TEXT;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_mkw FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_kbp FROM branches WHERE code = 'KBP' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_tgr FROM branches WHERE code = 'TGR' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;
    SELECT id INTO v_br_klp FROM branches WHERE code = 'KLP' LIMIT 1;

    -- ── SND: 001–030 stay in head branch (in_stock) ───────────────────────
    FOR i IN 1..30 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_snd, v_br_snd, 'in_stock', true, v_admin_snd
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── SND: 031–040 migrated to MKW ─────────────────────────────────────
    FOR i IN 31..40 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_snd, v_br_mkw, 'in_stock', true, v_admin_snd
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── SND: 041–050 migrated to KBP ─────────────────────────────────────
    FOR i IN 41..50 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_snd, v_br_kbp, 'in_stock', true, v_admin_snd
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── BSD: 101–120 stay in head branch ─────────────────────────────────
    FOR i IN 101..120 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_bsd, v_br_bsd, 'in_stock', true, v_admin_bsd
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── BSD: 121–130 migrated to TGR ─────────────────────────────────────
    FOR i IN 121..130 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_bsd, v_br_tgr, 'in_stock', true, v_admin_bsd
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── PIK: 201–215 stay in head branch ─────────────────────────────────
    FOR i IN 201..215 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_pik, v_br_pik, 'in_stock', true, v_admin_pik
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;

    -- ── PIK: 216–220 migrated to KLP ─────────────────────────────────────
    FOR i IN 216..220 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        SELECT v_cert_num, v_br_pik, v_br_klp, 'in_stock', true, v_admin_pik
        WHERE NOT EXISTS (SELECT 1 FROM certificates WHERE certificate_number = v_cert_num);
    END LOOP;
END $$;


-- ─── 9. CERTIFICATE MIGRATIONS (history migrasi) ─────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER;
    v_admin_bsd INTEGER;
    v_admin_pik INTEGER;
    v_br_snd    INTEGER;
    v_br_mkw    INTEGER;
    v_br_kbp    INTEGER;
    v_br_bsd    INTEGER;
    v_br_tgr    INTEGER;
    v_br_pik    INTEGER;
    v_br_klp    INTEGER;
    v_cert      RECORD;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_mkw FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_kbp FROM branches WHERE code = 'KBP' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_tgr FROM branches WHERE code = 'TGR' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;
    SELECT id INTO v_br_klp FROM branches WHERE code = 'KLP' LIMIT 1;

    -- Migration records SND → MKW (cert 031-040)
    FOR v_cert IN
        SELECT id FROM certificates
        WHERE head_branch_id = v_br_snd AND current_branch_id = v_br_mkw
    LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        SELECT v_cert.id, v_br_snd, v_br_mkw, v_admin_snd
        WHERE NOT EXISTS (
            SELECT 1 FROM certificate_migrations
            WHERE certificate_id = v_cert.id AND to_branch_id = v_br_mkw
        );
    END LOOP;

    -- Migration records SND → KBP (cert 041-050)
    FOR v_cert IN
        SELECT id FROM certificates
        WHERE head_branch_id = v_br_snd AND current_branch_id = v_br_kbp
    LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        SELECT v_cert.id, v_br_snd, v_br_kbp, v_admin_snd
        WHERE NOT EXISTS (
            SELECT 1 FROM certificate_migrations
            WHERE certificate_id = v_cert.id AND to_branch_id = v_br_kbp
        );
    END LOOP;

    -- Migration records BSD → TGR (cert 121-130)
    FOR v_cert IN
        SELECT id FROM certificates
        WHERE head_branch_id = v_br_bsd AND current_branch_id = v_br_tgr
    LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        SELECT v_cert.id, v_br_bsd, v_br_tgr, v_admin_bsd
        WHERE NOT EXISTS (
            SELECT 1 FROM certificate_migrations
            WHERE certificate_id = v_cert.id AND to_branch_id = v_br_tgr
        );
    END LOOP;

    -- Migration records PIK → KLP (cert 216-220)
    FOR v_cert IN
        SELECT id FROM certificates
        WHERE head_branch_id = v_br_pik AND current_branch_id = v_br_klp
    LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        SELECT v_cert.id, v_br_pik, v_br_klp, v_admin_pik
        WHERE NOT EXISTS (
            SELECT 1 FROM certificate_migrations
            WHERE certificate_id = v_cert.id AND to_branch_id = v_br_klp
        );
    END LOOP;
END $$;


-- ─── 10. STUDENTS ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_br_snd INTEGER;
    v_br_bsd INTEGER;
    v_br_pik INTEGER;
BEGIN
    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;

    -- Students SND
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Andi Pratama',       v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Bintang Ramadhan',   v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Citra Dewi',         v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Dika Firmansyah',    v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Elsa Kurniawan',     v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Fajar Nugroho',      v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Gita Sari',          v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Hendra Susanto',     v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Indah Permata',      v_br_snd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Joko Widodo',        v_br_snd, true) ON CONFLICT DO NOTHING;

    -- Students BSD
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Kevin Mahardika',    v_br_bsd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Laila Rahma',        v_br_bsd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Maulana Ibrahim',    v_br_bsd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Nina Agustina',      v_br_bsd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Oscar Tampubolon',   v_br_bsd, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Putri Handayani',    v_br_bsd, true) ON CONFLICT DO NOTHING;

    -- Students PIK
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Qori Ananda',        v_br_pik, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Raka Saputra',       v_br_pik, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Salsabila Zahra',    v_br_pik, true) ON CONFLICT DO NOTHING;
    INSERT INTO students (name, head_branch_id, is_active) VALUES ('Taufik Hidayat',     v_br_pik, true) ON CONFLICT DO NOTHING;
END $$;


-- ─── 11. CERTIFICATE PRINTS & RESERVATIONS ────────────────────────────────
-- Print 5 sertifikat SND (No. 000001–000005) oleh teacher_snd_01
-- Status sertifikat tersebut diupdate ke 'printed'

DO $$
DECLARE
    v_teacher_snd_01  INTEGER;
    v_br_mkw          INTEGER;
    v_br_snd          INTEGER;

    v_mod_snd_eng_tod INTEGER;
    v_mod_snd_eng_knd INTEGER;
    v_mod_snd_mtg_elm INTEGER;

    v_cert            RECORD;
    v_student         RECORD;
    v_cert_numbers    TEXT[] := ARRAY[
        'No. 000001', 'No. 000002', 'No. 000003', 'No. 000004', 'No. 000005'
    ];
    v_student_names   TEXT[] := ARRAY[
        'Andi Pratama', 'Bintang Ramadhan', 'Citra Dewi', 'Dika Firmansyah', 'Elsa Kurniawan'
    ];
    v_ptc_dates       DATE[]  := ARRAY[
        '2025-10-01'::DATE, '2025-10-05'::DATE, '2025-10-10'::DATE,
        '2025-10-15'::DATE, '2025-10-20'::DATE
    ];
    i                 INTEGER;
BEGIN
    SELECT id INTO v_teacher_snd_01 FROM users WHERE username = 'teacher_snd_01' LIMIT 1;
    SELECT id INTO v_br_mkw         FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_snd         FROM branches WHERE code = 'SND' LIMIT 1;

    SELECT id INTO v_mod_snd_eng_tod FROM modules WHERE module_code = 'SND-ENG-TOD-1' LIMIT 1;
    SELECT id INTO v_mod_snd_eng_knd FROM modules WHERE module_code = 'SND-ENG-KND-1' LIMIT 1;
    SELECT id INTO v_mod_snd_mtg_elm FROM modules WHERE module_code = 'SND-MTH-ELM-1' LIMIT 1;

    FOR i IN 1..5 LOOP
        -- Get certificate
        SELECT id, certificate_number
        INTO v_cert
        FROM certificates
        WHERE certificate_number = v_cert_numbers[i]
        LIMIT 1;

        -- Get student
        SELECT id
        INTO v_student
        FROM students
        WHERE name = v_student_names[i] AND head_branch_id = v_br_snd
        LIMIT 1;

        -- Only insert if not already printed
        IF v_cert.id IS NOT NULL AND v_student.id IS NOT NULL THEN
            IF NOT EXISTS (SELECT 1 FROM certificate_prints WHERE certificate_id = v_cert.id) THEN

                -- Update certificate status to printed
                UPDATE certificates SET status = 'printed', updated_at = NOW()
                WHERE id = v_cert.id;

                -- Insert print record
                INSERT INTO certificate_prints (
                    certificate_id, certificate_number, student_id, student_name,
                    module_id, teacher_id, branch_id, ptc_date
                )
                VALUES (
                    v_cert.id,
                    v_cert_numbers[i],
                    v_student.id,
                    v_student_names[i],
                    CASE
                        WHEN i <= 2 THEN v_mod_snd_eng_tod
                        WHEN i <= 4 THEN v_mod_snd_eng_knd
                        ELSE v_mod_snd_mtg_elm
                    END,
                    v_teacher_snd_01,
                    v_br_mkw,
                    v_ptc_dates[i]
                );
            END IF;
        END IF;
    END LOOP;
END $$;


-- ─── 12. CERTIFICATE LOGS ─────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd      INTEGER;
    v_admin_bsd      INTEGER;
    v_admin_pik      INTEGER;
    v_teacher_snd_01 INTEGER;
    v_br_snd         INTEGER;
    v_br_mkw         INTEGER;
    v_br_kbp         INTEGER;
    v_br_bsd         INTEGER;
    v_br_tgr         INTEGER;
    v_br_pik         INTEGER;
    v_br_klp         INTEGER;
    v_cert           RECORD;
BEGIN
    SELECT id INTO v_admin_snd      FROM users WHERE username = 'gulam'         LIMIT 1;
    SELECT id INTO v_admin_bsd      FROM users WHERE username = 'vormes'        LIMIT 1;
    SELECT id INTO v_admin_pik      FROM users WHERE username = 'rayyan'        LIMIT 1;
    SELECT id INTO v_teacher_snd_01 FROM users WHERE username = 'teacher_snd_01' LIMIT 1;

    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_mkw FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_kbp FROM branches WHERE code = 'KBP' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_tgr FROM branches WHERE code = 'TGR' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;
    SELECT id INTO v_br_klp FROM branches WHERE code = 'KLP' LIMIT 1;

    -- Log: bulk_create SND (50 sertifikat sekaligus)
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'bulk_create', v_admin_snd, 'admin',
           NULL, v_br_snd,
           '{"start_number":"No. 000001","end_number":"No. 000050","count":50}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'bulk_create' AND actor_id = v_admin_snd AND to_branch_id = v_br_snd
    );

    -- Log: bulk_create BSD
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'bulk_create', v_admin_bsd, 'admin',
           NULL, v_br_bsd,
           '{"start_number":"No. 000101","end_number":"No. 000130","count":30}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'bulk_create' AND actor_id = v_admin_bsd AND to_branch_id = v_br_bsd
    );

    -- Log: bulk_create PIK
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'bulk_create', v_admin_pik, 'admin',
           NULL, v_br_pik,
           '{"start_number":"No. 000201","end_number":"No. 000220","count":20}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'bulk_create' AND actor_id = v_admin_pik AND to_branch_id = v_br_pik
    );

    -- Log: migrate SND → MKW
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'migrate', v_admin_snd, 'admin',
           v_br_snd, v_br_mkw,
           '{"start_number":"No. 000031","end_number":"No. 000040","count":10}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'migrate' AND actor_id = v_admin_snd AND to_branch_id = v_br_mkw
    );

    -- Log: migrate SND → KBP
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'migrate', v_admin_snd, 'admin',
           v_br_snd, v_br_kbp,
           '{"start_number":"No. 000041","end_number":"No. 000050","count":10}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'migrate' AND actor_id = v_admin_snd AND to_branch_id = v_br_kbp
    );

    -- Log: migrate BSD → TGR
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'migrate', v_admin_bsd, 'admin',
           v_br_bsd, v_br_tgr,
           '{"start_number":"No. 000121","end_number":"No. 000130","count":10}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'migrate' AND actor_id = v_admin_bsd AND to_branch_id = v_br_tgr
    );

    -- Log: migrate PIK → KLP
    INSERT INTO certificate_logs (
        certificate_id, action_type, actor_id, actor_role,
        from_branch_id, to_branch_id, metadata
    )
    SELECT NULL, 'migrate', v_admin_pik, 'admin',
           v_br_pik, v_br_klp,
           '{"start_number":"No. 000216","end_number":"No. 000220","count":5}'::JSONB
    WHERE NOT EXISTS (
        SELECT 1 FROM certificate_logs
        WHERE action_type = 'migrate' AND actor_id = v_admin_pik AND to_branch_id = v_br_klp
    );

    -- Log: print (5 sertifikat oleh teacher_snd_01)
    FOR v_cert IN
        SELECT cp.certificate_id, cp.student_name, cp.module_id
        FROM certificate_prints cp
        WHERE cp.teacher_id = v_teacher_snd_01
        LIMIT 5
    LOOP
        INSERT INTO certificate_logs (
            certificate_id, action_type, actor_id, actor_role,
            from_branch_id, to_branch_id, metadata
        )
        SELECT
            v_cert.certificate_id,
            'print',
            v_teacher_snd_01,
            'teacher',
            NULL,
            v_br_mkw,
            json_build_object(
                'student_name', v_cert.student_name,
                'module_id',    v_cert.module_id
            )::JSONB
        WHERE NOT EXISTS (
            SELECT 1 FROM certificate_logs
            WHERE certificate_id = v_cert.certificate_id
              AND action_type = 'print'
              AND actor_id = v_teacher_snd_01
        );
    END LOOP;
END $$;


-- ─── 13. VERIFICATION ─────────────────────────────────────────────────────

DO $$
DECLARE
    v_branches    INTEGER;
    v_users       INTEGER;
    v_divisions   INTEGER;
    v_sub_div     INTEGER;
    v_modules     INTEGER;
    v_tb          INTEGER;
    v_td          INTEGER;
    v_certs       INTEGER;
    v_migrations  INTEGER;
    v_students    INTEGER;
    v_prints      INTEGER;
    v_logs        INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_branches   FROM branches;
    SELECT COUNT(*) INTO v_users      FROM users;
    SELECT COUNT(*) INTO v_divisions  FROM divisions;
    SELECT COUNT(*) INTO v_sub_div    FROM sub_divisions;
    SELECT COUNT(*) INTO v_modules    FROM modules;
    SELECT COUNT(*) INTO v_tb         FROM teacher_branches;
    SELECT COUNT(*) INTO v_td         FROM teacher_divisions;
    SELECT COUNT(*) INTO v_certs      FROM certificates;
    SELECT COUNT(*) INTO v_migrations FROM certificate_migrations;
    SELECT COUNT(*) INTO v_students   FROM students;
    SELECT COUNT(*) INTO v_prints     FROM certificate_prints;
    SELECT COUNT(*) INTO v_logs       FROM certificate_logs;

    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '         SEED DATA LOADED SUCCESSFULLY             ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '';
    RAISE NOTICE 'ACCOUNTS (password: admin123)';
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE '  SuperAdmin  : gem';
    RAISE NOTICE '  Admin SND   : gulam';
    RAISE NOTICE '  Admin BSD   : vormes';
    RAISE NOTICE '  Admin PIK   : rayyan';
    RAISE NOTICE '  Teacher SND : teacher_snd_01, _02, _03';
    RAISE NOTICE '  Teacher BSD : teacher_bsd_01, _02';
    RAISE NOTICE '  Teacher PIK : teacher_pik_01, _02';
    RAISE NOTICE '';
    RAISE NOTICE 'DATA SUMMARY';
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE '  Branches          : % (3 head + 7 sub)', v_branches;
    RAISE NOTICE '  Users             : %', v_users;
    RAISE NOTICE '  Divisions         : %', v_divisions;
    RAISE NOTICE '  Sub Divisions     : %', v_sub_div;
    RAISE NOTICE '  Modules           : %', v_modules;
    RAISE NOTICE '  Teacher Branches  : %', v_tb;
    RAISE NOTICE '  Teacher Divisions : %', v_td;
    RAISE NOTICE '  Certificates      : % (SND:50 / BSD:30 / PIK:20)', v_certs;
    RAISE NOTICE '  Migrations        : %', v_migrations;
    RAISE NOTICE '  Students          : %', v_students;
    RAISE NOTICE '  Certificate Prints: %', v_prints;
    RAISE NOTICE '  Certificate Logs  : %', v_logs;
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
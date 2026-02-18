-- =============================================
-- seed_development.sql
-- Data Testing Lengkap — DEVELOPMENT ONLY
-- =============================================
-- Jalankan SETELAH init_database.sql
-- JANGAN jalankan di production!
-- =============================================
-- Semua password: admin123
-- Hash bcryptjs cost 10:
--   $2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu
-- =============================================
-- Akun yang tersedia setelah seed ini:
--   superAdmin : gem
--   admin SND  : gulam
--   admin BSD  : vormes
--   admin PIK  : rayyan
--   teacher SND: teacher_snd_01, _02, _03
--   teacher BSD: teacher_bsd_01, _02
--   teacher PIK: teacher_pik_01, _02
-- =============================================

BEGIN;

-- ─── FLUSH SEBELUM SEED (aman dijalankan ulang) ──────────────────────────

DELETE FROM certificate_logs;
DELETE FROM certificate_pdfs;
DELETE FROM certificate_prints;
DELETE FROM certificate_reservations;
DELETE FROM certificate_migrations;
DELETE FROM certificates;
DELETE FROM students;
DELETE FROM teacher_divisions;
DELETE FROM teacher_branches;
DELETE FROM modules;
DELETE FROM sub_divisions;
DELETE FROM divisions;
DELETE FROM refresh_tokens WHERE user_id IN (SELECT id FROM users WHERE role != 'superAdmin');
DELETE FROM users WHERE role != 'superAdmin';
DELETE FROM branches;
DELETE FROM login_attempts;
DELETE FROM database_backups;

SELECT setval('branches_id_seq',                 1, false);
SELECT setval('divisions_id_seq',                1, false);
SELECT setval('sub_divisions_id_seq',            1, false);
SELECT setval('modules_id_seq',                  1, false);
SELECT setval('teacher_branches_id_seq',         1, false);
SELECT setval('teacher_divisions_id_seq',        1, false);
SELECT setval('certificates_id_seq',             1, false);
SELECT setval('certificate_reservations_id_seq', 1, false);
SELECT setval('certificate_migrations_id_seq',   1, false);
SELECT setval('students_id_seq',                 1, false);
SELECT setval('certificate_prints_id_seq',       1, false);
SELECT setval('certificate_pdfs_id_seq',         1, false);
SELECT setval('certificate_logs_id_seq',         1, false);
SELECT setval('database_backups_id_seq',         1, false);
SELECT setval('login_attempts_id_seq',           1, false);


-- ─── 1. BRANCHES ──────────────────────────────────────────────────────────

-- Head Branches
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active) VALUES
    ('SND', 'SUNDA', true, NULL, true),
    ('BSD', 'BSD',   true, NULL, true),
    ('PIK', 'PIK',   true, NULL, true);

-- Sub Branches (SND)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active) VALUES
    ('MKW', 'MEKARWANGI',            false, (SELECT id FROM branches WHERE code = 'SND'), true),
    ('KBP', 'KOTA BARU PARAHYANGAN', false, (SELECT id FROM branches WHERE code = 'SND'), true),
    ('CML', 'CIMAHI LEMBANG',        false, (SELECT id FROM branches WHERE code = 'SND'), true);

-- Sub Branches (BSD)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active) VALUES
    ('TGR', 'TANGERANG', false, (SELECT id FROM branches WHERE code = 'BSD'), true),
    ('SRP', 'SERPONG',   false, (SELECT id FROM branches WHERE code = 'BSD'), true);

-- Sub Branches (PIK)
INSERT INTO branches (code, name, is_head_branch, parent_id, is_active) VALUES
    ('KLP', 'KELAPA GADING', false, (SELECT id FROM branches WHERE code = 'PIK'), true),
    ('PLM', 'PLUIT MUARA',   false, (SELECT id FROM branches WHERE code = 'PIK'), true);


-- ─── 2. USERS ─────────────────────────────────────────────────────────────

-- Admin per Head Branch
INSERT INTO users (username, password, role, full_name, branch_id, is_active) VALUES
    ('gulam',  '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'admin', 'Admin SUNDA', (SELECT id FROM branches WHERE code = 'SND'), true),
    ('vormes', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'admin', 'Admin BSD',   (SELECT id FROM branches WHERE code = 'BSD'), true),
    ('rayyan', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'admin', 'Admin PIK',   (SELECT id FROM branches WHERE code = 'PIK'), true);

-- Teachers SND
INSERT INTO users (username, password, role, full_name, branch_id, is_active) VALUES
    ('teacher_snd_01', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Budi Santoso', (SELECT id FROM branches WHERE code = 'MKW'), true),
    ('teacher_snd_02', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Siti Rahayu',  (SELECT id FROM branches WHERE code = 'KBP'), true),
    ('teacher_snd_03', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Ahmad Fauzi',  (SELECT id FROM branches WHERE code = 'SND'), true);

-- Teachers BSD
INSERT INTO users (username, password, role, full_name, branch_id, is_active) VALUES
    ('teacher_bsd_01', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Dewi Putri',    (SELECT id FROM branches WHERE code = 'TGR'), true),
    ('teacher_bsd_02', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Rizky Pratama', (SELECT id FROM branches WHERE code = 'SRP'), true);

-- Teachers PIK
INSERT INTO users (username, password, role, full_name, branch_id, is_active) VALUES
    ('teacher_pik_01', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Nurul Hidayah', (SELECT id FROM branches WHERE code = 'KLP'), true),
    ('teacher_pik_02', '$2a$10$y5KQ.TAOVEEnaLVDZRUmgumHeUzEA4g4Jdpq079q5Rs4dW4PQHrYu', 'teacher', 'Hendra Wijaya', (SELECT id FROM branches WHERE code = 'PLM'), true);


-- ─── 3. DIVISIONS ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;

    INSERT INTO divisions (name, is_active, created_by) VALUES
        ('Junior Koders', true, v_admin_snd), ('Little Koders', true, v_admin_snd),
        ('Junior Koders', true, v_admin_bsd), ('Little Koders', true, v_admin_bsd),
        ('Junior Koders', true, v_admin_pik), ('Little Koders', true, v_admin_pik);
END $$;


-- ─── 4. SUB DIVISIONS ─────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_snd_jk INTEGER; v_snd_lk INTEGER;
    v_bsd_jk INTEGER; v_bsd_lk INTEGER;
    v_pik_jk INTEGER; v_pik_lk INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;
    SELECT id INTO v_snd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_bsd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_pik_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_pik LIMIT 1;

    -- SND > JK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_snd_jk, 'JK Level 1', 10, 12), (v_snd_jk, 'JK Level 2', 13, 15), (v_snd_jk, 'JK Level 3', 16, 18);
    -- SND > LK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_snd_lk, 'LK Level 1', 5, 6), (v_snd_lk, 'LK Level 2', 7, 9), (v_snd_lk, 'LK Level 3', 10, 12);
    -- BSD > JK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_bsd_jk, 'JK Level 1', 10, 12), (v_bsd_jk, 'JK Level 2', 13, 15);
    -- BSD > LK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_bsd_lk, 'LK Level 1', 5, 6), (v_bsd_lk, 'LK Level 2', 7, 9);
    -- PIK > JK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_pik_jk, 'JK Level 1', 10, 12);
    -- PIK > LK
    INSERT INTO sub_divisions (division_id, name, age_min, age_max) VALUES
        (v_pik_lk, 'LK Level 1', 5, 6), (v_pik_lk, 'LK Level 2', 7, 9);
END $$;


-- ─── 5. MODULES ───────────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_snd_jk INTEGER; v_snd_lk INTEGER; v_bsd_jk INTEGER; v_bsd_lk INTEGER; v_pik_jk INTEGER; v_pik_lk INTEGER;
    v_snd_jk_l1 INTEGER; v_snd_jk_l2 INTEGER; v_snd_jk_l3 INTEGER;
    v_snd_lk_l1 INTEGER; v_snd_lk_l2 INTEGER; v_snd_lk_l3 INTEGER;
    v_bsd_jk_l1 INTEGER; v_bsd_jk_l2 INTEGER; v_bsd_lk_l1 INTEGER; v_bsd_lk_l2 INTEGER;
    v_pik_jk_l1 INTEGER; v_pik_lk_l1 INTEGER; v_pik_lk_l2 INTEGER;
BEGIN
    SELECT id INTO v_admin_snd FROM users WHERE username = 'gulam'  LIMIT 1;
    SELECT id INTO v_admin_bsd FROM users WHERE username = 'vormes' LIMIT 1;
    SELECT id INTO v_admin_pik FROM users WHERE username = 'rayyan' LIMIT 1;
    SELECT id INTO v_snd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_bsd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_pik_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_snd_jk_l1 FROM sub_divisions WHERE division_id = v_snd_jk AND name = 'JK Level 1' LIMIT 1;
    SELECT id INTO v_snd_jk_l2 FROM sub_divisions WHERE division_id = v_snd_jk AND name = 'JK Level 2' LIMIT 1;
    SELECT id INTO v_snd_jk_l3 FROM sub_divisions WHERE division_id = v_snd_jk AND name = 'JK Level 3' LIMIT 1;
    SELECT id INTO v_snd_lk_l1 FROM sub_divisions WHERE division_id = v_snd_lk AND name = 'LK Level 1' LIMIT 1;
    SELECT id INTO v_snd_lk_l2 FROM sub_divisions WHERE division_id = v_snd_lk AND name = 'LK Level 2' LIMIT 1;
    SELECT id INTO v_snd_lk_l3 FROM sub_divisions WHERE division_id = v_snd_lk AND name = 'LK Level 3' LIMIT 1;
    SELECT id INTO v_bsd_jk_l1 FROM sub_divisions WHERE division_id = v_bsd_jk AND name = 'JK Level 1' LIMIT 1;
    SELECT id INTO v_bsd_jk_l2 FROM sub_divisions WHERE division_id = v_bsd_jk AND name = 'JK Level 2' LIMIT 1;
    SELECT id INTO v_bsd_lk_l1 FROM sub_divisions WHERE division_id = v_bsd_lk AND name = 'LK Level 1' LIMIT 1;
    SELECT id INTO v_bsd_lk_l2 FROM sub_divisions WHERE division_id = v_bsd_lk AND name = 'LK Level 2' LIMIT 1;
    SELECT id INTO v_pik_jk_l1 FROM sub_divisions WHERE division_id = v_pik_jk AND name = 'JK Level 1' LIMIT 1;
    SELECT id INTO v_pik_lk_l1 FROM sub_divisions WHERE division_id = v_pik_lk AND name = 'LK Level 1' LIMIT 1;
    SELECT id INTO v_pik_lk_l2 FROM sub_divisions WHERE division_id = v_pik_lk AND name = 'LK Level 2' LIMIT 1;

    INSERT INTO modules (module_code, name, division_id, sub_div_id, created_by) VALUES
        ('SND-JK-L1-01', 'Scratch Basics',         v_snd_jk, v_snd_jk_l1, v_admin_snd),
        ('SND-JK-L1-02', 'Scratch Intermediate',   v_snd_jk, v_snd_jk_l1, v_admin_snd),
        ('SND-JK-L2-01', 'Python Fundamentals',    v_snd_jk, v_snd_jk_l2, v_admin_snd),
        ('SND-JK-L2-02', 'Python OOP',             v_snd_jk, v_snd_jk_l2, v_admin_snd),
        ('SND-JK-L3-01', 'Web Development Basics', v_snd_jk, v_snd_jk_l3, v_admin_snd),
        ('SND-LK-L1-01', 'Coding for Kids',        v_snd_lk, v_snd_lk_l1, v_admin_snd),
        ('SND-LK-L2-01', 'Visual Coding',          v_snd_lk, v_snd_lk_l2, v_admin_snd),
        ('SND-LK-L3-01', 'Scratch Advanced',       v_snd_lk, v_snd_lk_l3, v_admin_snd),
        ('BSD-JK-L1-01', 'Scratch Basics',         v_bsd_jk, v_bsd_jk_l1, v_admin_bsd),
        ('BSD-JK-L2-01', 'Python Fundamentals',    v_bsd_jk, v_bsd_jk_l2, v_admin_bsd),
        ('BSD-LK-L1-01', 'Coding for Kids',        v_bsd_lk, v_bsd_lk_l1, v_admin_bsd),
        ('BSD-LK-L2-01', 'Visual Coding',          v_bsd_lk, v_bsd_lk_l2, v_admin_bsd),
        ('PIK-JK-L1-01', 'Scratch Basics',         v_pik_jk, v_pik_jk_l1, v_admin_pik),
        ('PIK-LK-L1-01', 'Coding for Kids',        v_pik_lk, v_pik_lk_l1, v_admin_pik),
        ('PIK-LK-L2-01', 'Visual Coding',          v_pik_lk, v_pik_lk_l2, v_admin_pik);
END $$;


-- ─── 6. TEACHER BRANCHES ──────────────────────────────────────────────────

DO $$
DECLARE
    v_t_snd_01 INTEGER; v_t_snd_02 INTEGER; v_t_snd_03 INTEGER;
    v_t_bsd_01 INTEGER; v_t_bsd_02 INTEGER;
    v_t_pik_01 INTEGER; v_t_pik_02 INTEGER;
    v_br_snd INTEGER; v_br_mkw INTEGER; v_br_kbp INTEGER; v_br_cml INTEGER;
    v_br_bsd INTEGER; v_br_tgr INTEGER; v_br_srp INTEGER;
    v_br_pik INTEGER; v_br_klp INTEGER; v_br_plm INTEGER;
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

    INSERT INTO teacher_branches (teacher_id, branch_id) VALUES
        (v_t_snd_01, v_br_mkw), (v_t_snd_01, v_br_kbp),
        (v_t_snd_02, v_br_kbp), (v_t_snd_02, v_br_cml),
        (v_t_snd_03, v_br_snd), (v_t_snd_03, v_br_mkw),
        (v_t_bsd_01, v_br_tgr), (v_t_bsd_01, v_br_srp),
        (v_t_bsd_02, v_br_srp), (v_t_bsd_02, v_br_bsd),
        (v_t_pik_01, v_br_klp), (v_t_pik_01, v_br_plm),
        (v_t_pik_02, v_br_plm), (v_t_pik_02, v_br_pik);
END $$;


-- ─── 7. TEACHER DIVISIONS ─────────────────────────────────────────────────

DO $$
DECLARE
    v_t_snd_01 INTEGER; v_t_snd_02 INTEGER; v_t_snd_03 INTEGER;
    v_t_bsd_01 INTEGER; v_t_bsd_02 INTEGER;
    v_t_pik_01 INTEGER; v_t_pik_02 INTEGER;
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_snd_jk INTEGER; v_snd_lk INTEGER; v_bsd_jk INTEGER; v_bsd_lk INTEGER; v_pik_jk INTEGER; v_pik_lk INTEGER;
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
    SELECT id INTO v_snd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_snd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_snd LIMIT 1;
    SELECT id INTO v_bsd_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_bsd_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_bsd LIMIT 1;
    SELECT id INTO v_pik_jk FROM divisions WHERE name = 'Junior Koders' AND created_by = v_admin_pik LIMIT 1;
    SELECT id INTO v_pik_lk FROM divisions WHERE name = 'Little Koders' AND created_by = v_admin_pik LIMIT 1;

    INSERT INTO teacher_divisions (teacher_id, division_id) VALUES
        (v_t_snd_01, v_snd_jk),
        (v_t_snd_02, v_snd_lk),
        (v_t_snd_03, v_snd_jk), (v_t_snd_03, v_snd_lk),
        (v_t_bsd_01, v_bsd_jk), (v_t_bsd_01, v_bsd_lk),
        (v_t_bsd_02, v_bsd_lk),
        (v_t_pik_01, v_pik_jk),
        (v_t_pik_02, v_pik_jk), (v_t_pik_02, v_pik_lk);
END $$;


-- ─── 8. CERTIFICATES ──────────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_br_snd INTEGER; v_br_mkw INTEGER; v_br_kbp INTEGER;
    v_br_bsd INTEGER; v_br_tgr INTEGER;
    v_br_pik INTEGER; v_br_klp INTEGER;
    i INTEGER; v_cert_num TEXT;
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

    -- SND: 001-030 di head branch SND
    FOR i IN 1..30 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_snd, v_br_snd, 'in_stock', true, v_admin_snd);
    END LOOP;

    -- SND: 031-040 ke MKW
    FOR i IN 31..40 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_snd, v_br_mkw, 'in_stock', true, v_admin_snd);
    END LOOP;

    -- SND: 041-050 ke KBP
    FOR i IN 41..50 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_snd, v_br_kbp, 'in_stock', true, v_admin_snd);
    END LOOP;

    -- BSD: 101-120 di head branch BSD
    FOR i IN 101..120 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_bsd, v_br_bsd, 'in_stock', true, v_admin_bsd);
    END LOOP;

    -- BSD: 121-130 ke TGR
    FOR i IN 121..130 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_bsd, v_br_tgr, 'in_stock', true, v_admin_bsd);
    END LOOP;

    -- PIK: 201-215 di head branch PIK
    FOR i IN 201..215 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_pik, v_br_pik, 'in_stock', true, v_admin_pik);
    END LOOP;

    -- PIK: 216-220 ke KLP
    FOR i IN 216..220 LOOP
        v_cert_num := 'No. ' || LPAD(i::TEXT, 6, '0');
        INSERT INTO certificates (certificate_number, head_branch_id, current_branch_id, status, medal_included, created_by)
        VALUES (v_cert_num, v_br_pik, v_br_klp, 'in_stock', true, v_admin_pik);
    END LOOP;
END $$;


-- ─── 9. CERTIFICATE MIGRATIONS ────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_br_snd INTEGER; v_br_mkw INTEGER; v_br_kbp INTEGER;
    v_br_bsd INTEGER; v_br_tgr INTEGER;
    v_br_pik INTEGER; v_br_klp INTEGER;
    v_cert RECORD;
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

    FOR v_cert IN SELECT id FROM certificates WHERE head_branch_id = v_br_snd AND current_branch_id = v_br_mkw LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        VALUES (v_cert.id, v_br_snd, v_br_mkw, v_admin_snd);
    END LOOP;
    FOR v_cert IN SELECT id FROM certificates WHERE head_branch_id = v_br_snd AND current_branch_id = v_br_kbp LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        VALUES (v_cert.id, v_br_snd, v_br_kbp, v_admin_snd);
    END LOOP;
    FOR v_cert IN SELECT id FROM certificates WHERE head_branch_id = v_br_bsd AND current_branch_id = v_br_tgr LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        VALUES (v_cert.id, v_br_bsd, v_br_tgr, v_admin_bsd);
    END LOOP;
    FOR v_cert IN SELECT id FROM certificates WHERE head_branch_id = v_br_pik AND current_branch_id = v_br_klp LOOP
        INSERT INTO certificate_migrations (certificate_id, from_branch_id, to_branch_id, migrated_by)
        VALUES (v_cert.id, v_br_pik, v_br_klp, v_admin_pik);
    END LOOP;
END $$;


-- ─── 10. STUDENTS ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_br_snd INTEGER; v_br_bsd INTEGER; v_br_pik INTEGER;
BEGIN
    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;

    INSERT INTO students (name, head_branch_id, is_active) VALUES
        ('Andi Pratama',     v_br_snd, true), ('Bintang Ramadhan', v_br_snd, true),
        ('Citra Dewi',       v_br_snd, true), ('Dika Firmansyah',  v_br_snd, true),
        ('Elsa Kurniawan',   v_br_snd, true), ('Fajar Nugroho',    v_br_snd, true),
        ('Kevin Mahardika',  v_br_bsd, true), ('Laila Rahma',      v_br_bsd, true),
        ('Maulana Ibrahim',  v_br_bsd, true), ('Nina Agustina',    v_br_bsd, true),
        ('Qori Ananda',      v_br_pik, true), ('Raka Saputra',     v_br_pik, true),
        ('Salsabila Zahra',  v_br_pik, true), ('Taufik Hidayat',   v_br_pik, true);
END $$;


-- ─── 11. CERTIFICATE PRINTS (5 contoh) ────────────────────────────────────

DO $$
DECLARE
    v_teacher_snd_01 INTEGER;
    v_br_mkw INTEGER; v_br_snd INTEGER;
    v_mod    INTEGER;
    v_cert_id    INTEGER;
    v_student_id INTEGER;
    v_cert_numbers  TEXT[] := ARRAY['No. 000031','No. 000032','No. 000033','No. 000034','No. 000035'];
    v_student_names TEXT[] := ARRAY['Andi Pratama','Bintang Ramadhan','Citra Dewi','Dika Firmansyah','Elsa Kurniawan'];
    v_ptc_dates     DATE[] := ARRAY['2025-10-01'::DATE,'2025-10-05'::DATE,'2025-10-10'::DATE,'2025-10-15'::DATE,'2025-10-20'::DATE];
    i INTEGER;
BEGIN
    SELECT id INTO v_teacher_snd_01 FROM users    WHERE username    = 'teacher_snd_01' LIMIT 1;
    SELECT id INTO v_br_mkw         FROM branches WHERE code        = 'MKW'            LIMIT 1;
    SELECT id INTO v_br_snd         FROM branches WHERE code        = 'SND'            LIMIT 1;
    SELECT id INTO v_mod            FROM modules  WHERE module_code = 'SND-JK-L1-01'  LIMIT 1;

    FOR i IN 1..5 LOOP
        SELECT id INTO v_cert_id    FROM certificates WHERE certificate_number = v_cert_numbers[i] LIMIT 1;
        SELECT id INTO v_student_id FROM students WHERE name = v_student_names[i] AND head_branch_id = v_br_snd LIMIT 1;

        IF v_cert_id IS NOT NULL AND v_student_id IS NOT NULL THEN
            UPDATE certificates SET status = 'printed', updated_at = NOW() WHERE id = v_cert_id;
            INSERT INTO certificate_prints (
                certificate_id, certificate_number, student_id, student_name,
                module_id, teacher_id, branch_id, ptc_date
            ) VALUES (
                v_cert_id, v_cert_numbers[i], v_student_id, v_student_names[i],
                v_mod, v_teacher_snd_01, v_br_mkw, v_ptc_dates[i]
            );
        END IF;
    END LOOP;
END $$;


-- ─── 12. CERTIFICATE LOGS ─────────────────────────────────────────────────

DO $$
DECLARE
    v_admin_snd INTEGER; v_admin_bsd INTEGER; v_admin_pik INTEGER;
    v_teacher_snd_01 INTEGER;
    v_br_snd INTEGER; v_br_mkw INTEGER; v_br_kbp INTEGER;
    v_br_bsd INTEGER; v_br_tgr INTEGER;
    v_br_pik INTEGER; v_br_klp INTEGER;
    v_cert RECORD;
BEGIN
    SELECT id INTO v_admin_snd      FROM users WHERE username = 'gulam'          LIMIT 1;
    SELECT id INTO v_admin_bsd      FROM users WHERE username = 'vormes'         LIMIT 1;
    SELECT id INTO v_admin_pik      FROM users WHERE username = 'rayyan'         LIMIT 1;
    SELECT id INTO v_teacher_snd_01 FROM users WHERE username = 'teacher_snd_01' LIMIT 1;
    SELECT id INTO v_br_snd FROM branches WHERE code = 'SND' LIMIT 1;
    SELECT id INTO v_br_mkw FROM branches WHERE code = 'MKW' LIMIT 1;
    SELECT id INTO v_br_kbp FROM branches WHERE code = 'KBP' LIMIT 1;
    SELECT id INTO v_br_bsd FROM branches WHERE code = 'BSD' LIMIT 1;
    SELECT id INTO v_br_tgr FROM branches WHERE code = 'TGR' LIMIT 1;
    SELECT id INTO v_br_pik FROM branches WHERE code = 'PIK' LIMIT 1;
    SELECT id INTO v_br_klp FROM branches WHERE code = 'KLP' LIMIT 1;

    -- bulk_create logs
    INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata)
    VALUES
        (NULL, 'bulk_create', v_admin_snd, 'admin', NULL, v_br_snd, '{"start_number":"No. 000001","end_number":"No. 000050","count":50}'::JSONB),
        (NULL, 'bulk_create', v_admin_bsd, 'admin', NULL, v_br_bsd, '{"start_number":"No. 000101","end_number":"No. 000130","count":30}'::JSONB),
        (NULL, 'bulk_create', v_admin_pik, 'admin', NULL, v_br_pik, '{"start_number":"No. 000201","end_number":"No. 000220","count":20}'::JSONB);

    -- migrate logs
    INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata)
    VALUES
        (NULL, 'migrate', v_admin_snd, 'admin', v_br_snd, v_br_mkw, '{"start_number":"No. 000031","end_number":"No. 000040","count":10}'::JSONB),
        (NULL, 'migrate', v_admin_snd, 'admin', v_br_snd, v_br_kbp, '{"start_number":"No. 000041","end_number":"No. 000050","count":10}'::JSONB),
        (NULL, 'migrate', v_admin_bsd, 'admin', v_br_bsd, v_br_tgr, '{"start_number":"No. 000121","end_number":"No. 000130","count":10}'::JSONB),
        (NULL, 'migrate', v_admin_pik, 'admin', v_br_pik, v_br_klp, '{"start_number":"No. 000216","end_number":"No. 000220","count":5}'::JSONB);

    -- print logs
    FOR v_cert IN
        SELECT cp.certificate_id, cp.student_name, cp.module_id
        FROM certificate_prints cp WHERE cp.teacher_id = v_teacher_snd_01
    LOOP
        INSERT INTO certificate_logs (certificate_id, action_type, actor_id, actor_role, from_branch_id, to_branch_id, metadata)
        VALUES (
            v_cert.certificate_id, 'print', v_teacher_snd_01, 'teacher', NULL, v_br_mkw,
            json_build_object('student_name', v_cert.student_name, 'module_id', v_cert.module_id)::JSONB
        );
    END LOOP;
END $$;

COMMIT;


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_branches INTEGER; v_users INTEGER;    v_divisions INTEGER;
    v_sub_div  INTEGER; v_modules INTEGER;  v_tb INTEGER; v_td INTEGER;
    v_certs    INTEGER; v_migrations INTEGER; v_students INTEGER;
    v_prints   INTEGER; v_logs INTEGER;
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
    RAISE NOTICE '        SEED DEVELOPMENT LOADED SUCCESSFULLY       ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE 'AKUN TEST (semua password: admin123)';
    RAISE NOTICE '  superAdmin  : gem';
    RAISE NOTICE '  admin SND   : gulam';
    RAISE NOTICE '  admin BSD   : vormes';
    RAISE NOTICE '  admin PIK   : rayyan';
    RAISE NOTICE '  teacher SND : teacher_snd_01 (JK) | _02 (LK) | _03 (JK+LK)';
    RAISE NOTICE '  teacher BSD : teacher_bsd_01 (JK+LK) | _02 (LK)';
    RAISE NOTICE '  teacher PIK : teacher_pik_01 (JK) | _02 (JK+LK)';
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE 'RINGKASAN DATA';
    RAISE NOTICE '  Branches          : % (3 head + 7 sub)', v_branches;
    RAISE NOTICE '  Users             : % (1 superAdmin + 3 admin + 7 teacher)', v_users;
    RAISE NOTICE '  Divisions         : % (JK & LK per admin)', v_divisions;
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
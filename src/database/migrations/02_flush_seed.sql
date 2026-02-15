-- =============================================
-- 02_flush_seed.sql (FIXED)
-- Hapus SEMUA data test, sisakan superAdmin saja
-- Gunakan sebelum manual test ulang dari awal
-- =============================================
-- URUTAN DELETE penting — ikuti urutan FK!
-- =============================================

BEGIN;

-- ── 1. Logs & prints (no dependencies) ───────────────────────────────────
DELETE FROM certificate_logs;
DELETE FROM certificate_pdfs;        -- ✅ ADDED
DELETE FROM certificate_prints;

-- ── 2. Certificates & migrations & reservations ──────────────────────────
DELETE FROM certificate_reservations; -- ✅ ADDED
DELETE FROM certificate_migrations;
DELETE FROM certificates;

-- ── 3. Students ───────────────────────────────────────────────────────────
DELETE FROM students;

-- ── 4. Teacher assignments ────────────────────────────────────────────────
DELETE FROM teacher_divisions;
DELETE FROM teacher_branches;

-- ── 5. Modules ────────────────────────────────────────────────────────────
DELETE FROM modules;

-- ── 6. Sub divisions & divisions ─────────────────────────────────────────
DELETE FROM sub_divisions;
DELETE FROM divisions;

-- ── 7. Users — semua kecuali superAdmin ──────────────────────────────────
DELETE FROM refresh_tokens
WHERE user_id IN (SELECT id FROM users WHERE role != 'superAdmin');

DELETE FROM users WHERE role != 'superAdmin';

-- ── 8. Branches ───────────────────────────────────────────────────────────
DELETE FROM branches;

-- ── 9. Auth & backup logs (opsional) ─────────────────────────────────────
DELETE FROM login_attempts;
DELETE FROM database_backups;  -- ✅ ADDED

-- ── Reset sequences ───────────────────────────────────────────────────────
SELECT setval('branches_id_seq',                  1, false);
SELECT setval('divisions_id_seq',                 1, false);
SELECT setval('sub_divisions_id_seq',             1, false);
SELECT setval('modules_id_seq',                   1, false);
SELECT setval('teacher_branches_id_seq',          1, false);
SELECT setval('teacher_divisions_id_seq',         1, false);
SELECT setval('certificates_id_seq',              1, false);
SELECT setval('certificate_reservations_id_seq',  1, false);  -- ✅ ADDED
SELECT setval('certificate_migrations_id_seq',    1, false);
SELECT setval('students_id_seq',                  1, false);
SELECT setval('certificate_prints_id_seq',        1, false);
SELECT setval('certificate_pdfs_id_seq',          1, false);  -- ✅ ADDED
SELECT setval('certificate_logs_id_seq',          1, false);
SELECT setval('database_backups_id_seq',          1, false);  -- ✅ ADDED
SELECT setval('login_attempts_id_seq',            1, false);
SELECT setval('refresh_tokens_id_seq',            1, false);

COMMIT;

-- ── Verification ──────────────────────────────────────────────────────────
DO $$
DECLARE
    v_super RECORD;
BEGIN
    SELECT id, username, role INTO v_super
    FROM users WHERE role = 'superAdmin' LIMIT 1;

    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '           FLUSH COMPLETED SUCCESSFULLY            ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE 'Data yang dihapus:';
    RAISE NOTICE '  ✓ certificate_logs, certificate_pdfs, certificate_prints';
    RAISE NOTICE '  ✓ certificate_reservations, certificate_migrations, certificates';
    RAISE NOTICE '  ✓ students';
    RAISE NOTICE '  ✓ teacher_divisions, teacher_branches';
    RAISE NOTICE '  ✓ modules, sub_divisions, divisions';
    RAISE NOTICE '  ✓ users (selain superAdmin)';
    RAISE NOTICE '  ✓ branches';
    RAISE NOTICE '  ✓ login_attempts, database_backups, refresh_tokens';
    RAISE NOTICE '  ✓ sequences direset ke 1';
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE 'Akun yang tersisa:';
    RAISE NOTICE '  ID       : %', v_super.id;
    RAISE NOTICE '  Username : %', v_super.username;
    RAISE NOTICE '  Role     : %', v_super.role;
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE 'Jalankan 00_seed_data.sql untuk isi ulang test data.';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
-- =============================================
-- 01_seed_super_admin.sql
-- Untuk PRODUCTION — berisi akun superAdmin saja
-- =============================================
-- Username : gem
-- Password : admin123  ← GANTI SETELAH LOGIN PERTAMA!
-- Hash     : bcryptjs cost 10 (Node.js compatible)
-- =============================================

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
        role      = EXCLUDED.role,
        full_name = EXCLUDED.full_name,
        is_active = EXCLUDED.is_active;

-- Verification
DO $$
DECLARE
    v_user RECORD;
BEGIN
    SELECT id, username, role, is_active INTO v_user
    FROM users WHERE username = 'gem' LIMIT 1;

    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '       SUPER ADMIN SEEDED SUCCESSFULLY             ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  ID       : %', v_user.id;
    RAISE NOTICE '  Username : %', v_user.username;
    RAISE NOTICE '  Role     : %', v_user.role;
    RAISE NOTICE '  Active   : %', v_user.is_active;
    RAISE NOTICE '  Password : admin123';
    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE '  ⚠ GANTI PASSWORD SETELAH LOGIN PERTAMA!         ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
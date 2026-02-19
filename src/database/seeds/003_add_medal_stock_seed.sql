-- =============================================
-- Seed Update: medal stock quantity
-- Jalankan SETELAH 001_add_medal_stock.sql
-- DEVELOPMENT ONLY
-- =============================================
-- Set quantity medal = jumlah certificate in_stock
-- per branch, sebagai baseline awal
-- =============================================

BEGIN;

-- ─── UPDATE quantity medal sesuai stock certificate per branch ────────────

UPDATE branch_medal_stock bms
SET
    quantity   = sub.cert_count,
    updated_at = NOW()
FROM (
    SELECT
        current_branch_id AS branch_id,
        COUNT(*)          AS cert_count
    FROM certificates
    WHERE status = 'in_stock'
    GROUP BY current_branch_id
) sub
WHERE bms.branch_id = sub.branch_id;

-- Branch yang tidak punya certificate in_stock tetap 0


-- ─── LOG initial add untuk setiap branch yang punya stock ─────────────────

DO $$
DECLARE
    v_superadmin_id INTEGER;
    v_rec           RECORD;
BEGIN
    SELECT id INTO v_superadmin_id FROM users WHERE role = 'superAdmin' LIMIT 1;

    FOR v_rec IN
        SELECT bms.branch_id, bms.quantity
        FROM branch_medal_stock bms
        WHERE bms.quantity > 0
    LOOP
        INSERT INTO medal_stock_logs (branch_id, action_type, quantity, actor_id, notes)
        VALUES (
            v_rec.branch_id,
            'add',
            v_rec.quantity,
            v_superadmin_id,
            'Initial seed — set equal to in_stock certificates'
        );
    END LOOP;
END $$;


-- ─── VERIFICATION ─────────────────────────────────────────────────────────

DO $$
DECLARE
    v_rec RECORD;
BEGIN
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '         MEDAL STOCK SEED — VERIFICATION          ';
    RAISE NOTICE '═══════════════════════════════════════════════════';
    RAISE NOTICE '  Branch Medal Stock:';

    FOR v_rec IN
        SELECT b.code, b.name, b.is_head_branch, bms.quantity
        FROM branch_medal_stock bms
        JOIN branches b ON bms.branch_id = b.id
        ORDER BY b.is_head_branch DESC, b.code ASC
    LOOP
        RAISE NOTICE '    [%] % — qty: %',
            CASE WHEN v_rec.is_head_branch THEN 'HEAD' ELSE 'SUB ' END,
            v_rec.code,
            v_rec.quantity;
    END LOOP;

    RAISE NOTICE '───────────────────────────────────────────────────';
    RAISE NOTICE '  Medal Logs inserted: %', (SELECT COUNT(*) FROM medal_stock_logs);
    RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;

COMMIT;
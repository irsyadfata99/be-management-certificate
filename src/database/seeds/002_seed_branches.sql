-- =============================================
-- Seed: Example Branch Data
-- Created: 2026-02-11
-- =============================================

-- Head branches
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('SND', 'SUNDA',  true, NULL),
    ('BSD', 'BSD',    true, NULL),
    ('PIK', 'PIK',    true, NULL)
ON CONFLICT (code) DO NOTHING;

-- Sub branches under SND
INSERT INTO branches (code, name, is_head_branch, parent_id)
VALUES
    ('MKW', 'MEKARWANGI',           false, (SELECT id FROM branches WHERE code = 'SND')),
    ('KBP', 'KOTA BARU PARAHYANGAN', false, (SELECT id FROM branches WHERE code = 'SND'))
ON CONFLICT (code) DO NOTHING;
-- ============================================================================
-- Migration 014: Fix project name encoding (mojibake)
-- ============================================================================
-- The project name_ar column contains mojibake — UTF-8 bytes decoded as
-- Latin-1 during an earlier seed/import. This updates the project record
-- with the correct Arabic project name.
--
-- Correct name: الدراسات والتصاميم لتأهيل مراكز الإيواء بالمشاعر المقدسة
-- English name: Studies & Designs for Rehabilitation of Accommodation Centers in Holy Sites
-- ============================================================================

-- Fix the SDM project name (update ALL projects since there is only one active project)
UPDATE projects
SET name_ar  = 'الدراسات والتصاميم لتأهيل مراكز الإيواء بالمشاعر المقدسة',
    name     = 'Studies & Designs for Rehabilitation of Accommodation Centers in Holy Sites',
    updated_at = NOW()
WHERE code = 'SDM'
   OR id = (SELECT id FROM projects ORDER BY created_at ASC LIMIT 1);

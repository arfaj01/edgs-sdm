-- ============================================================================
-- 010_fix_deliverable_format_dates.sql
-- Populate NULL format and planned_date fields on deliverables table.
-- These fields were left NULL during initial seeding.
-- ============================================================================

-- ── Set default format based on discipline where NULL ───────────────────
-- Each discipline has a typical primary deliverable format.
UPDATE deliverables SET format = 'PDF'
WHERE format IS NULL AND discipline IN ('reports', 'general');

UPDATE deliverables SET format = 'DWG'
WHERE format IS NULL AND discipline IN ('architectural', 'structural', 'civil');

UPDATE deliverables SET format = 'DWG'
WHERE format IS NULL AND discipline IN ('mechanical', 'hvac', 'plumbing', 'electrical');

-- Catch-all for any remaining NULLs
UPDATE deliverables SET format = 'PDF'
WHERE format IS NULL;

-- ── Set planned_date for deliverables where NULL ────────────────────────
-- Use phase planned_end date as the deliverable planned_date if not set.
UPDATE deliverables d
SET planned_date = p.planned_end
FROM phases p
WHERE d.phase_id = p.id
  AND d.planned_date IS NULL;

-- If phases also don't have dates (fallback), set to project end_date
UPDATE deliverables d
SET planned_date = pr.end_date
FROM phases p
JOIN projects pr ON p.project_id = pr.id
WHERE d.phase_id = p.id
  AND d.planned_date IS NULL;

-- Last resort: set to 6 months from now for any remaining NULL dates
UPDATE deliverables
SET planned_date = CURRENT_DATE + INTERVAL '6 months'
WHERE planned_date IS NULL;

-- ── Set actual_date where a submittal has been approved ─────────────────
-- If a deliverable has an approved submittal, use the latest submitted_at as actual_date
UPDATE deliverables d
SET actual_date = sub.submitted_at::date
FROM (
  SELECT DISTINCT ON (deliverable_id)
    deliverable_id,
    submitted_at
  FROM submittals
  WHERE status = 'approved'
  ORDER BY deliverable_id, submitted_at DESC
) sub
WHERE d.id = sub.deliverable_id
  AND d.actual_date IS NULL;

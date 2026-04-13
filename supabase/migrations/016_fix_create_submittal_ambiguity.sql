-- ============================================================================
-- Migration 016: Fix create_submittal function ambiguity
-- ============================================================================
-- ROOT CAUSE: Migration 015 added a new create_submittal(text) overload but
-- failed to drop the original create_submittal(submittal_purpose) signature.
-- PostgreSQL cannot resolve the ambiguity when purpose is passed as text.
--
-- FIX: Drop ALL signatures of create_submittal and recreate a single clean
-- version that accepts TEXT and casts internally to submittal_purpose.
-- This preserves the smart numbering from migration 015.
-- ============================================================================

-- Drop every possible signature to ensure no ambiguity remains
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, submittal_purpose, TEXT);
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, submittal_purpose, TEXT, TEXT);

-- Recreate as a single clean function with TEXT inputs
CREATE OR REPLACE FUNCTION create_submittal(
  p_deliverable_id UUID,
  p_submitted_by   UUID,
  p_purpose        TEXT,
  p_notes          TEXT DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id               UUID;
  v_submittal_number  TEXT;
  v_version           INTEGER;
BEGIN
  -- Calculate version: count existing submittals for this deliverable + 1
  SELECT COALESCE(MAX(version), 0) + 1
  INTO v_version
  FROM submittals
  WHERE deliverable_id = p_deliverable_id;

  -- Generate structured submittal number (from migration 015)
  v_submittal_number := generate_submittal_number(p_deliverable_id, p_purpose);

  -- Insert the new submittal — explicit cast to submittal_purpose enum
  INSERT INTO submittals (
    deliverable_id,
    submittal_number,
    version,
    status,
    purpose,
    notes,
    submitted_by
  ) VALUES (
    p_deliverable_id,
    v_submittal_number,
    v_version,
    'draft',
    p_purpose::submittal_purpose,
    p_notes,
    p_submitted_by
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

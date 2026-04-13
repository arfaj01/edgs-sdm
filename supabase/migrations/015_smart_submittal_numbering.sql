-- ============================================================================
-- Migration 015: Smart Submittal Numbering Methodology
-- ============================================================================
-- Implements structured request numbering:
--   YYMMDD-P-DDD-PPP-NNN
--
--   YYMMDD  = creation date
--   P       = purpose code  (A=approval, I=information, F=follow_up, T=tendering)
--   DDD     = discipline code (ARC, STR, CIV, MEC, HVA, PLM, ELE, RPT, GEN)
--   PPP     = project code  (from projects.code, e.g. SDM)
--   NNN     = daily running sequence (001, 002, ...)
--
-- This replaces the old create_submittal function's numbering while keeping
-- its versioning logic intact. Existing historical submittal_numbers are
-- preserved — this only affects NEW submittals going forward.
-- ============================================================================

-- ── Helper: discipline → 3-letter code ─────────────────────────────────
CREATE OR REPLACE FUNCTION discipline_code(p_discipline TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE p_discipline
    WHEN 'architectural' THEN 'ARC'
    WHEN 'structural'    THEN 'STR'
    WHEN 'civil'         THEN 'CIV'
    WHEN 'mechanical'    THEN 'MEC'
    WHEN 'hvac'          THEN 'HVA'
    WHEN 'plumbing'      THEN 'PLM'
    WHEN 'electrical'    THEN 'ELE'
    WHEN 'reports'       THEN 'RPT'
    WHEN 'general'       THEN 'GEN'
    ELSE                      'GEN'
  END;
END;
$$;

-- ── Helper: purpose → 1-letter code ────────────────────────────────────
CREATE OR REPLACE FUNCTION purpose_code(p_purpose TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE p_purpose
    WHEN 'for_approval'    THEN 'A'
    WHEN 'for_information' THEN 'I'
    WHEN 'for_follow_up'   THEN 'F'
    WHEN 'for_tendering'   THEN 'T'
    ELSE                        'A'
  END;
END;
$$;

-- ── Sequence table for daily counters ──────────────────────────────────
-- One row per (date, project_code) gives us a reliable daily sequence.
CREATE TABLE IF NOT EXISTS submittal_daily_seq (
  seq_date     DATE    NOT NULL,
  project_code TEXT    NOT NULL DEFAULT 'SDM',
  last_seq     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (seq_date, project_code)
);

-- ── Generate the next structured submittal number ──────────────────────
CREATE OR REPLACE FUNCTION generate_submittal_number(
  p_deliverable_id UUID,
  p_purpose        TEXT
)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_discipline   TEXT;
  v_project_code TEXT;
  v_date_str     TEXT;
  v_today        DATE := CURRENT_DATE;
  v_seq          INTEGER;
BEGIN
  -- Look up discipline from the deliverable
  SELECT d.discipline INTO v_discipline
  FROM deliverables d
  WHERE d.id = p_deliverable_id;

  IF v_discipline IS NULL THEN
    v_discipline := 'general';
  END IF;

  -- Look up project code via deliverable → phase → project chain
  SELECT p.code INTO v_project_code
  FROM deliverables d
  JOIN phases ph ON ph.id = d.phase_id
  JOIN projects p ON p.id = ph.project_id
  WHERE d.id = p_deliverable_id;

  IF v_project_code IS NULL OR v_project_code = '' THEN
    v_project_code := 'SDM';
  END IF;

  -- Date segment: YYMMDD
  v_date_str := TO_CHAR(v_today, 'YYMMDD');

  -- Increment daily sequence (upsert)
  INSERT INTO submittal_daily_seq (seq_date, project_code, last_seq)
  VALUES (v_today, v_project_code, 1)
  ON CONFLICT (seq_date, project_code)
  DO UPDATE SET last_seq = submittal_daily_seq.last_seq + 1
  RETURNING last_seq INTO v_seq;

  -- Compose: YYMMDD-P-DDD-PPP-NNN
  RETURN v_date_str
    || '-' || purpose_code(p_purpose)
    || '-' || discipline_code(v_discipline)
    || '-' || v_project_code
    || '-' || LPAD(v_seq::TEXT, 3, '0');
END;
$$;

-- ── Replace create_submittal to use the new numbering ──────────────────
-- Drop all possible signatures first
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS create_submittal(UUID, UUID, TEXT, TEXT, TEXT);

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

  -- Generate structured submittal number
  v_submittal_number := generate_submittal_number(p_deliverable_id, p_purpose);

  -- Insert the new submittal
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

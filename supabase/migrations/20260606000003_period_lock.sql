-- ============================================================================
-- PHASE 11 — PERIOD LOCK RPCS (wraps existing accounting_periods system)
-- ----------------------------------------------------------------------------
-- The repo already has a working period-lock layer:
--   • table     accounting_periods (status: 'open' | 'soft_closed' | 'locked')
--   • function  is_period_locked(user, date)
--   • triggers  trg_period_lock_journals + trg_period_lock_* on AR/AP/inv/etc.
--
-- This migration adds thin RPCs the UI can call to:
--   1. lock a period (creates an accounting_periods row with status='locked')
--   2. unlock a period (flips status back to 'open' + records audit)
--   3. list locks for the user
--   4. report the latest lock-through date
-- ============================================================================

-- Extend the table with audit columns (unlock trail) — safe re-run.
ALTER TABLE accounting_periods
  ADD COLUMN IF NOT EXISTS unlocked_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unlocked_by    TEXT,
  ADD COLUMN IF NOT EXISTS unlock_reason  TEXT,
  ADD COLUMN IF NOT EXISTS fiscal_year    TEXT;

-- ── Latest lock-through (= max period_end of any locked range) ──────────────
CREATE OR REPLACE FUNCTION current_lock_through(p_user_id TEXT)
RETURNS DATE LANGUAGE sql STABLE AS $$
  SELECT MAX(period_end)
    FROM accounting_periods
   WHERE user_id = p_user_id AND status = 'locked';
$$;

-- ── Lock a period (creates an accounting_periods row) ───────────────────────
-- Convention: lock-through date is a single calendar date. We model it as a
-- period [previous_lock + 1 day .. p_lock_through] so it composes with the
-- existing trigger system without overlap.
CREATE OR REPLACE FUNCTION lock_financial_period(
  p_user_id      TEXT,
  p_lock_through DATE,
  p_fiscal_year  TEXT DEFAULT NULL,
  p_reason       TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_existing_max DATE;
  v_period_start DATE;
  v_id UUID;
BEGIN
  SELECT current_lock_through(p_user_id) INTO v_existing_max;
  IF v_existing_max IS NOT NULL AND p_lock_through <= v_existing_max THEN
    RAISE EXCEPTION 'Period is already locked through %; new lock must be a later date.', v_existing_max
      USING ERRCODE = '23514';
  END IF;
  v_period_start := COALESCE(v_existing_max + 1, '1900-01-01'::DATE);

  INSERT INTO accounting_periods (user_id, period_start, period_end, label, status, locked_at, locked_by, notes, fiscal_year)
  VALUES (p_user_id, v_period_start, p_lock_through, p_fiscal_year, 'locked', NOW(), p_user_id, p_reason, p_fiscal_year)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ── Unlock (flip status to 'open' + record audit) ──────────────────────────
CREATE OR REPLACE FUNCTION unlock_financial_period(
  p_user_id      TEXT,
  p_lock_id      UUID,
  p_reason       TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql AS $$
DECLARE
  v_owner TEXT;
BEGIN
  SELECT user_id INTO v_owner FROM accounting_periods WHERE id = p_lock_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Period lock % not found', p_lock_id;
  END IF;
  IF v_owner <> p_user_id THEN
    RAISE EXCEPTION 'Period lock % does not belong to user', p_lock_id USING ERRCODE = '42501';
  END IF;

  UPDATE accounting_periods
     SET status        = 'open',
         unlocked_at   = NOW(),
         unlocked_by   = p_user_id,
         unlock_reason = p_reason,
         updated_at    = NOW()
   WHERE id = p_lock_id;

  RETURN TRUE;
END;
$$;

-- ── List locks (active + history) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION list_financial_period_locks(p_user_id TEXT)
RETURNS TABLE (
  id            UUID,
  lock_through  DATE,
  fiscal_year   TEXT,
  reason        TEXT,
  locked_at     TIMESTAMPTZ,
  is_active     BOOLEAN,
  unlocked_at   TIMESTAMPTZ,
  unlock_reason TEXT
) LANGUAGE sql STABLE AS $$
  SELECT
    id,
    period_end AS lock_through,
    COALESCE(fiscal_year, label) AS fiscal_year,
    notes      AS reason,
    locked_at,
    (status = 'locked') AS is_active,
    unlocked_at,
    unlock_reason
  FROM accounting_periods
  WHERE user_id = p_user_id
    AND (status = 'locked' OR unlocked_at IS NOT NULL)
  ORDER BY period_end DESC, locked_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION current_lock_through(TEXT)                          TO authenticated, anon;
GRANT EXECUTE ON FUNCTION lock_financial_period(TEXT, DATE, TEXT, TEXT)       TO authenticated, anon;
GRANT EXECUTE ON FUNCTION unlock_financial_period(TEXT, UUID, TEXT)           TO authenticated, anon;
GRANT EXECUTE ON FUNCTION list_financial_period_locks(TEXT)                   TO authenticated, anon;

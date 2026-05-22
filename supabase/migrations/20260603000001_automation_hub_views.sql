-- ════════════════════════════════════════════════════════════════════════════
-- Smart Automation Hub — read-only detection views (Module 24, Phase 9)
--
-- Centralises detection logic for two cross-cutting alert types:
--
--   1. Idle assets       — active assets that have had no business activity
--                          in the last N days. "Business activity" excludes
--                          depreciation postings (those happen automatically
--                          regardless of whether the asset is in use).
--   2. Duplicate assets  — active assets sharing a (serial_number) or
--                          (name + category) tuple. Useful for spotting
--                          accidental double-capitalization.
--
-- All other alert types (maintenance due, AMC expiry, warranty/policy expiry,
-- EMI due, covenant breach) already have services / views in their respective
-- modules — the automation hub aggregates them at the service layer.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Idle assets view ───────────────────────────────────────────────────
-- last_active_on = the most recent non-depreciation lifecycle event date.
-- idle_days     = today - last_active_on (capped at days_since_capitalised
--                 for never-active assets).
DROP VIEW IF EXISTS v_idle_assets CASCADE;
CREATE OR REPLACE VIEW v_idle_assets AS
WITH last_activity AS (
  SELECT
    user_id,
    asset_id,
    MAX(transaction_date) FILTER (WHERE transaction_type NOT IN ('depreciation','adjustment')) AS last_active_on
  FROM asset_transactions
  GROUP BY user_id, asset_id
)
SELECT
  fa.user_id,
  fa.id                                                AS asset_id,
  fa.asset_code,
  fa.name,
  fa.category_name,
  fa.book_value,
  fa.location,
  fa.branch_id,
  fa.custodian,
  fa.status,
  fa.capitalised_on,
  la.last_active_on,
  COALESCE(la.last_active_on, fa.capitalised_on, fa.purchase_date) AS effective_last_active_on,
  GREATEST(
    0,
    (CURRENT_DATE - COALESCE(la.last_active_on, fa.capitalised_on, fa.purchase_date))::INT
  )                                                    AS idle_days
FROM   fixed_assets fa
LEFT JOIN last_activity la
  ON la.user_id = fa.user_id AND la.asset_id = fa.id
WHERE  fa.status IN ('active','impaired');

COMMENT ON VIEW v_idle_assets IS
  'Active assets with their last non-depreciation activity date. idle_days drives the automation hub idle alert.';

-- ── 2. Duplicate assets view ──────────────────────────────────────────────
-- Two heuristics: (a) same non-null serial_number on two+ active assets;
-- (b) same (name, category_id) on two+ active assets. Both reported with
-- the same shape so the UI can render them uniformly.
DROP VIEW IF EXISTS v_duplicate_assets CASCADE;
CREATE OR REPLACE VIEW v_duplicate_assets AS
WITH by_serial AS (
  SELECT
    fa.user_id,
    fa.id          AS asset_id,
    fa.asset_code,
    fa.name,
    fa.category_name,
    fa.book_value,
    'serial_number'::text  AS match_type,
    fa.serial_number       AS match_value,
    COUNT(*) OVER (PARTITION BY fa.user_id, fa.serial_number) AS sibling_count
  FROM   fixed_assets fa
  WHERE  fa.status IN ('active','impaired')
    AND  fa.serial_number IS NOT NULL
    AND  fa.serial_number <> ''
),
by_name_cat AS (
  SELECT
    fa.user_id,
    fa.id          AS asset_id,
    fa.asset_code,
    fa.name,
    fa.category_name,
    fa.book_value,
    'name_category'::text                                                     AS match_type,
    COALESCE(fa.name, '') || '|' || COALESCE(fa.category_id::text, 'none')    AS match_value,
    COUNT(*) OVER (PARTITION BY fa.user_id, fa.name, fa.category_id)          AS sibling_count
  FROM   fixed_assets fa
  WHERE  fa.status IN ('active','impaired')
    AND  fa.name IS NOT NULL
    AND  fa.name <> ''
)
SELECT * FROM by_serial   WHERE sibling_count > 1
UNION ALL
SELECT * FROM by_name_cat WHERE sibling_count > 1;

COMMENT ON VIEW v_duplicate_assets IS
  'Active assets that share a serial_number (strict match) or (name, category_id) tuple (loose match) with another asset.';

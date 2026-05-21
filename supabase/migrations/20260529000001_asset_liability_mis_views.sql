-- ════════════════════════════════════════════════════════════════════════════
-- Asset & Liability MIS Integration (Module 15) + Consolidated Intelligence (Module 20)
--
-- Read-only aggregation views over the existing fixed_assets, asset_maintenance_records,
-- asset_insurance_policies, asset_insurance_claims, liabilities, loan_emi_schedule,
-- lease_contracts, cwip_projects tables.
--
-- No new transactional tables — these views power MIS dashboards + CFO snapshot.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Module 15: per-branch asset rollup ─────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_by_branch AS
SELECT
  user_id,
  COALESCE(branch_id, '__unassigned__')         AS branch_id,
  COUNT(*)                                      AS asset_count,
  COUNT(*) FILTER (WHERE status = 'active')     AS active_count,
  COUNT(*) FILTER (WHERE status = 'disposed' OR status = 'written_off') AS disposed_count,
  COALESCE(SUM(total_capitalised_value), 0)     AS gross_value,
  COALESCE(SUM(accumulated_depreciation), 0)    AS accumulated_dep,
  COALESCE(SUM(book_value), 0)                  AS book_value
FROM fixed_assets
WHERE status IN ('active','transferred')
GROUP BY user_id, branch_id;


-- ── per-department asset rollup ────────────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_by_department AS
SELECT
  user_id,
  COALESCE(department, '__unassigned__')        AS department,
  COUNT(*)                                      AS asset_count,
  COALESCE(SUM(total_capitalised_value), 0)     AS gross_value,
  COALESCE(SUM(accumulated_depreciation), 0)    AS accumulated_dep,
  COALESCE(SUM(book_value), 0)                  AS book_value
FROM fixed_assets
WHERE status IN ('active','transferred')
GROUP BY user_id, department;


-- ── per-cost-center asset rollup ───────────────────────────────────────────
CREATE OR REPLACE VIEW v_asset_by_cost_center AS
SELECT
  fa.user_id,
  COALESCE(fa.cost_center_id::text, '__unassigned__') AS cost_center_id,
  cc.code                                              AS cost_center_code,
  cc.name                                              AS cost_center_name,
  COUNT(*)                                             AS asset_count,
  COALESCE(SUM(fa.total_capitalised_value), 0)         AS gross_value,
  COALESCE(SUM(fa.accumulated_depreciation), 0)        AS accumulated_dep,
  COALESCE(SUM(fa.book_value), 0)                      AS book_value
FROM fixed_assets fa
LEFT JOIN cost_centers cc ON cc.id = fa.cost_center_id AND cc.user_id = fa.user_id
WHERE fa.status IN ('active','transferred')
GROUP BY fa.user_id, fa.cost_center_id, cc.code, cc.name;


-- ── liability rollup by lender ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_liability_by_lender AS
SELECT
  user_id,
  COALESCE(lender_name, '__unassigned__')          AS lender_name,
  COUNT(*)                                         AS liability_count,
  COALESCE(SUM(principal_amount), 0)               AS principal_total,
  COALESCE(SUM(outstanding_principal), 0)          AS outstanding_total,
  COALESCE(SUM(total_interest_accrued), 0)         AS interest_accrued_total,
  COALESCE(SUM(total_interest_paid), 0)            AS interest_paid_total
FROM liabilities
WHERE status IN ('active','restructured')
GROUP BY user_id, lender_name;


-- ── liability rollup by department ─────────────────────────────────────────
-- liabilities don't currently have a department column; we approximate via
-- the cost_center → cost_centers table (if linked). For pure liabilities
-- without that link the value falls into '__unassigned__'.
CREATE OR REPLACE VIEW v_liability_by_department AS
SELECT
  l.user_id,
  COALESCE(cc.name, '__unassigned__')               AS department_or_cc,
  COUNT(*)                                          AS liability_count,
  COALESCE(SUM(l.outstanding_principal), 0)         AS outstanding_total,
  COALESCE(SUM(
    CASE WHEN l.is_secured THEN l.outstanding_principal ELSE 0 END
  ), 0)                                             AS secured_total,
  COALESCE(SUM(
    CASE WHEN l.is_statutory THEN l.outstanding_principal ELSE 0 END
  ), 0)                                             AS statutory_total
FROM liabilities l
LEFT JOIN cost_centers cc ON cc.user_id = l.user_id
  AND cc.id::text = COALESCE(
    (SELECT cost_center_id::text FROM fixed_assets WHERE user_id = l.user_id LIMIT 0),
    NULL::text
  )
WHERE l.status IN ('active','restructured')
GROUP BY l.user_id, cc.name;


-- ── Asset ROI: cost-of-ownership view ──────────────────────────────────────
-- Tracks lifetime spend per asset across maintenance + insurance premium.
-- ROI ratio = total spend / book_value (lower = better cost-efficiency).
CREATE OR REPLACE VIEW v_asset_roi AS
WITH maint AS (
  SELECT
    user_id, asset_id,
    COALESCE(SUM(
      CASE WHEN status = 'completed'
           THEN cost + CASE WHEN itc_eligible THEN 0 ELSE gst_amount END
           ELSE 0 END
    ), 0)                                         AS maintenance_spend,
    COUNT(*) FILTER (WHERE status = 'completed') AS maintenance_events
  FROM asset_maintenance_records
  GROUP BY user_id, asset_id
),
ins AS (
  SELECT
    user_id, asset_id,
    COALESCE(SUM(premium_amount + gst_amount), 0) AS insurance_spend
  FROM asset_insurance_policies
  WHERE status IN ('active','renewed','lapsed')
  GROUP BY user_id, asset_id
),
claims AS (
  SELECT
    user_id, asset_id,
    COALESCE(SUM(settled_amount), 0) AS claims_recovered
  FROM asset_insurance_claims
  WHERE settled_amount IS NOT NULL
  GROUP BY user_id, asset_id
)
SELECT
  fa.user_id,
  fa.id                              AS asset_id,
  fa.asset_code,
  fa.name                            AS asset_name,
  fa.category_name,
  fa.total_capitalised_value         AS capitalised_value,
  fa.book_value,
  fa.accumulated_depreciation        AS depreciation_to_date,
  COALESCE(m.maintenance_spend, 0)   AS maintenance_spend,
  COALESCE(m.maintenance_events, 0)  AS maintenance_events,
  COALESCE(i.insurance_spend, 0)     AS insurance_spend,
  COALESCE(c.claims_recovered, 0)    AS claims_recovered,
  -- total cost of ownership = capital + dep + maintenance + insurance − claims
  (COALESCE(m.maintenance_spend, 0) + COALESCE(i.insurance_spend, 0) - COALESCE(c.claims_recovered, 0))
                                     AS net_running_cost,
  CASE
    WHEN fa.book_value > 0
    THEN ROUND(
      (COALESCE(m.maintenance_spend, 0) + COALESCE(i.insurance_spend, 0)) / fa.book_value::numeric,
      4
    )
    ELSE NULL
  END                                AS cost_to_book_ratio,
  fa.status                          AS asset_status,
  fa.branch_id,
  fa.department,
  fa.cost_center_id
FROM fixed_assets fa
LEFT JOIN maint  m ON m.user_id = fa.user_id AND m.asset_id = fa.id
LEFT JOIN ins    i ON i.user_id = fa.user_id AND i.asset_id = fa.id
LEFT JOIN claims c ON c.user_id = fa.user_id AND c.asset_id = fa.id;


-- ── Module 20: comprehensive financial snapshot view ───────────────────────
-- One row per user_id summarising every module's contribution to the
-- balance sheet / risk profile.
CREATE OR REPLACE VIEW v_cfo_snapshot AS
WITH fa AS (
  SELECT user_id,
    COUNT(*)                                                      AS active_assets,
    COALESCE(SUM(book_value), 0)                                  AS fixed_assets_value,
    COALESCE(SUM(accumulated_depreciation), 0)                    AS lifetime_depreciation
  FROM fixed_assets
  WHERE status IN ('active','transferred')
  GROUP BY user_id
),
cwip AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status IN ('planning','in_progress','on_hold')) AS active_cwip_count,
    COALESCE(SUM(total_accumulated_cost) FILTER (WHERE status IN ('planning','in_progress','on_hold')), 0) AS cwip_balance
  FROM cwip_projects
  GROUP BY user_id
),
lease AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status = 'active')                    AS active_lease_count,
    COALESCE(SUM(outstanding_liability) FILTER (WHERE lease_type = 'finance' AND status = 'active'), 0) AS lease_liability,
    COALESCE(SUM(rou_asset_value) FILTER (WHERE lease_type = 'finance' AND status = 'active'), 0)        AS rou_asset_value
  FROM lease_contracts
  GROUP BY user_id
),
liab AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status = 'active')                    AS active_loan_count,
    COALESCE(SUM(outstanding_principal), 0)                      AS loan_outstanding,
    COALESCE(SUM(total_interest_accrued - total_interest_paid), 0) AS interest_payable
  FROM liabilities
  WHERE status IN ('active','restructured')
  GROUP BY user_id
),
covenants AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE is_active)                            AS active_covenants,
    COUNT(*) FILTER (WHERE is_active AND next_check_due IS NOT NULL AND next_check_due < CURRENT_DATE) AS overdue_covenants
  FROM liability_covenants
  GROUP BY user_id
),
breached AS (
  SELECT c.user_id,
    COUNT(DISTINCT c.id) AS breached_covenants
  FROM liability_covenants c
  WHERE c.is_active
    AND EXISTS (
      SELECT 1 FROM liability_covenant_checks chk
      WHERE chk.covenant_id = c.id
        AND chk.status = 'breached'
        AND NOT EXISTS (
          SELECT 1 FROM liability_covenant_checks chk2
          WHERE chk2.covenant_id = c.id
            AND chk2.check_date > chk.check_date
        )
    )
  GROUP BY c.user_id
),
upcoming_emis AS (
  SELECT user_id,
    COUNT(*) FILTER (WHERE status IN ('planned','overdue','partial') AND due_date <= CURRENT_DATE + INTERVAL '30 days') AS emis_due_30d,
    COALESCE(SUM(total_emi) FILTER (WHERE status IN ('planned','overdue','partial') AND due_date <= CURRENT_DATE + INTERVAL '30 days'), 0) AS emi_outflow_30d
  FROM loan_emi_schedule
  GROUP BY user_id
),
maint_30d AS (
  SELECT user_id,
    COALESCE(SUM(cost + CASE WHEN itc_eligible THEN 0 ELSE gst_amount END) FILTER (
      WHERE status = 'completed' AND performed_on >= CURRENT_DATE - INTERVAL '30 days'
    ), 0) AS maintenance_spend_30d
  FROM asset_maintenance_records
  GROUP BY user_id
)
SELECT
  COALESCE(fa.user_id, lease.user_id, liab.user_id, cwip.user_id, covenants.user_id, breached.user_id, upcoming_emis.user_id, maint_30d.user_id) AS user_id,
  COALESCE(fa.active_assets, 0)            AS active_assets,
  COALESCE(fa.fixed_assets_value, 0)       AS fixed_assets_value,
  COALESCE(fa.lifetime_depreciation, 0)    AS lifetime_depreciation,
  COALESCE(cwip.active_cwip_count, 0)      AS active_cwip_count,
  COALESCE(cwip.cwip_balance, 0)           AS cwip_balance,
  COALESCE(lease.active_lease_count, 0)    AS active_lease_count,
  COALESCE(lease.lease_liability, 0)       AS lease_liability,
  COALESCE(lease.rou_asset_value, 0)       AS rou_asset_value,
  COALESCE(liab.active_loan_count, 0)      AS active_loan_count,
  COALESCE(liab.loan_outstanding, 0)       AS loan_outstanding,
  COALESCE(liab.interest_payable, 0)       AS interest_payable,
  COALESCE(covenants.active_covenants, 0)  AS active_covenants,
  COALESCE(covenants.overdue_covenants, 0) AS overdue_covenants,
  COALESCE(breached.breached_covenants, 0) AS breached_covenants,
  COALESCE(upcoming_emis.emis_due_30d, 0)  AS emis_due_30d,
  COALESCE(upcoming_emis.emi_outflow_30d, 0) AS emi_outflow_30d,
  COALESCE(maint_30d.maintenance_spend_30d, 0) AS maintenance_spend_30d
FROM fa
FULL OUTER JOIN cwip       ON cwip.user_id       = fa.user_id
FULL OUTER JOIN lease      ON lease.user_id      = COALESCE(fa.user_id, cwip.user_id)
FULL OUTER JOIN liab       ON liab.user_id       = COALESCE(fa.user_id, cwip.user_id, lease.user_id)
FULL OUTER JOIN covenants  ON covenants.user_id  = COALESCE(fa.user_id, cwip.user_id, lease.user_id, liab.user_id)
FULL OUTER JOIN breached   ON breached.user_id   = COALESCE(fa.user_id, cwip.user_id, lease.user_id, liab.user_id, covenants.user_id)
FULL OUTER JOIN upcoming_emis ON upcoming_emis.user_id = COALESCE(fa.user_id, cwip.user_id, lease.user_id, liab.user_id, covenants.user_id, breached.user_id)
FULL OUTER JOIN maint_30d  ON maint_30d.user_id  = COALESCE(fa.user_id, cwip.user_id, lease.user_id, liab.user_id, covenants.user_id, breached.user_id, upcoming_emis.user_id);

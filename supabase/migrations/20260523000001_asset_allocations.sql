-- ════════════════════════════════════════════════════════════════════════════
-- Employee Asset Allocation (Module 4)
--
-- Tracks who has been issued which asset (laptops, phones, office equipment).
-- One allocation row = one issuance to an employee / team / department, with
-- condition snapshots at issue + return and optional damage value.
--
-- When status flips to 'active': service stamps fixed_assets.custodian
-- When status flips to 'returned': service clears custodian (or sets to
-- next active allocation if one exists)
--
-- No new journal source_types needed — damage write-downs (if posted) reuse
-- the existing asset_write_off / asset_impairment types.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_allocations (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  -- Who it was allocated to
  allocated_to_type      TEXT NOT NULL DEFAULT 'employee' CHECK (allocated_to_type IN (
                           'employee','team','department'
                         )),
  employee_id            TEXT,            -- Clerk user id or external HRIS id
  employee_name          TEXT NOT NULL,   -- denormalised for easy listing
  employee_email         TEXT,
  employee_phone         TEXT,
  team_name              TEXT,
  department             TEXT,
  designation            TEXT,

  -- Timeline
  issued_on              DATE NOT NULL,
  expected_return_on     DATE,
  returned_on            DATE,

  -- Condition snapshots
  condition_on_issue     TEXT NOT NULL DEFAULT 'good' CHECK (condition_on_issue IN (
                           'new','good','fair','damaged'
                         )),
  condition_on_return    TEXT CHECK (condition_on_return IS NULL OR condition_on_return IN (
                           'new','good','fair','damaged','lost'
                         )),
  damage_notes           TEXT,
  damage_value           NUMERIC(18,2),

  -- Workflow
  status                 TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
                           'active','returned','lost','damaged','overdue'
                         )),
  acknowledgement_url    TEXT,            -- signed handover document
  return_document_url    TEXT,

  -- Tagging
  cost_center_id         UUID,
  branch_id              TEXT,

  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT,

  CONSTRAINT chk_alloc_dates CHECK (returned_on IS NULL OR returned_on >= issued_on),
  CONSTRAINT chk_alloc_who   CHECK (allocated_to_type <> 'employee' OR employee_name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_alloc_user      ON asset_allocations(user_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS idx_alloc_asset     ON asset_allocations(asset_id, issued_on DESC);
CREATE INDEX IF NOT EXISTS idx_alloc_status    ON asset_allocations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_alloc_employee  ON asset_allocations(user_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_alloc_overdue   ON asset_allocations(user_id, expected_return_on) WHERE status = 'active';

ALTER TABLE asset_allocations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS alloc_rls ON asset_allocations;
CREATE POLICY alloc_rls ON asset_allocations
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at trigger
CREATE OR REPLACE FUNCTION touch_asset_allocation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alloc_touch ON asset_allocations;
CREATE TRIGGER trg_alloc_touch
  BEFORE UPDATE ON asset_allocations
  FOR EACH ROW EXECUTE FUNCTION touch_asset_allocation_updated_at();


-- Per-employee rollup view (used by the allocations dashboard)
CREATE OR REPLACE VIEW v_employee_allocation_summary AS
SELECT
  user_id,
  COALESCE(employee_id, employee_name)                      AS employee_key,
  employee_name,
  employee_email,
  department,
  COUNT(*) FILTER (WHERE status = 'active')                 AS active_allocations,
  COUNT(*)                                                  AS lifetime_allocations,
  COUNT(*) FILTER (WHERE status = 'active'
                   AND expected_return_on IS NOT NULL
                   AND expected_return_on < CURRENT_DATE)   AS overdue_allocations,
  COALESCE(SUM(damage_value) FILTER (WHERE status IN ('damaged','lost')), 0)
                                                            AS lifetime_damage_value
FROM asset_allocations
GROUP BY user_id, COALESCE(employee_id, employee_name), employee_name, employee_email, department;


-- Per-asset rollup view (used by the asset detail tab)
CREATE OR REPLACE VIEW v_asset_allocation_summary AS
SELECT
  user_id,
  asset_id,
  COUNT(*) FILTER (WHERE status = 'active')                 AS active_allocations,
  COUNT(*)                                                  AS lifetime_allocations,
  COUNT(*) FILTER (WHERE condition_on_return IN ('damaged','lost')) AS damage_events,
  COALESCE(SUM(damage_value), 0)                            AS lifetime_damage_value
FROM asset_allocations
GROUP BY user_id, asset_id;

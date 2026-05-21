-- ════════════════════════════════════════════════════════════════════════════
-- Asset Verification & Audit (Module 5)
--
-- A "session" is one physical-verification campaign (e.g. quarterly audit,
-- annual stocktake, branch audit). Findings are recorded per asset within
-- a session. When all in-scope assets have findings recorded, the session
-- can be closed — generating a mismatch report.
--
-- Naming note: there's already an asset_audit_LOG table (the per-action
-- change journal). The new tables use the asset_AUDIT_session prefix to
-- avoid collision.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS asset_audit_sessions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,

  session_code           TEXT NOT NULL,                    -- e.g. AUD/2026/Q2
  title                  TEXT NOT NULL,
  description            TEXT,

  -- Scope filters (NULL = include everything)
  scope_branch_id        TEXT,
  scope_department       TEXT,
  scope_cost_center_id   UUID,

  -- Timeline
  scheduled_on           DATE NOT NULL,
  started_on             DATE,
  closed_on              DATE,
  next_audit_due         DATE,                              -- next reminder window

  -- Workflow
  status                 TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                           'scheduled','in_progress','closed','cancelled'
                         )),
  auditor_name           TEXT,
  auditor_contact        TEXT,

  -- Rollup counters (kept in sync by the service layer)
  assets_in_scope        INTEGER NOT NULL DEFAULT 0,
  assets_verified        INTEGER NOT NULL DEFAULT 0,
  assets_missing         INTEGER NOT NULL DEFAULT 0,
  assets_mismatched      INTEGER NOT NULL DEFAULT 0,

  notes                  TEXT,
  document_url           TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by             TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_sess_user   ON asset_audit_sessions(user_id, scheduled_on DESC);
CREATE INDEX IF NOT EXISTS idx_audit_sess_status ON asset_audit_sessions(user_id, status);

ALTER TABLE asset_audit_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_sess_rls ON asset_audit_sessions;
CREATE POLICY audit_sess_rls ON asset_audit_sessions
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ════════════════════════════════════════════════════════════════════════════
-- Per-asset findings inside a session
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS asset_audit_findings (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                TEXT NOT NULL,
  session_id             UUID NOT NULL REFERENCES asset_audit_sessions(id) ON DELETE CASCADE,
  asset_id               UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,

  -- Verification result
  status                 TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                           'pending','verified','missing','mismatch','damaged','disposed_offsite'
                         )),
  verified_on            DATE,
  verified_by            TEXT,
  verification_method    TEXT,         -- 'physical' / 'qr_scan' / 'photo' / 'remote'

  -- Snapshot of what the asset register said vs. what was found on the ground
  expected_location      TEXT,
  expected_branch_id     TEXT,
  expected_custodian     TEXT,
  found_location         TEXT,
  found_branch_id        TEXT,
  found_custodian        TEXT,
  condition_observed     TEXT CHECK (condition_observed IS NULL OR condition_observed IN (
                           'new','good','fair','poor','damaged','non_functional'
                         )),

  -- Free-form details + photo
  remarks                TEXT,
  photo_url              TEXT,

  -- Resolution after findings
  resolution_action      TEXT,         -- e.g. 'transfer_created', 'written_off', 'no_action'
  resolution_ref_id      UUID,         -- FK to a transfer / write-off (kept soft)

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_audit_finding UNIQUE (session_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_audit_find_session ON asset_audit_findings(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_find_asset   ON asset_audit_findings(asset_id);
CREATE INDEX IF NOT EXISTS idx_audit_find_status  ON asset_audit_findings(user_id, status);

ALTER TABLE asset_audit_findings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_find_rls ON asset_audit_findings;
CREATE POLICY audit_find_rls ON asset_audit_findings
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- updated_at triggers
CREATE OR REPLACE FUNCTION touch_asset_audit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_sess_touch ON asset_audit_sessions;
CREATE TRIGGER trg_audit_sess_touch
  BEFORE UPDATE ON asset_audit_sessions
  FOR EACH ROW EXECUTE FUNCTION touch_asset_audit_updated_at();

DROP TRIGGER IF EXISTS trg_audit_find_touch ON asset_audit_findings;
CREATE TRIGGER trg_audit_find_touch
  BEFORE UPDATE ON asset_audit_findings
  FOR EACH ROW EXECUTE FUNCTION touch_asset_audit_updated_at();


-- Convenience view used by the audit dashboard
CREATE OR REPLACE VIEW v_asset_audit_findings_enriched AS
SELECT
  f.*,
  fa.asset_code,
  fa.name           AS asset_name,
  fa.category_name,
  fa.book_value
FROM asset_audit_findings f
JOIN fixed_assets fa ON fa.id = f.asset_id AND fa.user_id = f.user_id;

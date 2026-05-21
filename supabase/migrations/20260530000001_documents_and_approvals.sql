-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8: Document Vault (M17) + Approval Workflows (M18)
--
-- M16 (AI Insights) is purely computed from existing tables — no schema.
-- M19 (QR System) uses the existing fixed_assets.asset_code — no schema.
-- ════════════════════════════════════════════════════════════════════════════

-- ── M17: Polymorphic document vault ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_vault (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,

  -- Polymorphic linkage to any other table. entity_type is freeform so new
  -- module types don't require ALTER TABLE; valid values include:
  --   fixed_asset, liability, lease_contract, cwip_project, maintenance_record,
  --   insurance_policy, insurance_claim, warranty, transfer, allocation,
  --   audit_session, covenant, disposal_request, revaluation, generic
  entity_type         TEXT NOT NULL,
  entity_id           UUID,            -- nullable for org-wide docs

  -- Document metadata
  document_name       TEXT NOT NULL,
  document_type       TEXT NOT NULL CHECK (document_type IN (
                        'invoice','bill','warranty','insurance_policy','agreement',
                        'loan_document','tax_filing','receipt','photograph',
                        'inspection_report','certificate','contract','other'
                      )),
  storage_url         TEXT NOT NULL,   -- external URL or supabase storage path
  mime_type           TEXT,
  size_bytes          BIGINT,

  -- Searchability
  title               TEXT,
  description         TEXT,
  tags                TEXT[],
  doc_date            DATE,            -- when the document was originally issued
  expiry_date         DATE,            -- for time-bounded docs (insurance, warranty)

  uploaded_by         TEXT,
  uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived            BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_docvault_user        ON document_vault(user_id, uploaded_at DESC) WHERE NOT archived;
CREATE INDEX IF NOT EXISTS idx_docvault_entity      ON document_vault(user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_docvault_type        ON document_vault(user_id, document_type);
CREATE INDEX IF NOT EXISTS idx_docvault_expiry      ON document_vault(user_id, expiry_date) WHERE expiry_date IS NOT NULL AND NOT archived;
CREATE INDEX IF NOT EXISTS idx_docvault_tags        ON document_vault USING GIN (tags);

ALTER TABLE document_vault ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS docvault_rls ON document_vault;
CREATE POLICY docvault_rls ON document_vault
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


-- ── M18: Generalised approval workflow ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS asset_approval_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 TEXT NOT NULL,

  -- What's being approved
  request_type            TEXT NOT NULL CHECK (request_type IN (
                            'asset_purchase','asset_disposal','asset_write_off',
                            'asset_transfer','asset_revaluation','asset_impairment',
                            'liability_restructuring','loan_closure','loan_disbursement',
                            'lease_termination','cwip_capitalization','expense',
                            'journal_adjustment','generic'
                          )),
  entity_type             TEXT,           -- e.g. 'fixed_asset', 'liability'
  entity_id               UUID,           -- the affected entity (optional for new-entity requests)

  title                   TEXT NOT NULL,
  description             TEXT,
  amount                  NUMERIC(18,2),  -- the financial amount under approval
  /** Action payload — what the approver is sanctioning. Kept as JSONB so
      individual modules can store typed input shapes without schema changes. */
  payload                 JSONB,

  -- Workflow
  status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                            'pending','approved','rejected','executed','cancelled','expired'
                          )),
  requested_by            TEXT NOT NULL,
  requested_on            DATE NOT NULL,
  expires_on              DATE,           -- auto-expire if not actioned

  approver                TEXT,
  approved_on             DATE,
  approval_comment        TEXT,
  rejection_reason        TEXT,

  -- After approval / execution
  executed_on             DATE,
  execution_ref_id        UUID,           -- e.g. journal_id or new entity_id created on execution

  priority                TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  notes                   TEXT,
  document_url            TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_appr_user      ON asset_approval_requests(user_id, requested_on DESC);
CREATE INDEX IF NOT EXISTS idx_appr_status    ON asset_approval_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_type      ON asset_approval_requests(user_id, request_type, status);
CREATE INDEX IF NOT EXISTS idx_appr_entity    ON asset_approval_requests(user_id, entity_type, entity_id);

ALTER TABLE asset_approval_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appr_rls ON asset_approval_requests;
CREATE POLICY appr_rls ON asset_approval_requests
  FOR ALL USING (auth.uid()::text = user_id) WITH CHECK (auth.uid()::text = user_id);


CREATE OR REPLACE FUNCTION touch_phase8_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_appr_touch ON asset_approval_requests;
CREATE TRIGGER trg_appr_touch BEFORE UPDATE ON asset_approval_requests
  FOR EACH ROW EXECUTE FUNCTION touch_phase8_updated_at();


-- ── Document expiry alert view ─────────────────────────────────────────────
CREATE OR REPLACE VIEW v_documents_expiring AS
SELECT
  d.*,
  GREATEST(0, (d.expiry_date - CURRENT_DATE)) AS days_until_expiry,
  (d.expiry_date < CURRENT_DATE)              AS is_expired
FROM document_vault d
WHERE d.expiry_date IS NOT NULL
  AND NOT d.archived
  AND d.expiry_date <= (CURRENT_DATE + INTERVAL '60 days');

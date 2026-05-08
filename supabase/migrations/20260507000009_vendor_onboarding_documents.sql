-- ════════════════════════════════════════════════════════════════════════════
-- Vendor Onboarding & Document Vault
--
-- Captures the document set & declarations required to onboard a new vendor:
--   • GST Certificate
--   • MSME / Udyam Certificate
--   • Cancelled Company Cheque
--   • PAN Card
--   • Company Incorporation Documents (Pvt Ltd / LLP / CIN)
--   • Last 3 Years IT Returns
--   • Declaration Form for 206CCA / 206AB (Higher TDS Compliance)
--   • Declaration for Non-Applicability of E-Invoice
--   • IT Declaration Form
--
-- Plus extra vendor master fields:
--   • vendor_code            — internal code used in PO/AP modules
--   • annual_turnover        — current FY turnover (drives e-invoice / TDS rules)
--   • incorporation_type     — pvt_ltd / llp / proprietorship / partnership / opc / other
--   • cin_number             — Corporate Identification Number for Pvt Ltd / LLP
--   • einvoice_applicable    — derived from turnover, but stored for audit
--   • onboarding_status      — draft / submitted / verified / rejected
--   • onboarding_completed_at
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS vendor_code                         TEXT,
  ADD COLUMN IF NOT EXISTS annual_turnover                     NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS turnover_fy                         TEXT,
  ADD COLUMN IF NOT EXISTS incorporation_type                  TEXT,
  ADD COLUMN IF NOT EXISTS cin_number                          TEXT,
  ADD COLUMN IF NOT EXISTS einvoice_applicable                 BOOLEAN,
  ADD COLUMN IF NOT EXISTS einvoice_non_applicable_declared    BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS declaration_206cca_206ab            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS it_declaration_received             BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS itr_filed_years                     JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_status                   TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS onboarding_completed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_notes                    TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='vendors' AND constraint_name='vendors_onboarding_status_chk'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_onboarding_status_chk
      CHECK (onboarding_status IN ('draft','submitted','verified','rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='vendors' AND constraint_name='vendors_incorporation_type_chk'
  ) THEN
    ALTER TABLE vendors
      ADD CONSTRAINT vendors_incorporation_type_chk
      CHECK (
        incorporation_type IS NULL
        OR incorporation_type IN ('proprietorship','partnership','llp','pvt_ltd','public_ltd','opc','huf','trust','society','other')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname='public' AND indexname='vendors_user_vendor_code_uniq'
  ) THEN
    CREATE UNIQUE INDEX vendors_user_vendor_code_uniq
      ON vendors(user_id, vendor_code)
      WHERE vendor_code IS NOT NULL AND vendor_code <> '';
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- vendor_documents — one row per uploaded document
--
-- Files are stored as base64 data URLs in `file_data_url` so this works in
-- environments without a Supabase Storage bucket. When a storage bucket is
-- provisioned later, `file_path` can be populated and `file_data_url` left
-- null for new uploads.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS vendor_documents (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         TEXT NOT NULL,
  vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL,
  document_label  TEXT,
  file_name       TEXT,
  file_mime_type  TEXT,
  file_size       INTEGER,
  file_data_url   TEXT,
  file_path       TEXT,
  meta            JSONB DEFAULT '{}'::jsonb,
  status          TEXT DEFAULT 'pending',
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  verified_at     TIMESTAMPTZ,
  verified_by     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='vendor_documents' AND constraint_name='vendor_documents_status_chk'
  ) THEN
    ALTER TABLE vendor_documents
      ADD CONSTRAINT vendor_documents_status_chk
      CHECK (status IN ('pending','verified','rejected'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name='vendor_documents' AND constraint_name='vendor_documents_type_chk'
  ) THEN
    ALTER TABLE vendor_documents
      ADD CONSTRAINT vendor_documents_type_chk
      CHECK (document_type IN (
        'gst_certificate',
        'msme_certificate',
        'cancelled_cheque',
        'pan_card',
        'incorporation_doc',
        'itr_year_1',
        'itr_year_2',
        'itr_year_3',
        'declaration_206cca_206ab',
        'declaration_einvoice',
        'it_declaration',
        'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vendor_documents_vendor_idx ON vendor_documents(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_documents_user_idx   ON vendor_documents(user_id);
CREATE INDEX IF NOT EXISTS vendor_documents_type_idx   ON vendor_documents(document_type);

ALTER TABLE vendor_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='vendor_documents'
      AND policyname='vendor_documents_owner_all'
  ) THEN
    CREATE POLICY vendor_documents_owner_all ON vendor_documents
      FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
      WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

-- updated_at trigger reuses the shared function declared in earlier migrations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_vendor_documents_updated_at'
  ) THEN
    CREATE TRIGGER update_vendor_documents_updated_at
      BEFORE UPDATE ON vendor_documents
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- expense_inventory_links — connects an OCR-imported expense / bill to the
-- inventory item(s) it created or topped up. Used by the "Smart Expense &
-- Inventory Automation" flow so we can show a purchase audit trail per item
-- and undo a bad auto-classification.
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS expense_inventory_links (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           TEXT NOT NULL,
  expense_id        UUID,
  bill_id           UUID,
  vendor_id         UUID,
  inventory_item_id UUID NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  movement_id       UUID,
  source            TEXT NOT NULL DEFAULT 'expense_ocr',
  quantity          NUMERIC(18,4) NOT NULL DEFAULT 0,
  unit_cost         NUMERIC(18,4) NOT NULL DEFAULT 0,
  total_value       NUMERIC(18,2) NOT NULL DEFAULT 0,
  raw_description   TEXT,
  hsn_sac           TEXT,
  was_new_item      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expense_inventory_links_user_idx       ON expense_inventory_links(user_id);
CREATE INDEX IF NOT EXISTS expense_inventory_links_expense_idx    ON expense_inventory_links(expense_id);
CREATE INDEX IF NOT EXISTS expense_inventory_links_bill_idx       ON expense_inventory_links(bill_id);
CREATE INDEX IF NOT EXISTS expense_inventory_links_inventory_idx  ON expense_inventory_links(inventory_item_id);

ALTER TABLE expense_inventory_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='expense_inventory_links'
      AND policyname='expense_inventory_links_owner_all'
  ) THEN
    CREATE POLICY expense_inventory_links_owner_all ON expense_inventory_links
      FOR ALL
      USING (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text))
      WITH CHECK (user_id = ((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text));
  END IF;
END $$;

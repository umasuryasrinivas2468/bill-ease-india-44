-- ════════════════════════════════════════════════════════════════════════════
-- Vendor & Client Sub-Ledgers — deep ledger mapping (Tally-style).
--
-- Goal: every vendor/client gets a primary_ledger_account_id (the control
-- group it lives under — Sundry Creditors, Trade Payables, etc.) AND a real
-- subledger_account_id (a leaf account row under that group, bearing the
-- vendor's/client's own name). Auto-posting routes to the sub-ledger so
-- the trial balance shows every vendor on its own line while still rolling
-- up to the control group.
--
-- Builds on:
--   • accounts (hierarchy, is_group, parent_account_id)
--   • enforce_leaf_account_only — group accounts can't be posted to
--   • account_mapping — engine fallback when no vendor_id/customer_id
--
-- Re-runnable. Backfills existing vendors/clients.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Control group accounts ──────────────────────────────────────────────
-- Sundry Creditors (Liability group under Current Liabilities) — parent for
-- every vendor's sub-ledger row.
-- Sundry Debtors (Asset group under Current Assets) — parent for every
-- client's sub-ledger row.
-- These are GROUPS (is_group=TRUE) so postings cannot hit them directly;
-- they only roll up balances of their vendor/client children.
CREATE OR REPLACE FUNCTION ensure_subledger_control_accounts(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_curr_assets UUID;
  v_curr_liab   UUID;
BEGIN
  -- Make sure the group skeleton exists first.
  PERFORM seed_default_account_tree(p_user_id);

  SELECT id INTO v_curr_assets FROM accounts
    WHERE user_id = p_user_id AND account_code = '1100';
  SELECT id INTO v_curr_liab   FROM accounts
    WHERE user_id = p_user_id AND account_code = '2100';

  INSERT INTO accounts (
    user_id, account_code, account_name, account_type, is_group,
    parent_account_id, account_group, account_subgroup, display_order,
    allow_manual_journals, is_active, description
  )
  VALUES
    (p_user_id, '1170', 'Sundry Debtors',   'Asset',     TRUE,
     v_curr_assets, 'Assets',      'Trade Receivables', 70,
     FALSE, TRUE,
     'Control group for client/customer sub-ledgers. Postings flow to each customer''s leaf account.'),
    (p_user_id, '2160', 'Sundry Creditors', 'Liability', TRUE,
     v_curr_liab,   'Liabilities', 'Trade Payables',    60,
     FALSE, TRUE,
     'Control group for vendor sub-ledgers. Postings flow to each vendor''s leaf account.')
  ON CONFLICT (user_id, account_code) DO UPDATE
    SET is_group               = TRUE,
        parent_account_id      = EXCLUDED.parent_account_id,
        account_group          = EXCLUDED.account_group,
        account_subgroup       = EXCLUDED.account_subgroup,
        allow_manual_journals  = FALSE;
END;
$$;

-- ── 2. Vendor & Client schema extensions ───────────────────────────────────
ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS primary_ledger_account_id UUID
    REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subledger_account_id      UUID
    REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS primary_ledger_account_id UUID
    REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subledger_account_id      UUID
    REFERENCES accounts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_vendors_subledger
  ON vendors(subledger_account_id) WHERE subledger_account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_subledger
  ON clients(subledger_account_id) WHERE subledger_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendors_primary_ledger
  ON vendors(user_id, primary_ledger_account_id);
CREATE INDEX IF NOT EXISTS idx_clients_primary_ledger
  ON clients(user_id, primary_ledger_account_id);

-- ── 3. Helpers ─────────────────────────────────────────────────────────────
-- Generate next sub-ledger account_code under a parent.
-- Pattern: <parent_code>-<4-digit-seq> (e.g. 2160-0001, 2160-0002).
CREATE OR REPLACE FUNCTION next_subledger_code(
  p_user_id   TEXT,
  p_parent_id UUID
) RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_parent_code TEXT;
  v_max_seq     INT;
BEGIN
  SELECT account_code INTO v_parent_code
    FROM accounts WHERE id = p_parent_id;
  IF v_parent_code IS NULL THEN
    RAISE EXCEPTION 'next_subledger_code: parent account % not found', p_parent_id;
  END IF;

  -- Highest 4-digit suffix already used under this parent for this user.
  SELECT COALESCE(MAX(
           (regexp_match(account_code, '^' || v_parent_code || '-(\d+)$'))[1]::INT
         ), 0)
    INTO v_max_seq
    FROM accounts
   WHERE user_id = p_user_id
     AND account_code ~ ('^' || v_parent_code || '-\d+$');

  RETURN v_parent_code || '-' || lpad((v_max_seq + 1)::TEXT, 4, '0');
END;
$$;

-- Auto-create (or fetch existing) sub-ledger row for a vendor.
-- Idempotent: if vendor already has subledger_account_id, returns it.
-- If primary_ledger_account_id is NULL, defaults to Sundry Creditors.
-- Returns the sub-ledger account id.
CREATE OR REPLACE FUNCTION ensure_vendor_subledger(p_vendor_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_user_id    TEXT;
  v_name       TEXT;
  v_company    TEXT;
  v_existing   UUID;
  v_parent_id  UUID;
  v_parent_grp TEXT;
  v_parent_sub TEXT;
  v_code       TEXT;
  v_new_id     UUID;
  v_label      TEXT;
BEGIN
  SELECT user_id, name, company_name, subledger_account_id, primary_ledger_account_id
    INTO v_user_id, v_name, v_company, v_existing, v_parent_id
    FROM vendors WHERE id = p_vendor_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;  -- vendor not found / mid-delete
  END IF;

  -- Already has a sub-ledger? Done.
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- No primary ledger picked yet → default to Sundry Creditors.
  IF v_parent_id IS NULL THEN
    PERFORM ensure_subledger_control_accounts(v_user_id);
    SELECT id INTO v_parent_id FROM accounts
      WHERE user_id = v_user_id AND account_code = '2160';
  END IF;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'ensure_vendor_subledger: no parent account resolvable for vendor %', p_vendor_id;
  END IF;

  -- Carry parent's group labels onto the child for COA tree consistency.
  SELECT account_group, account_subgroup INTO v_parent_grp, v_parent_sub
    FROM accounts WHERE id = v_parent_id;

  v_code := next_subledger_code(v_user_id, v_parent_id);
  v_label := COALESCE(NULLIF(TRIM(v_company), ''), NULLIF(TRIM(v_name), ''), 'Vendor');

  INSERT INTO accounts (
    user_id, account_code, account_name, account_type, is_group,
    parent_account_id, account_group, account_subgroup,
    cash_flow_category, reconciliation_required, allow_manual_journals,
    is_active, opening_balance, description
  )
  VALUES (
    v_user_id, v_code, v_label, 'Liability', FALSE,
    v_parent_id, COALESCE(v_parent_grp, 'Liabilities'),
    COALESCE(v_parent_sub, 'Trade Payables'),
    'Operating', FALSE, FALSE,
    TRUE, 0,
    'Auto-created vendor sub-ledger.'
  )
  RETURNING id INTO v_new_id;

  UPDATE vendors
     SET subledger_account_id      = v_new_id,
         primary_ledger_account_id = v_parent_id
   WHERE id = p_vendor_id;

  RETURN v_new_id;
END;
$$;

-- Auto-create (or fetch existing) sub-ledger row for a client.
CREATE OR REPLACE FUNCTION ensure_client_subledger(p_client_id UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_user_id    TEXT;
  v_name       TEXT;
  v_display    TEXT;
  v_company    TEXT;
  v_existing   UUID;
  v_parent_id  UUID;
  v_parent_grp TEXT;
  v_parent_sub TEXT;
  v_code       TEXT;
  v_new_id     UUID;
  v_label      TEXT;
BEGIN
  SELECT user_id, name, display_name, company_name,
         subledger_account_id, primary_ledger_account_id
    INTO v_user_id, v_name, v_display, v_company, v_existing, v_parent_id
    FROM clients WHERE id = p_client_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  IF v_parent_id IS NULL THEN
    PERFORM ensure_subledger_control_accounts(v_user_id);
    SELECT id INTO v_parent_id FROM accounts
      WHERE user_id = v_user_id AND account_code = '1170';
  END IF;

  IF v_parent_id IS NULL THEN
    RAISE EXCEPTION 'ensure_client_subledger: no parent account resolvable for client %', p_client_id;
  END IF;

  SELECT account_group, account_subgroup INTO v_parent_grp, v_parent_sub
    FROM accounts WHERE id = v_parent_id;

  v_code := next_subledger_code(v_user_id, v_parent_id);
  v_label := COALESCE(
    NULLIF(TRIM(v_display), ''),
    NULLIF(TRIM(v_company), ''),
    NULLIF(TRIM(v_name), ''),
    'Customer'
  );

  INSERT INTO accounts (
    user_id, account_code, account_name, account_type, is_group,
    parent_account_id, account_group, account_subgroup,
    cash_flow_category, reconciliation_required, allow_manual_journals,
    is_active, opening_balance, description
  )
  VALUES (
    v_user_id, v_code, v_label, 'Asset', FALSE,
    v_parent_id, COALESCE(v_parent_grp, 'Assets'),
    COALESCE(v_parent_sub, 'Trade Receivables'),
    'Operating', FALSE, FALSE,
    TRUE, 0,
    'Auto-created customer sub-ledger.'
  )
  RETURNING id INTO v_new_id;

  UPDATE clients
     SET subledger_account_id      = v_new_id,
         primary_ledger_account_id = v_parent_id
   WHERE id = p_client_id;

  RETURN v_new_id;
END;
$$;

-- ── 4. Re-parent a vendor/client to a different primary ledger ─────────────
-- Moves the existing sub-ledger row under a new control group. Validates
-- the new parent is a group of the right account_type.
CREATE OR REPLACE FUNCTION set_vendor_primary_ledger(
  p_vendor_id UUID,
  p_new_parent_id UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_user_id     TEXT;
  v_subledger   UUID;
  v_new_type    TEXT;
  v_new_group   TEXT;
  v_new_subgrp  TEXT;
  v_new_isgroup BOOLEAN;
  v_new_useruid TEXT;
BEGIN
  SELECT user_id, subledger_account_id INTO v_user_id, v_subledger
    FROM vendors WHERE id = p_vendor_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_vendor_primary_ledger: vendor % not found', p_vendor_id;
  END IF;

  SELECT user_id, account_type, account_group, account_subgroup, is_group
    INTO v_new_useruid, v_new_type, v_new_group, v_new_subgrp, v_new_isgroup
    FROM accounts WHERE id = p_new_parent_id;
  IF v_new_useruid IS NULL OR v_new_useruid <> v_user_id THEN
    RAISE EXCEPTION 'set_vendor_primary_ledger: new parent not owned by user';
  END IF;
  IF v_new_type <> 'Liability' THEN
    RAISE EXCEPTION 'set_vendor_primary_ledger: vendor ledger must be a Liability account';
  END IF;
  IF NOT v_new_isgroup THEN
    RAISE EXCEPTION 'set_vendor_primary_ledger: parent must be a group account';
  END IF;

  -- Ensure sub-ledger exists.
  IF v_subledger IS NULL THEN
    v_subledger := ensure_vendor_subledger(p_vendor_id);
  END IF;

  -- Re-code under new parent (so prefix stays consistent).
  UPDATE accounts
     SET parent_account_id = p_new_parent_id,
         account_code      = next_subledger_code(v_user_id, p_new_parent_id),
         account_group     = COALESCE(v_new_group,  account_group),
         account_subgroup  = COALESCE(v_new_subgrp, account_subgroup)
   WHERE id = v_subledger;

  UPDATE vendors SET primary_ledger_account_id = p_new_parent_id
   WHERE id = p_vendor_id;

  RETURN v_subledger;
END;
$$;

CREATE OR REPLACE FUNCTION set_client_primary_ledger(
  p_client_id UUID,
  p_new_parent_id UUID
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE
  v_user_id     TEXT;
  v_subledger   UUID;
  v_new_type    TEXT;
  v_new_group   TEXT;
  v_new_subgrp  TEXT;
  v_new_isgroup BOOLEAN;
  v_new_useruid TEXT;
BEGIN
  SELECT user_id, subledger_account_id INTO v_user_id, v_subledger
    FROM clients WHERE id = p_client_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_client_primary_ledger: client % not found', p_client_id;
  END IF;

  SELECT user_id, account_type, account_group, account_subgroup, is_group
    INTO v_new_useruid, v_new_type, v_new_group, v_new_subgrp, v_new_isgroup
    FROM accounts WHERE id = p_new_parent_id;
  IF v_new_useruid IS NULL OR v_new_useruid <> v_user_id THEN
    RAISE EXCEPTION 'set_client_primary_ledger: new parent not owned by user';
  END IF;
  IF v_new_type <> 'Asset' THEN
    RAISE EXCEPTION 'set_client_primary_ledger: client ledger must be an Asset account';
  END IF;
  IF NOT v_new_isgroup THEN
    RAISE EXCEPTION 'set_client_primary_ledger: parent must be a group account';
  END IF;

  IF v_subledger IS NULL THEN
    v_subledger := ensure_client_subledger(p_client_id);
  END IF;

  UPDATE accounts
     SET parent_account_id = p_new_parent_id,
         account_code      = next_subledger_code(v_user_id, p_new_parent_id),
         account_group     = COALESCE(v_new_group,  account_group),
         account_subgroup  = COALESCE(v_new_subgrp, account_subgroup)
   WHERE id = v_subledger;

  UPDATE clients SET primary_ledger_account_id = p_new_parent_id
   WHERE id = p_client_id;

  RETURN v_subledger;
END;
$$;

-- ── 5. Smart suggestions ───────────────────────────────────────────────────
-- Returns up to 3 candidate primary_ledger_account_ids for a new vendor.
-- Heuristic order:
--   1. Most-used primary_ledger across the user's vendors with same gst_treatment.
--   2. Sundry Creditors (default).
--   3. Other Liability group accounts.
-- p_gst_treatment may be NULL for unmapped vendors.
CREATE OR REPLACE FUNCTION suggest_vendor_ledgers(
  p_user_id        TEXT,
  p_gst_treatment  TEXT DEFAULT NULL
) RETURNS TABLE (
  account_id   UUID,
  account_code TEXT,
  account_name TEXT,
  reason       TEXT,
  rank         INT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH most_used AS (
    SELECT v.primary_ledger_account_id AS aid, COUNT(*) AS n
      FROM vendors v
     WHERE v.user_id = p_user_id
       AND v.primary_ledger_account_id IS NOT NULL
       AND (p_gst_treatment IS NULL OR v.gst_treatment = p_gst_treatment)
     GROUP BY v.primary_ledger_account_id
     ORDER BY COUNT(*) DESC
     LIMIT 1
  ),
  candidates AS (
    SELECT a.id, a.account_code, a.account_name,
           CASE
             WHEN a.id = (SELECT aid FROM most_used) THEN 'Most used for similar vendors'
             WHEN a.account_code = '2160' THEN 'Default — Sundry Creditors'
             ELSE 'Other liability group'
           END AS reason,
           CASE
             WHEN a.id = (SELECT aid FROM most_used) THEN 1
             WHEN a.account_code = '2160' THEN 2
             ELSE 3
           END AS rank
      FROM accounts a
     WHERE a.user_id = p_user_id
       AND a.account_type = 'Liability'
       AND a.is_group = TRUE
       AND a.is_active = TRUE
  )
  SELECT c.id, c.account_code, c.account_name, c.reason, c.rank
    FROM candidates c
   ORDER BY c.rank ASC, c.account_code ASC
   LIMIT 6;
END;
$$;

CREATE OR REPLACE FUNCTION suggest_client_ledgers(
  p_user_id        TEXT,
  p_gst_treatment  TEXT DEFAULT NULL
) RETURNS TABLE (
  account_id   UUID,
  account_code TEXT,
  account_name TEXT,
  reason       TEXT,
  rank         INT
) LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN QUERY
  WITH most_used AS (
    SELECT c.primary_ledger_account_id AS aid, COUNT(*) AS n
      FROM clients c
     WHERE c.user_id = p_user_id
       AND c.primary_ledger_account_id IS NOT NULL
       AND (p_gst_treatment IS NULL OR c.gst_treatment = p_gst_treatment)
     GROUP BY c.primary_ledger_account_id
     ORDER BY COUNT(*) DESC
     LIMIT 1
  ),
  candidates AS (
    SELECT a.id, a.account_code, a.account_name,
           CASE
             WHEN a.id = (SELECT aid FROM most_used) THEN 'Most used for similar customers'
             WHEN a.account_code = '1170' THEN 'Default — Sundry Debtors'
             ELSE 'Other asset group'
           END AS reason,
           CASE
             WHEN a.id = (SELECT aid FROM most_used) THEN 1
             WHEN a.account_code = '1170' THEN 2
             ELSE 3
           END AS rank
      FROM accounts a
     WHERE a.user_id = p_user_id
       AND a.account_type = 'Asset'
       AND a.is_group = TRUE
       AND a.is_active = TRUE
  )
  SELECT c.id, c.account_code, c.account_name, c.reason, c.rank
    FROM candidates c
   ORDER BY c.rank ASC, c.account_code ASC
   LIMIT 6;
END;
$$;

-- ── 6. Triggers — auto-create + keep names in sync ─────────────────────────
-- After a vendor is inserted, create its sub-ledger.
CREATE OR REPLACE FUNCTION trg_vendor_after_insert_subledger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subledger_account_id IS NULL THEN
    PERFORM ensure_vendor_subledger(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_auto_subledger ON vendors;
CREATE TRIGGER trg_vendors_auto_subledger
  AFTER INSERT ON vendors
  FOR EACH ROW EXECUTE FUNCTION trg_vendor_after_insert_subledger();

CREATE OR REPLACE FUNCTION trg_client_after_insert_subledger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.subledger_account_id IS NULL THEN
    PERFORM ensure_client_subledger(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_auto_subledger ON clients;
CREATE TRIGGER trg_clients_auto_subledger
  AFTER INSERT ON clients
  FOR EACH ROW EXECUTE FUNCTION trg_client_after_insert_subledger();

-- Keep sub-ledger account_name in sync when the vendor/client display name
-- changes. Quietly no-op when there's no sub-ledger yet.
CREATE OR REPLACE FUNCTION trg_vendor_name_sync_subledger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_label TEXT;
BEGIN
  IF NEW.subledger_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.company_name IS NOT DISTINCT FROM OLD.company_name THEN
    RETURN NEW;
  END IF;
  v_new_label := COALESCE(
    NULLIF(TRIM(NEW.company_name), ''),
    NULLIF(TRIM(NEW.name), ''),
    'Vendor'
  );
  UPDATE accounts SET account_name = v_new_label
   WHERE id = NEW.subledger_account_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_name_sync ON vendors;
CREATE TRIGGER trg_vendors_name_sync
  AFTER UPDATE OF name, company_name ON vendors
  FOR EACH ROW EXECUTE FUNCTION trg_vendor_name_sync_subledger();

CREATE OR REPLACE FUNCTION trg_client_name_sync_subledger()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_new_label TEXT;
BEGIN
  IF NEW.subledger_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.company_name IS NOT DISTINCT FROM OLD.company_name
     AND NEW.display_name IS NOT DISTINCT FROM OLD.display_name THEN
    RETURN NEW;
  END IF;
  v_new_label := COALESCE(
    NULLIF(TRIM(NEW.display_name), ''),
    NULLIF(TRIM(NEW.company_name), ''),
    NULLIF(TRIM(NEW.name), ''),
    'Customer'
  );
  UPDATE accounts SET account_name = v_new_label
   WHERE id = NEW.subledger_account_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_name_sync ON clients;
CREATE TRIGGER trg_clients_name_sync
  AFTER UPDATE OF name, company_name, display_name ON clients
  FOR EACH ROW EXECUTE FUNCTION trg_client_name_sync_subledger();

-- When a user changes primary_ledger_account_id directly on the vendor/client
-- row (via Supabase update), re-parent the sub-ledger to match. Skipped when
-- the trigger itself is doing the update (to avoid recursion).
CREATE OR REPLACE FUNCTION trg_vendor_primary_ledger_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_ledger_account_id IS NOT DISTINCT FROM OLD.primary_ledger_account_id THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_ledger_account_id IS NULL THEN
    RETURN NEW;  -- detach allowed; sub-ledger stays where it is
  END IF;
  IF NEW.subledger_account_id IS NOT NULL THEN
    UPDATE accounts
       SET parent_account_id = NEW.primary_ledger_account_id
     WHERE id = NEW.subledger_account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vendors_primary_ledger_change ON vendors;
CREATE TRIGGER trg_vendors_primary_ledger_change
  AFTER UPDATE OF primary_ledger_account_id ON vendors
  FOR EACH ROW EXECUTE FUNCTION trg_vendor_primary_ledger_change();

CREATE OR REPLACE FUNCTION trg_client_primary_ledger_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.primary_ledger_account_id IS NOT DISTINCT FROM OLD.primary_ledger_account_id THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_ledger_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.subledger_account_id IS NOT NULL THEN
    UPDATE accounts
       SET parent_account_id = NEW.primary_ledger_account_id
     WHERE id = NEW.subledger_account_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_primary_ledger_change ON clients;
CREATE TRIGGER trg_clients_primary_ledger_change
  AFTER UPDATE OF primary_ledger_account_id ON clients
  FOR EACH ROW EXECUTE FUNCTION trg_client_primary_ledger_change();

-- ── 7. Backfill — create sub-ledgers for existing vendors/clients ──────────
-- One call per distinct user_id seeds their control accounts first, then we
-- loop. Idempotent: ensure_*_subledger no-ops if already linked.
DO $$
DECLARE
  v_uid TEXT;
  v_id  UUID;
BEGIN
  FOR v_uid IN
    SELECT DISTINCT user_id FROM vendors WHERE subledger_account_id IS NULL
    UNION
    SELECT DISTINCT user_id FROM clients WHERE subledger_account_id IS NULL
  LOOP
    PERFORM ensure_subledger_control_accounts(v_uid);
  END LOOP;

  FOR v_id IN
    SELECT id FROM vendors WHERE subledger_account_id IS NULL
  LOOP
    PERFORM ensure_vendor_subledger(v_id);
  END LOOP;

  FOR v_id IN
    SELECT id FROM clients WHERE subledger_account_id IS NULL
  LOOP
    PERFORM ensure_client_subledger(v_id);
  END LOOP;
END $$;

-- ── 8. View helpers — vendors/clients with their ledger names ──────────────
CREATE OR REPLACE VIEW v_vendors_with_ledger AS
SELECT
  v.id, v.user_id, v.name, v.company_name, v.gst_treatment,
  v.primary_ledger_account_id, v.subledger_account_id,
  p.account_code AS primary_ledger_code, p.account_name AS primary_ledger_name,
  s.account_code AS subledger_code,      s.account_name AS subledger_name
FROM vendors v
LEFT JOIN accounts p ON p.id = v.primary_ledger_account_id
LEFT JOIN accounts s ON s.id = v.subledger_account_id;

CREATE OR REPLACE VIEW v_clients_with_ledger AS
SELECT
  c.id, c.user_id, c.name, c.company_name, c.display_name, c.gst_treatment,
  c.primary_ledger_account_id, c.subledger_account_id,
  p.account_code AS primary_ledger_code, p.account_name AS primary_ledger_name,
  s.account_code AS subledger_code,      s.account_name AS subledger_name
FROM clients c
LEFT JOIN accounts p ON p.id = c.primary_ledger_account_id
LEFT JOIN accounts s ON s.id = c.subledger_account_id;

-- ── 9. Reload PostgREST schema cache ───────────────────────────────────────
NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN vendors.primary_ledger_account_id IS
  'Control group account this vendor belongs to (e.g. Sundry Creditors, Trade Payables, Vendor Advances). Drives where the sub-ledger leaf is parented.';
COMMENT ON COLUMN vendors.subledger_account_id IS
  'Auto-created leaf account in COA representing this vendor. All AP postings tagged with vendor_id route here instead of the generic AP control.';
COMMENT ON COLUMN clients.primary_ledger_account_id IS
  'Control group account this client belongs to (e.g. Sundry Debtors, Trade Receivables, Customer Advances). Drives where the sub-ledger leaf is parented.';
COMMENT ON COLUMN clients.subledger_account_id IS
  'Auto-created leaf account in COA representing this client. All AR postings tagged with customer_id route here instead of the generic AR control.';
COMMENT ON FUNCTION ensure_vendor_subledger IS
  'Idempotent. Creates a leaf account under the vendor''s primary_ledger_account_id (defaults to Sundry Creditors) and links it back on the vendor row.';
COMMENT ON FUNCTION ensure_client_subledger IS
  'Idempotent. Creates a leaf account under the client''s primary_ledger_account_id (defaults to Sundry Debtors) and links it back on the client row.';
COMMENT ON FUNCTION suggest_vendor_ledgers IS
  'Returns ranked candidate primary ledger groups for a vendor: most-used for same GST treatment, then Sundry Creditors, then other Liability groups.';

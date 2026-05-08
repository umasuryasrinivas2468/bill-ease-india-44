-- ════════════════════════════════════════════════════════════════════════════
-- Final 3 gaps from the 12-point spec:
--   Gap 1: Account hierarchy / groups (Tally-style chart of accounts tree)
--   Gap 2: Unified intake — supported by app-side; nothing to add in SQL
--   Gap 3: Lifecycle state machine (Draft → Pending Approval → Approved →
--          Posted → Locked) on purchase_bills + expenses, with transition
--          guards.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ACCOUNT HIERARCHY (Gap 1) ───────────────────────────────────────────
-- Adds parent_account_id, is_group, account_group, account_subgroup,
-- display_order on the existing `accounts` table. is_group rows are folders
-- (no postings allowed); leaf rows (is_group = FALSE) are the only ones
-- journal_lines can reference.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS parent_account_id  UUID REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_group           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS account_group      TEXT,
  ADD COLUMN IF NOT EXISTS account_subgroup   TEXT,
  ADD COLUMN IF NOT EXISTS display_order      INTEGER DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_accounts_parent
  ON accounts(parent_account_id) WHERE parent_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_group
  ON accounts(user_id, account_group, display_order) WHERE is_active;

-- Block postings to group/folder accounts. Journal lines can only target leaves.
CREATE OR REPLACE FUNCTION enforce_leaf_account_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_group BOOLEAN;
  v_name     TEXT;
BEGIN
  SELECT is_group, account_name INTO v_is_group, v_name
    FROM accounts WHERE id = NEW.account_id;
  IF v_is_group THEN
    RAISE EXCEPTION
      'Cannot post to group account "%". Use a leaf (sub-account) instead.', v_name
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_journal_lines_leaf_only ON journal_lines;
CREATE TRIGGER trg_journal_lines_leaf_only
  BEFORE INSERT OR UPDATE ON journal_lines
  FOR EACH ROW EXECUTE FUNCTION enforce_leaf_account_only();

-- Recursive view — full account tree with depth + path. Used by the COA UI.
DROP VIEW IF EXISTS v_account_tree;
CREATE VIEW v_account_tree AS
WITH RECURSIVE tree AS (
  SELECT
    a.id,
    a.user_id,
    a.account_code,
    a.account_name,
    a.account_type,
    a.account_group,
    a.account_subgroup,
    a.is_group,
    a.is_active,
    a.opening_balance,
    a.display_order,
    a.parent_account_id,
    0                                    AS depth,
    a.account_name::text                 AS path,
    ARRAY[a.id]                          AS ancestors
  FROM accounts a
  WHERE a.parent_account_id IS NULL
  UNION ALL
  SELECT
    c.id, c.user_id, c.account_code, c.account_name, c.account_type,
    c.account_group, c.account_subgroup, c.is_group, c.is_active,
    c.opening_balance, c.display_order, c.parent_account_id,
    t.depth + 1,
    t.path || ' > ' || c.account_name,
    t.ancestors || c.id
  FROM accounts c
  JOIN tree t ON c.parent_account_id = t.id
)
SELECT * FROM tree;

-- Recursive rollup view — every group account's "balance" = sum of leaf balances
-- under it. Built in two CTEs:
--   tree       — the hierarchy itself (one row per account)
--   descendants — flat (ancestor_id, descendant_id) pairs (incl. self)
-- Then journal_lines joined via descendants so a group account aggregates
-- every posting beneath it.
DROP VIEW IF EXISTS v_account_tree_balance;
CREATE VIEW v_account_tree_balance AS
WITH RECURSIVE
  tree AS (
    SELECT id, user_id, account_code, account_name, account_type, account_group,
           account_subgroup, is_group, parent_account_id, display_order
      FROM accounts WHERE parent_account_id IS NULL
    UNION ALL
    SELECT c.id, c.user_id, c.account_code, c.account_name, c.account_type, c.account_group,
           c.account_subgroup, c.is_group, c.parent_account_id, c.display_order
      FROM accounts c
      JOIN tree t ON c.parent_account_id = t.id
  ),
  descendants AS (
    SELECT id AS ancestor_id, id AS descendant_id
      FROM accounts
    UNION ALL
    SELECT d.ancestor_id, c.id
      FROM descendants d
      JOIN accounts c ON c.parent_account_id = d.descendant_id
  )
SELECT
  t.id, t.user_id, t.account_code, t.account_name, t.account_type,
  t.account_group, t.account_subgroup, t.is_group, t.parent_account_id, t.display_order,
  COALESCE(SUM(
    CASE t.account_type
      WHEN 'Asset'     THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
      WHEN 'Expense'   THEN COALESCE(jl.debit,0)  - COALESCE(jl.credit,0)
      WHEN 'Liability' THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      WHEN 'Equity'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
      WHEN 'Income'    THEN COALESCE(jl.credit,0) - COALESCE(jl.debit,0)
    END
  ), 0) AS rollup_balance
FROM tree t
LEFT JOIN descendants d ON d.ancestor_id = t.id
LEFT JOIN journal_lines jl ON jl.account_id = d.descendant_id AND jl.user_id = t.user_id
LEFT JOIN journals j        ON j.id = jl.journal_id AND j.status = 'posted'
GROUP BY t.id, t.user_id, t.account_code, t.account_name, t.account_type,
         t.account_group, t.account_subgroup, t.is_group, t.parent_account_id, t.display_order;

-- Seed default Indian COA groups (Schedule III aligned). Idempotent.
CREATE OR REPLACE FUNCTION seed_default_account_tree(p_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_assets        UUID; v_curr_assets UUID; v_fixed_assets UUID; v_inv UUID;
  v_liabilities   UUID; v_curr_liab   UUID; v_lt_liab     UUID;
  v_equity        UUID;
  v_income        UUID;
  v_expenses      UUID; v_direct_exp  UUID; v_indirect_exp UUID;
BEGIN
  -- Asset side
  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, display_order)
  VALUES (p_user_id, '1000', 'Assets', 'Asset', TRUE, 'Assets', 1)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE
  RETURNING id INTO v_assets;

  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, parent_account_id, account_group, account_subgroup, display_order)
  VALUES
    (p_user_id, '1100', 'Current Assets',  'Asset', TRUE, v_assets, 'Assets', 'Current Assets', 10),
    (p_user_id, '1200', 'Fixed Assets',    'Asset', TRUE, v_assets, 'Assets', 'Fixed Assets',   20),
    (p_user_id, '1300', 'Inventory',       'Asset', TRUE, v_assets, 'Assets', 'Inventory',      30)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE, parent_account_id = EXCLUDED.parent_account_id;

  SELECT id INTO v_curr_assets  FROM accounts WHERE user_id = p_user_id AND account_code = '1100';
  SELECT id INTO v_fixed_assets FROM accounts WHERE user_id = p_user_id AND account_code = '1200';
  SELECT id INTO v_inv          FROM accounts WHERE user_id = p_user_id AND account_code = '1300';

  -- Liability side
  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, display_order)
  VALUES (p_user_id, '2000', 'Liabilities', 'Liability', TRUE, 'Liabilities', 2)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE
  RETURNING id INTO v_liabilities;

  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, parent_account_id, account_group, account_subgroup, display_order)
  VALUES
    (p_user_id, '2100', 'Current Liabilities',   'Liability', TRUE, v_liabilities, 'Liabilities', 'Current Liabilities',   10),
    (p_user_id, '2200', 'Long-term Liabilities', 'Liability', TRUE, v_liabilities, 'Liabilities', 'Long-term Liabilities', 20)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE, parent_account_id = EXCLUDED.parent_account_id;

  -- Equity
  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, display_order)
  VALUES (p_user_id, '3000', 'Equity', 'Equity', TRUE, 'Equity', 3)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE
  RETURNING id INTO v_equity;

  -- Income
  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, display_order)
  VALUES (p_user_id, '4000', 'Income', 'Income', TRUE, 'Income', 4)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE
  RETURNING id INTO v_income;

  -- Expenses
  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, account_group, display_order)
  VALUES (p_user_id, '5000', 'Expenses', 'Expense', TRUE, 'Expenses', 5)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE
  RETURNING id INTO v_expenses;

  INSERT INTO accounts (user_id, account_code, account_name, account_type, is_group, parent_account_id, account_group, account_subgroup, display_order)
  VALUES
    (p_user_id, '5100', 'Direct Expenses',   'Expense', TRUE, v_expenses, 'Expenses', 'Direct Expenses',   10),
    (p_user_id, '5200', 'Indirect Expenses', 'Expense', TRUE, v_expenses, 'Expenses', 'Indirect Expenses', 20)
  ON CONFLICT (user_id, account_code) DO UPDATE SET is_group = TRUE, parent_account_id = EXCLUDED.parent_account_id;

  -- Re-parent existing standard leaf accounts so the tree comes together for
  -- users whose accounts were created earlier by getOrCreateAccount().
  UPDATE accounts SET parent_account_id = v_curr_assets,  account_group = 'Assets',      account_subgroup = 'Current Assets'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Asset'
     AND lower(account_name) ~ '(bank|cash|receivable|input tax|cgst input|sgst input|igst input|vendor advance)';
  UPDATE accounts SET parent_account_id = v_inv,          account_group = 'Assets',      account_subgroup = 'Inventory'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Asset'
     AND lower(account_name) ~ '(inventory)';
  UPDATE accounts SET parent_account_id = v_fixed_assets, account_group = 'Assets',      account_subgroup = 'Fixed Assets'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Asset'
     AND lower(account_name) ~ '(fixed asset|equipment|prepaid)';
  UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE user_id = p_user_id AND account_code = '2100'),
                      account_group = 'Liabilities', account_subgroup = 'Current Liabilities'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Liability';
  UPDATE accounts SET parent_account_id = v_income,       account_group = 'Income'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Income';
  UPDATE accounts SET parent_account_id = (SELECT id FROM accounts WHERE user_id = p_user_id AND account_code = '5200'),
                      account_group = 'Expenses', account_subgroup = 'Indirect Expenses'
   WHERE user_id = p_user_id AND parent_account_id IS NULL AND account_type = 'Expense'
     AND id NOT IN (v_expenses);
END;
$$;

-- ── 2. LIFECYCLE STATE MACHINE (Gap 3) ─────────────────────────────────────
-- New column lifecycle_status separates "approval lifecycle" from the
-- existing payment-status (`status`). Lifecycle:
--   draft → pending_approval → approved → posted → locked
--          ↑                  ↓
--          └── revoked ───────┘   (also: rejected, void)
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'posted'
    CHECK (lifecycle_status IN ('draft','pending_approval','approved','posted','rejected','void','locked')),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by TEXT;

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS lifecycle_status TEXT NOT NULL DEFAULT 'posted'
    CHECK (lifecycle_status IN ('draft','pending_approval','approved','posted','rejected','void','locked')),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS lifecycle_changed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_lifecycle
  ON purchase_bills(user_id, lifecycle_status, bill_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_lifecycle
  ON expenses(user_id, lifecycle_status, expense_date DESC);

-- Allowed transitions matrix (forward-only with a few rollbacks).
CREATE OR REPLACE FUNCTION valid_lifecycle_transition(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT (p_from, p_to) IN (
    ('draft',            'pending_approval'),
    ('draft',            'posted'),               -- when no approval rule applies
    ('draft',            'void'),
    ('pending_approval', 'approved'),
    ('pending_approval', 'rejected'),
    ('pending_approval', 'draft'),                -- revoke
    ('approved',         'posted'),
    ('approved',         'rejected'),             -- post-approval recall
    ('rejected',         'draft'),                -- re-edit and resubmit
    ('posted',           'locked'),
    ('posted',           'void')                  -- void after posting → reversal flow
  );
$$;

CREATE OR REPLACE FUNCTION enforce_lifecycle_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Allow any status on insert (drafts, imported posted bills, etc.)
    NEW.lifecycle_changed_at := NOW();
    NEW.lifecycle_changed_by := COALESCE(
      NEW.lifecycle_changed_by,
      NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, '')
    );
    RETURN NEW;
  END IF;

  IF NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status THEN
    IF NOT valid_lifecycle_transition(OLD.lifecycle_status, NEW.lifecycle_status) THEN
      RAISE EXCEPTION
        'Invalid lifecycle transition % → %. Use the helper RPC or a permitted path.',
        OLD.lifecycle_status, NEW.lifecycle_status
        USING ERRCODE = '23514';
    END IF;
    -- Locked rows are immutable except for status itself. Block accounting fields.
    IF OLD.lifecycle_status = 'locked' THEN
      RAISE EXCEPTION 'Locked record cannot transition out except by reversal.'
        USING ERRCODE = '23514';
    END IF;
    NEW.lifecycle_changed_at := NOW();
    NEW.lifecycle_changed_by := COALESCE(
      NULLIF((current_setting('request.jwt.claims'::text, true))::json ->> 'sub'::text, ''),
      NEW.lifecycle_changed_by
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bill_lifecycle ON purchase_bills;
CREATE TRIGGER trg_bill_lifecycle
  BEFORE INSERT OR UPDATE OF lifecycle_status ON purchase_bills
  FOR EACH ROW EXECUTE FUNCTION enforce_lifecycle_transition();

DROP TRIGGER IF EXISTS trg_expense_lifecycle ON expenses;
CREATE TRIGGER trg_expense_lifecycle
  BEFORE INSERT OR UPDATE OF lifecycle_status ON expenses
  FOR EACH ROW EXECUTE FUNCTION enforce_lifecycle_transition();

-- Helper RPCs the app calls instead of UPDATE.
CREATE OR REPLACE FUNCTION transition_bill(p_id UUID, p_to TEXT, p_actor TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_user TEXT;
BEGIN
  UPDATE purchase_bills
     SET lifecycle_status = p_to, lifecycle_changed_by = COALESCE(p_actor, lifecycle_changed_by)
   WHERE id = p_id
   RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Bill % not found', p_id; END IF;

  INSERT INTO ap_audit_log (user_id, actor_id, entity_type, entity_id, action, notes)
  VALUES (v_user, p_actor, 'bill', p_id,
          CASE p_to
            WHEN 'pending_approval' THEN 'approve'
            WHEN 'approved'         THEN 'approve'
            WHEN 'rejected'         THEN 'reject'
            WHEN 'posted'           THEN 'post'
            WHEN 'locked'           THEN 'lock'
            WHEN 'void'             THEN 'reverse'
            ELSE 'update'
          END, p_notes);
END;
$$;

CREATE OR REPLACE FUNCTION transition_expense(p_id UUID, p_to TEXT, p_actor TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE v_user TEXT;
BEGIN
  UPDATE expenses
     SET lifecycle_status = p_to, lifecycle_changed_by = COALESCE(p_actor, lifecycle_changed_by)
   WHERE id = p_id
   RETURNING user_id INTO v_user;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Expense % not found', p_id; END IF;

  INSERT INTO ap_audit_log (user_id, actor_id, entity_type, entity_id, action, notes)
  VALUES (v_user, p_actor, 'expense', p_id,
          CASE p_to
            WHEN 'pending_approval' THEN 'approve'
            WHEN 'approved'         THEN 'approve'
            WHEN 'rejected'         THEN 'reject'
            WHEN 'posted'           THEN 'post'
            WHEN 'locked'           THEN 'lock'
            WHEN 'void'             THEN 'reverse'
            ELSE 'update'
          END, p_notes);
END;
$$;

-- View: bills/expenses awaiting approval (lifecycle = pending_approval).
DROP VIEW IF EXISTS v_lifecycle_pending;
CREATE VIEW v_lifecycle_pending AS
SELECT 'bill'::text     AS kind, id, user_id, vendor_name AS counterparty,
       bill_number      AS reference, bill_date AS doc_date, total_amount AS amount,
       lifecycle_status, lifecycle_changed_at, lifecycle_changed_by
  FROM purchase_bills
 WHERE lifecycle_status = 'pending_approval'
UNION ALL
SELECT 'expense'::text  AS kind, id, user_id, vendor_name AS counterparty,
       COALESCE(expense_number, description) AS reference, expense_date AS doc_date, total_amount AS amount,
       lifecycle_status, lifecycle_changed_at, lifecycle_changed_by
  FROM expenses
 WHERE lifecycle_status = 'pending_approval';

NOTIFY pgrst, 'reload schema';

COMMENT ON COLUMN purchase_bills.lifecycle_status IS
  'Approval / posting lifecycle. Independent of `status` (which tracks payment progress paid/pending/overdue/etc).';
COMMENT ON FUNCTION valid_lifecycle_transition IS
  'Whitelists allowed (from,to) state transitions. Rejected at trigger before write.';

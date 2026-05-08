import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

// ════════════════════════════════════════════════════════════════════════════
// Single journal posting engine — Brief item #2.
//
// Every AP / AR / inventory / GST action posts through `postJournal` here,
// which calls the `post_journal(...)` RPC. The RPC is idempotent on
// (user_id, source_type, source_id), validates balance, and writes journal
// + lines atomically.
//
// Higher-level helpers (postPurchaseBill, postVendorPayment, …) build the
// correctly-tagged line array for each scenario. Old utility files
// (autoJournalEntry / journalPosting / gstJournalPosting) re-export these
// helpers under their previous names so existing call sites keep working.
// ════════════════════════════════════════════════════════════════════════════

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';

export type SourceType =
  | 'bill' | 'bill_reversal'
  | 'expense' | 'expense_reversal'
  | 'payment' | 'payment_reversal'
  | 'advance' | 'advance_reversal'
  | 'advance_adjustment' | 'advance_adjustment_reversal'
  | 'invoice' | 'invoice_reversal'
  | 'payment_received' | 'payment_received_reversal'
  | 'cash_memo' | 'cash_memo_reversal'
  | 'cogs' | 'cogs_reversal'
  | 'inventory_adjustment'
  | 'customer_advance' | 'customer_advance_reversal'
  | 'customer_advance_adjustment' | 'customer_advance_adjustment_reversal'
  | 'payment_link'
  | 'gst_payment'
  | 'tds_payment'
  | 'accrual' | 'accrual_reversal'
  | 'recurring'
  | 'opening_balance'
  | 'manual';

export type TaxType = 'cgst' | 'sgst' | 'igst' | 'cess' | 'rcm_input' | 'rcm_output' | 'itc' | 'output_gst' | 'tds' | 'tcs';

export interface JournalLineInput {
  account_id: string;
  debit?: number;
  credit?: number;
  line_narration?: string;
  vendor_id?: string | null;
  customer_id?: string | null;
  cost_center_id?: string | null;
  project_id?: string | null;
  branch_id?: string | null;
  department?: string | null;
  tax_type?: TaxType | null;
}

export interface PostJournalInput {
  user_id: string;
  date: string;
  narration: string;
  source_type: SourceType;
  source_id?: string | null;
  idempotency_key?: string | null;
  status?: 'draft' | 'posted';
  posted_by?: string | null;
  notes?: string | null;
  lines: JournalLineInput[];
}

// ── account resolution ──────────────────────────────────────────────────────
// Centralized so all helpers create the same canonical chart of accounts.
// Other utility files used to keep their own copies; consolidating prevents
// drift (e.g. one file creating "Purchase Account", another "Purchase Expense").
export const STANDARD_ACCOUNTS = {
  ACCOUNTS_PAYABLE:        { name: 'Accounts Payable',        type: 'Liability' as AccountType },
  ACCOUNTS_RECEIVABLE:     { name: 'Accounts Receivable',     type: 'Asset'     as AccountType },
  BANK:                    { name: 'Bank Account',            type: 'Asset'     as AccountType },
  CASH:                    { name: 'Cash Account',            type: 'Asset'     as AccountType },
  INVENTORY:               { name: 'Inventory Asset',         type: 'Asset'     as AccountType },
  PURCHASE_EXPENSE:        { name: 'Purchase Account',        type: 'Expense'   as AccountType },
  COGS:                    { name: 'Cost of Goods Sold',      type: 'Expense'   as AccountType },
  SALES:                   { name: 'Sales Revenue',           type: 'Income'    as AccountType },
  ITC:                     { name: 'Input Tax Credit',        type: 'Asset'     as AccountType },
  OUTPUT_GST:              { name: 'Output GST',              type: 'Liability' as AccountType },
  OUTPUT_GST_ON_ADVANCES:  { name: 'Output GST on Advances',  type: 'Liability' as AccountType },
  RCM_LIABILITY:           { name: 'RCM Tax Liability',       type: 'Liability' as AccountType },
  CGST_INPUT:              { name: 'CGST Input',              type: 'Asset'     as AccountType },
  SGST_INPUT:              { name: 'SGST Input',              type: 'Asset'     as AccountType },
  IGST_INPUT:              { name: 'IGST Input',              type: 'Asset'     as AccountType },
  CESS_INPUT:              { name: 'Cess Input',              type: 'Asset'     as AccountType },
  CGST_OUTPUT:             { name: 'CGST Output',             type: 'Liability' as AccountType },
  SGST_OUTPUT:             { name: 'SGST Output',             type: 'Liability' as AccountType },
  IGST_OUTPUT:             { name: 'IGST Output',             type: 'Liability' as AccountType },
  CESS_OUTPUT:             { name: 'Cess Output',             type: 'Liability' as AccountType },
  VENDOR_ADVANCES:         { name: 'Vendor Advances',         type: 'Asset'     as AccountType },
  CUSTOMER_ADVANCES:       { name: 'Customer Advances',       type: 'Liability' as AccountType },
  TDS_PAYABLE:             { name: 'TDS Payable',             type: 'Liability' as AccountType },
  INVENTORY_ADJUSTMENTS:   { name: 'Inventory Adjustments',   type: 'Expense'   as AccountType },
  ROUND_OFF:               { name: 'Round Off',               type: 'Expense'   as AccountType },
  FIXED_ASSETS:            { name: 'Fixed Assets',            type: 'Asset'     as AccountType },
  PREPAID_EXPENSES:        { name: 'Prepaid Expenses',        type: 'Asset'     as AccountType },
} as const;

const ACCOUNT_TYPE_PREFIX: Record<AccountType, string> = {
  Asset: '1', Liability: '2', Equity: '3', Income: '4', Expense: '5',
};

export const getOrCreateAccount = async (
  userId: string,
  accountName: string,
  accountType: AccountType
): Promise<string> => {
  const uid = normalizeUserId(userId);

  const { data: existing } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', uid)
    .eq('account_type', accountType)
    .ilike('account_name', accountName)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (existing) return existing.id;

  // Fall back to fuzzy match (legacy data may have variant names like
  // "Purchase Expense" vs "Purchase Account").
  const { data: fuzzy } = await supabase
    .from('accounts')
    .select('id')
    .eq('user_id', uid)
    .eq('account_type', accountType)
    .ilike('account_name', `%${accountName}%`)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (fuzzy) return fuzzy.id;

  const prefix = ACCOUNT_TYPE_PREFIX[accountType];
  const { data: last } = await supabase
    .from('accounts')
    .select('account_code')
    .eq('user_id', uid)
    .like('account_code', `${prefix}%`)
    .order('account_code', { ascending: false })
    .limit(1);
  const nextNum = last && last.length > 0
    ? (parseInt(last[0].account_code.substring(1)) || 0) + 1
    : 1;
  const code = `${prefix}${String(nextNum).padStart(3, '0')}`;

  const { data: created, error } = await supabase
    .from('accounts')
    .insert({ user_id: uid, account_code: code, account_name: accountName, account_type: accountType, opening_balance: 0, is_active: true })
    .select('id')
    .single();
  if (error) {
    // Race: another tab created it. Re-read.
    const { data: race } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', uid)
      .eq('account_type', accountType)
      .ilike('account_name', accountName)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (race) return race.id;
    throw error;
  }
  return created.id;
};

// ── journal numbering ──────────────────────────────────────────────────────
// Max+1 with retry on unique-violation. The (user_id, journal_number) unique
// index forces at most one winner; the loser retries with the next number.
const nextJournalNumber = async (userId: string, date: string, prefix = 'JV'): Promise<string> => {
  const year = new Date(date).getFullYear();
  const { data } = await supabase
    .from('journals')
    .select('journal_number')
    .eq('user_id', userId)
    .like('journal_number', `${prefix}/${year}/%`)
    .order('journal_number', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].journal_number.match(new RegExp(`${prefix}\\/\\d+\\/(\\d+)`));
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `${prefix}/${year}/${String(seq).padStart(4, '0')}`;
};

// ── core post / reverse ─────────────────────────────────────────────────────
export const postJournal = async (input: PostJournalInput): Promise<string> => {
  const uid = normalizeUserId(input.user_id);

  // Balance check up-front for a clearer error than the SQL EXCEPTION.
  const totalDebit  = input.lines.reduce((s, l) => s + (l.debit  || 0), 0);
  const totalCredit = input.lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced journal: debits=${totalDebit.toFixed(2)} credits=${totalCredit.toFixed(2)} narration="${input.narration}"`);
  }
  if (totalDebit === 0 && totalCredit === 0) {
    throw new Error(`Empty journal: ${input.narration}`);
  }

  // Up to 3 attempts to dodge journal_number races on burst inserts.
  let lastErr: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    const journalNumber = await nextJournalNumber(uid, input.date);
    const { data, error } = await supabase.rpc('post_journal', {
      p_user_id:         uid,
      p_journal_date:    input.date,
      p_narration:       input.narration,
      p_source_type:     input.source_type,
      p_source_id:       input.source_id ?? null,
      p_idempotency_key: input.idempotency_key ?? null,
      p_lines:           input.lines.map(l => ({
        account_id:     l.account_id,
        debit:          l.debit  || 0,
        credit:         l.credit || 0,
        line_narration: l.line_narration || null,
        vendor_id:      l.vendor_id      ?? null,
        customer_id:    l.customer_id    ?? null,
        cost_center_id: l.cost_center_id ?? null,
        project_id:     l.project_id     ?? null,
        branch_id:      l.branch_id      ?? null,
        department:     l.department     ?? null,
        tax_type:       l.tax_type       ?? null,
      })),
      p_journal_number:  journalNumber,
      p_status:          input.status   ?? 'posted',
      p_posted_by:       input.posted_by ?? null,
      p_notes:           input.notes    ?? null,
    });
    if (!error) return data as string;
    lastErr = error;
    // Retry only on journal_number unique-violation.
    if (!String(error.message).match(/journal_number|duplicate key/i)) break;
  }
  throw lastErr;
};

export const reverseJournal = async (
  journalId: string,
  opts?: { date?: string; reason?: string; reversedBy?: string; reversalNumber?: string }
): Promise<string> => {
  const { data, error } = await supabase.rpc('reverse_journal', {
    p_journal_id:      journalId,
    p_reversal_date:   opts?.date ?? null,
    p_reversal_number: opts?.reversalNumber ?? null,
    p_reason:          opts?.reason ?? null,
    p_reversed_by:     opts?.reversedBy ?? null,
  });
  if (error) throw error;
  return data as string;
};

// ── high-level helpers ─────────────────────────────────────────────────────
// Each scenario builds the right set of debits/credits with sub-ledger tags.
// All accept optional metadata (vendor_id, cost_center_id, project_id, etc.)
// so call sites can opt into rich tagging without breaking the old shape.

export interface PostBillArgs {
  bill_id?: string;
  bill_number: string;
  bill_date: string;
  vendor_name: string;
  vendor_id?: string;
  amount: number;             // taxable value
  gst_amount: number;         // total GST (cgst+sgst+igst+cess)
  total_amount: number;
  inventory_amount?: number;  // portion of `amount` classified as inventory
  asset_amount?: number;      // portion of `amount` classified as fixed asset
  prepaid_amount?: number;    // portion of `amount` classified as prepaid expense
  is_rcm?: boolean;
  itc_eligible?: boolean;     // default true
  cost_center_id?: string;
  project_id?: string;
  branch_id?: string;
  // Optional GST split. If absent, falls back to a single ITC line.
  gst_split?: { cgst?: number; sgst?: number; igst?: number; cess?: number };
}

/**
 * Purchase bill → Dr Inventory/Purchase + Dr ITC, Cr Accounts Payable.
 *
 * For RCM bills we ALSO Dr ITC (if eligible) and Cr RCM Liability — and
 * the AP credit is taxable-value-only, since the buyer self-assesses GST.
 *
 * If `gst_split` is provided, we book CGST/SGST/IGST/Cess as separate ITC
 * lines tagged with their tax_type. Otherwise a single "Input Tax Credit"
 * line is booked (legacy behaviour).
 */
export const postPurchaseBill = async (
  userId: string,
  bill: PostBillArgs
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const isRcm = bill.is_rcm === true;
  const itcEligible = bill.itc_eligible !== false;
  const inventoryAmt = Number(bill.inventory_amount || 0);
  const assetAmt     = Number(bill.asset_amount     || 0);
  const prepaidAmt   = Number(bill.prepaid_amount   || 0);
  const purchaseAmt  = Math.max(0, bill.amount - inventoryAmt - assetAmt - prepaidAmt);

  const apId        = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name, 'Liability');
  const inventoryId = inventoryAmt > 0 ? await getOrCreateAccount(uid, STANDARD_ACCOUNTS.INVENTORY.name,        'Asset')   : null;
  const assetId     = assetAmt     > 0 ? await getOrCreateAccount(uid, STANDARD_ACCOUNTS.FIXED_ASSETS.name,     'Asset')   : null;
  const prepaidId   = prepaidAmt   > 0 ? await getOrCreateAccount(uid, STANDARD_ACCOUNTS.PREPAID_EXPENSES.name, 'Asset')   : null;
  const purchaseId  = purchaseAmt  > 0 ? await getOrCreateAccount(uid, STANDARD_ACCOUNTS.PURCHASE_EXPENSE.name, 'Expense') : null;

  const tags = {
    vendor_id: bill.vendor_id,
    cost_center_id: bill.cost_center_id,
    project_id: bill.project_id,
    branch_id: bill.branch_id,
  };

  const lines: JournalLineInput[] = [];

  if (inventoryId && inventoryAmt > 0) {
    lines.push({ account_id: inventoryId, debit: inventoryAmt, line_narration: `Inventory inward — ${bill.bill_number}`, ...tags });
  }
  if (assetId && assetAmt > 0) {
    lines.push({ account_id: assetId, debit: assetAmt, line_narration: `Fixed asset acquisition — ${bill.bill_number}`, ...tags });
  }
  if (prepaidId && prepaidAmt > 0) {
    lines.push({ account_id: prepaidId, debit: prepaidAmt, line_narration: `Prepaid expense — ${bill.bill_number}`, ...tags });
  }
  if (purchaseId && purchaseAmt > 0) {
    lines.push({ account_id: purchaseId, debit: purchaseAmt, line_narration: `Purchase expense — ${bill.bill_number}`, ...tags });
  }

  // GST handling.
  if (bill.gst_amount > 0) {
    if (itcEligible) {
      // Either split or single ITC line.
      const split = bill.gst_split;
      if (split && (split.cgst || split.sgst || split.igst || split.cess)) {
        if (split.cgst) {
          const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.CGST_INPUT.name, 'Asset');
          lines.push({ account_id: id, debit: split.cgst, line_narration: `CGST input — ${bill.bill_number}`, tax_type: 'cgst', ...tags });
        }
        if (split.sgst) {
          const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.SGST_INPUT.name, 'Asset');
          lines.push({ account_id: id, debit: split.sgst, line_narration: `SGST input — ${bill.bill_number}`, tax_type: 'sgst', ...tags });
        }
        if (split.igst) {
          const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.IGST_INPUT.name, 'Asset');
          lines.push({ account_id: id, debit: split.igst, line_narration: `IGST input — ${bill.bill_number}`, tax_type: 'igst', ...tags });
        }
        if (split.cess) {
          const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.CESS_INPUT.name, 'Asset');
          lines.push({ account_id: id, debit: split.cess, line_narration: `Cess input — ${bill.bill_number}`, tax_type: 'cess', ...tags });
        }
      } else {
        const itcId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ITC.name, 'Asset');
        lines.push({ account_id: itcId, debit: bill.gst_amount, line_narration: `Input GST — ${bill.bill_number}`, tax_type: 'itc', ...tags });
      }
    } else {
      // ITC ineligible — capitalize the GST into purchase/inventory cost.
      const blockedAccount = inventoryId ?? purchaseId;
      if (blockedAccount) {
        lines.push({ account_id: blockedAccount, debit: bill.gst_amount, line_narration: `GST capitalized (ITC ineligible) — ${bill.bill_number}`, ...tags });
      }
    }
  }

  if (isRcm) {
    // RCM: AP only carries the taxable value (vendor doesn't charge GST);
    // the GST becomes a self-assessed RCM liability.
    const rcmLiabId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.RCM_LIABILITY.name, 'Liability');
    lines.push({ account_id: rcmLiabId, credit: bill.gst_amount, line_narration: `RCM GST liability — ${bill.bill_number}`, tax_type: 'rcm_output', ...tags });
    lines.push({ account_id: apId,      credit: bill.amount,     line_narration: `Payable to ${bill.vendor_name} — ${bill.bill_number}`, ...tags });
  } else {
    lines.push({ account_id: apId, credit: bill.total_amount, line_narration: `Payable to ${bill.vendor_name} — ${bill.bill_number}`, ...tags });
  }

  return postJournal({
    user_id: uid,
    date: bill.bill_date,
    narration: `Purchase Bill ${bill.bill_number} — ${bill.vendor_name}${isRcm ? ' (RCM)' : ''}`,
    source_type: 'bill',
    source_id: bill.bill_id ?? null,
    lines,
  });
};

export interface PostVendorPaymentArgs {
  payment_id?: string;
  bill_number: string;
  date: string;
  vendor_name: string;
  vendor_id?: string;
  amount: number;
  payment_mode?: string;
  cost_center_id?: string;
  project_id?: string;
  reference?: string;
}

/** Vendor payment → Dr Accounts Payable, Cr Bank/Cash. */
export const postVendorPayment = async (
  userId: string,
  payment: PostVendorPaymentArgs
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const apId   = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name, 'Liability');
  const cashy  = (payment.payment_mode === 'cash') ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
  const bankId = await getOrCreateAccount(uid, cashy.name, 'Asset');
  const tags = { vendor_id: payment.vendor_id, cost_center_id: payment.cost_center_id, project_id: payment.project_id };
  return postJournal({
    user_id: uid,
    date: payment.date,
    narration: `Vendor payment — ${payment.bill_number} — ${payment.vendor_name}${payment.reference ? ' — Ref ' + payment.reference : ''}`,
    source_type: 'payment',
    source_id: payment.payment_id ?? null,
    lines: [
      { account_id: apId,   debit:  payment.amount, line_narration: `Clear payable — ${payment.bill_number}`, ...tags },
      { account_id: bankId, credit: payment.amount, line_narration: `Payment to ${payment.vendor_name}`,    ...tags },
    ],
  });
};

export interface PostVendorAdvanceArgs {
  advance_id?: string;
  advance_number: string;
  advance_date: string;
  vendor_name: string;
  vendor_id?: string;
  amount: number;
  payment_mode?: string;
  cost_center_id?: string;
  project_id?: string;
}

/** Vendor advance → Dr Vendor Advances (Asset), Cr Bank/Cash. */
export const postVendorAdvance = async (
  userId: string,
  advance: PostVendorAdvanceArgs
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const advanceId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.VENDOR_ADVANCES.name, 'Asset');
  const cashy = advance.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
  const bankId = await getOrCreateAccount(uid, cashy.name, 'Asset');
  const tags = { vendor_id: advance.vendor_id, cost_center_id: advance.cost_center_id, project_id: advance.project_id };
  return postJournal({
    user_id: uid,
    date: advance.advance_date,
    narration: `Vendor Advance ${advance.advance_number} — ${advance.vendor_name}`,
    source_type: 'advance',
    source_id: advance.advance_id ?? null,
    lines: [
      { account_id: advanceId, debit:  advance.amount, line_narration: `Advance to ${advance.vendor_name} — ${advance.advance_number}`, ...tags },
      { account_id: bankId,    credit: advance.amount, line_narration: `Payment for advance — ${advance.advance_number}`,                ...tags },
    ],
  });
};

export interface PostAdvanceAdjustmentArgs {
  adjustment_id?: string;
  advance_number: string;
  bill_number: string;
  date: string;
  vendor_name: string;
  vendor_id?: string;
  amount: number;
}

/** Advance adjustment → Dr Accounts Payable, Cr Vendor Advances. */
export const postAdvanceAdjustment = async (
  userId: string,
  adj: PostAdvanceAdjustmentArgs
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const apId      = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name, 'Liability');
  const advanceId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.VENDOR_ADVANCES.name, 'Asset');
  const tags = { vendor_id: adj.vendor_id };
  return postJournal({
    user_id: uid,
    date: adj.date,
    narration: `Advance adjustment ${adj.advance_number} → ${adj.bill_number} — ${adj.vendor_name}`,
    source_type: 'advance_adjustment',
    source_id: adj.adjustment_id ?? null,
    lines: [
      { account_id: apId,      debit:  adj.amount, line_narration: `Adjust payable — ${adj.bill_number}`,    ...tags },
      { account_id: advanceId, credit: adj.amount, line_narration: `Adjust advance — ${adj.advance_number}`, ...tags },
    ],
  });
};

export interface PostExpenseArgs {
  expense_id?: string;
  expense_date: string;
  vendor_name?: string;
  vendor_id?: string;
  category_name: string;
  amount: number;
  tax_amount?: number;
  tds_amount?: number;
  payment_mode?: string;       // cash, bank, upi, credit, on_account, …
  description?: string;
  is_rcm?: boolean;
  itc_eligible?: boolean;
  cost_center_id?: string;
  project_id?: string;
  branch_id?: string;
}

/**
 * Expense entry → Dr Expense + Dr ITC (if eligible), Cr Bank/Cash OR
 *               Cr Accounts Payable (when paid on credit).
 *
 * The previous `postExpenseToLedger` always credited Bank — even for
 * `payment_mode = 'credit'` / 'on_account', which broke the AP balance.
 * We now route those through Accounts Payable so the vendor liability
 * shows up correctly.
 */
export const postExpense = async (
  userId: string,
  expense: PostExpenseArgs
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const tax = Number(expense.tax_amount || 0);
  const tds = Number(expense.tds_amount || 0);
  const onCredit = expense.payment_mode === 'credit' || expense.payment_mode === 'on_account' || expense.payment_mode === 'pending';
  const isRcm = expense.is_rcm === true;
  const itcEligible = expense.itc_eligible !== false;

  const expenseId = await getOrCreateAccount(uid, `${expense.category_name} Expense`, 'Expense');
  const tags = {
    vendor_id: expense.vendor_id,
    cost_center_id: expense.cost_center_id,
    project_id: expense.project_id,
    branch_id: expense.branch_id,
  };

  const lines: JournalLineInput[] = [];

  // Dr Expense. If tax is ITC ineligible we capitalize it into the expense
  // line (so blocked credits flow into P&L as cost). This applies to both
  // RCM and non-RCM cases — RCM still owes the tax to the government, but
  // ineligible RCM tax is not recoverable, so it lands in expense too.
  const expenseDebit = (tax > 0 && !itcEligible) ? expense.amount + tax : expense.amount;
  lines.push({ account_id: expenseId, debit: expenseDebit, line_narration: `${expense.category_name}${expense.description ? ' — ' + expense.description : ''}`, ...tags });

  // Dr ITC when claimable (non-RCM eligible OR RCM eligible self-claim).
  if (tax > 0 && itcEligible) {
    const itcId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ITC.name, 'Asset');
    lines.push({ account_id: itcId, debit: tax, line_narration: `Input GST on expense`, tax_type: 'itc', ...tags });
  }

  // Cr side. Total credits must equal expenseDebit + (itcEligible ? tax : 0).
  // Cash/AP outflow leg = expense.amount when RCM (vendor isn't paid the tax),
  // = expense.amount + tax otherwise. RCM self-assessed tax goes to RCM Liability.
  if (isRcm) {
    if (tax > 0) {
      const rcmLiabId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.RCM_LIABILITY.name, 'Liability');
      lines.push({ account_id: rcmLiabId, credit: tax, line_narration: `RCM GST liability`, tax_type: 'rcm_output', ...tags });
    }
    // The vendor receives only the taxable amount (their invoice has no GST).
    const cashOut = expense.amount;
    if (onCredit) {
      const apId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name, 'Liability');
      lines.push({ account_id: apId, credit: cashOut, line_narration: `Payable for ${expense.category_name}${expense.vendor_name ? ' — ' + expense.vendor_name : ''}`, ...tags });
    } else {
      const cashy = expense.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
      const payId = await getOrCreateAccount(uid, cashy.name, 'Asset');
      const net = Math.round((cashOut - tds) * 100) / 100;
      lines.push({ account_id: payId, credit: net, line_narration: `Payment via ${expense.payment_mode || 'bank'}`, ...tags });
      if (tds > 0) {
        const tdsId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.TDS_PAYABLE.name, 'Liability');
        lines.push({ account_id: tdsId, credit: tds, line_narration: `TDS deducted`, tax_type: 'tds', ...tags });
      }
    }
  } else {
    // Non-RCM: vendor charges the GST, so it leaves the bank/AP along with the principal.
    const cashOut = expense.amount + tax;
    if (onCredit) {
      const apId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_PAYABLE.name, 'Liability');
      lines.push({ account_id: apId, credit: cashOut, line_narration: `Payable for ${expense.category_name}${expense.vendor_name ? ' — ' + expense.vendor_name : ''}`, ...tags });
    } else {
      const cashy = expense.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
      const payId = await getOrCreateAccount(uid, cashy.name, 'Asset');
      const net = Math.round((cashOut - tds) * 100) / 100;
      lines.push({ account_id: payId, credit: net, line_narration: `Payment via ${expense.payment_mode || 'bank'}`, ...tags });
      if (tds > 0) {
        const tdsId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.TDS_PAYABLE.name, 'Liability');
        lines.push({ account_id: tdsId, credit: tds, line_narration: `TDS deducted`, tax_type: 'tds', ...tags });
      }
    }
  }

  return postJournal({
    user_id: uid,
    date: expense.expense_date,
    narration: `${expense.description || expense.category_name}${expense.vendor_name ? ' — ' + expense.vendor_name : ''}${isRcm ? ' (RCM)' : ''}`,
    source_type: 'expense',
    source_id: expense.expense_id ?? null,
    lines,
  });
};

// ── AR-side helpers (kept here so all postings share the same engine) ──────

export interface PostInvoiceArgs {
  invoice_id?: string;
  invoice_number: string;
  invoice_date: string;
  client_name: string;
  customer_id?: string;
  amount: number;
  gst_amount: number;
  total_amount: number;
  cost_center_id?: string;
  project_id?: string;
  branch_id?: string;
}

export const postInvoice = async (userId: string, invoice: PostInvoiceArgs): Promise<string> => {
  const uid = normalizeUserId(userId);
  const arId    = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name, 'Asset');
  const salesId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.SALES.name, 'Income');
  const tags = { customer_id: invoice.customer_id, cost_center_id: invoice.cost_center_id, project_id: invoice.project_id, branch_id: invoice.branch_id };
  const lines: JournalLineInput[] = [
    { account_id: arId,    debit:  invoice.total_amount, line_narration: `Receivable from ${invoice.client_name} — ${invoice.invoice_number}`, ...tags },
    { account_id: salesId, credit: invoice.amount,        line_narration: `Sales — ${invoice.invoice_number}`, ...tags },
  ];
  if (invoice.gst_amount > 0) {
    const gstId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.OUTPUT_GST.name, 'Liability');
    lines.push({ account_id: gstId, credit: invoice.gst_amount, line_narration: `GST on ${invoice.invoice_number}`, tax_type: 'output_gst', ...tags });
  }
  return postJournal({
    user_id: uid, date: invoice.invoice_date,
    narration: `Sales Invoice ${invoice.invoice_number} — ${invoice.client_name}`,
    source_type: 'invoice', source_id: invoice.invoice_id ?? null,
    lines,
  });
};

export interface PostPaymentReceivedArgs {
  payment_id?: string;
  invoice_number: string;
  date: string;
  client_name: string;
  customer_id?: string;
  amount: number;
  payment_mode?: string;
}

export const postPaymentReceived = async (userId: string, payment: PostPaymentReceivedArgs): Promise<string> => {
  const uid = normalizeUserId(userId);
  const cashy  = payment.payment_mode === 'cash' ? STANDARD_ACCOUNTS.CASH : STANDARD_ACCOUNTS.BANK;
  const bankId = await getOrCreateAccount(uid, cashy.name, 'Asset');
  const arId   = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.ACCOUNTS_RECEIVABLE.name, 'Asset');
  const tags = { customer_id: payment.customer_id };
  return postJournal({
    user_id: uid, date: payment.date,
    narration: `Payment received — ${payment.invoice_number} — ${payment.client_name}`,
    source_type: 'payment_received', source_id: payment.payment_id ?? null,
    lines: [
      { account_id: bankId, debit:  payment.amount, line_narration: `Receipt from ${payment.client_name}`,         ...tags },
      { account_id: arId,   credit: payment.amount, line_narration: `Clear receivable — ${payment.invoice_number}`, ...tags },
    ],
  });
};

export interface PostCogsArgs {
  cogs_id?: string;
  document_number: string;
  date: string;
  party_name: string;
  cogs_amount: number;
  customer_id?: string;
}

export const postCogs = async (userId: string, sale: PostCogsArgs): Promise<string | null> => {
  if (!sale.cogs_amount || sale.cogs_amount <= 0) return null;
  const uid = normalizeUserId(userId);
  const cogsId      = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.COGS.name, 'Expense');
  const inventoryId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.INVENTORY.name, 'Asset');
  const tags = { customer_id: sale.customer_id };
  return postJournal({
    user_id: uid, date: sale.date,
    narration: `COGS — ${sale.document_number} — ${sale.party_name}`,
    source_type: 'cogs', source_id: sale.cogs_id ?? null,
    lines: [
      { account_id: cogsId,      debit:  sale.cogs_amount, line_narration: `COGS for ${sale.document_number}`,           ...tags },
      { account_id: inventoryId, credit: sale.cogs_amount, line_narration: `Inventory issued for ${sale.document_number}`, ...tags },
    ],
  });
};

export interface PostInventoryAdjustmentArgs {
  adjustment_id?: string;
  adjustment_number: string;
  date: string;
  item_name: string;
  value_delta: number;     // signed
  reason?: string;
}

export const postInventoryAdjustment = async (userId: string, adj: PostInventoryAdjustmentArgs): Promise<string | null> => {
  const value = Math.abs(Number(adj.value_delta || 0));
  if (!value) return null;
  const uid = normalizeUserId(userId);
  const inventoryId  = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.INVENTORY.name, 'Asset');
  const adjustmentId = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.INVENTORY_ADJUSTMENTS.name, 'Expense');
  const narration = `${adj.reason || 'Inventory adjustment'} — ${adj.adjustment_number} — ${adj.item_name}`;
  const lines: JournalLineInput[] = adj.value_delta > 0
    ? [
        { account_id: inventoryId,  debit:  value, line_narration: `Inventory increased — ${adj.item_name}` },
        { account_id: adjustmentId, credit: value, line_narration: `Adjustment offset — ${adj.adjustment_number}` },
      ]
    : [
        { account_id: adjustmentId, debit:  value, line_narration: `Inventory write-off — ${adj.item_name}` },
        { account_id: inventoryId,  credit: value, line_narration: `Inventory reduced — ${adj.item_name}` },
      ];
  return postJournal({
    user_id: uid, date: adj.date, narration,
    source_type: 'inventory_adjustment', source_id: adj.adjustment_id ?? null,
    lines,
  });
};

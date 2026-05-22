// ════════════════════════════════════════════════════════════════════════════
// Fixed Asset Service
//
// Owns the full lifecycle of a fixed asset:
//   - create from manual entry, purchase bill, or expense
//   - auto-create per-asset COA leaf accounts under the existing Fixed Assets
//     control group (1200) and Accumulated Depreciation / Depreciation Expense
//     control accounts
//   - post the purchase journal (Dr Fixed Asset / Dr Input GST / Cr AP-or-Bank)
//   - log the lifecycle event in asset_transactions + asset_audit_log
//   - seed the depreciation schedule (handled by depreciationService.bootstrap)
//
// All journal posting routes through journalEngine.postJournal — never touches
// the journals table directly.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  CreateAssetInput,
  FixedAsset,
  FixedAssetCategory,
  AssetTransaction,
  AssetDepreciationRow,
} from '@/types/fixedAssets';
import { generateDepreciationSchedule } from './depreciationService';

// ── Account name conventions ────────────────────────────────────────────────
// Per-asset leaf accounts sit under the existing Fixed Assets control group
// (account_code 1200). We use the asset code in the name so it's traceable in
// the trial balance / ledger views without separate joins.
export const ASSET_ACCOUNT_NAME = (assetCode: string, name: string) =>
  `Fixed Asset - ${assetCode} - ${name.slice(0, 40)}`;
export const ACCUM_DEP_ACCOUNT_NAME = (assetCode: string) =>
  `Accumulated Depreciation - ${assetCode}`;
export const DEP_EXPENSE_ACCOUNT_NAME = 'Depreciation Expense';

// ── Helpers ─────────────────────────────────────────────────────────────────
const round2 = (n: number) => Math.round(n * 100) / 100;

const nextAssetCode = async (userId: string): Promise<string> => {
  const uid = normalizeUserId(userId);
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('fixed_assets')
    .select('asset_code')
    .eq('user_id', uid)
    .like('asset_code', `FA/${year}/%`)
    .order('asset_code', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].asset_code.match(/FA\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `FA/${year}/${String(seq).padStart(4, '0')}`;
};

const ensureCategoriesSeeded = async (userId: string) => {
  const uid = normalizeUserId(userId);
  const { count } = await supabase
    .from('fixed_asset_categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', uid);
  if ((count || 0) === 0) {
    // Trigger the SQL seeder per-user.
    await supabase.rpc('seed_fixed_asset_categories', { p_user_id: uid });
  }
};

// ── Public reads ────────────────────────────────────────────────────────────
export const listAssetCategories = async (userId: string): Promise<FixedAssetCategory[]> => {
  const uid = normalizeUserId(userId);
  await ensureCategoriesSeeded(uid);
  const { data, error } = await supabase
    .from('fixed_asset_categories')
    .select('*')
    .eq('user_id', uid)
    .eq('is_active', true)
    .order('name');
  if (error) throw error;
  return (data || []) as FixedAssetCategory[];
};

export const listFixedAssets = async (userId: string): Promise<FixedAsset[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as FixedAsset[];
};

export const getFixedAsset = async (userId: string, id: string): Promise<FixedAsset | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as FixedAsset) || null;
};

export const listAssetTransactions = async (
  userId: string,
  assetId: string,
): Promise<AssetTransaction[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_transactions')
    .select('*')
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .order('transaction_date', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetTransaction[];
};

export const listAssetDepreciationSchedule = async (
  userId: string,
  assetId: string,
): Promise<AssetDepreciationRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_depreciation_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .order('period_index');
  if (error) throw error;
  return (data || []) as AssetDepreciationRow[];
};

// ── Asset creation ──────────────────────────────────────────────────────────
export interface CreateAssetResult {
  asset: FixedAsset;
  purchaseJournalId: string | null;
  scheduleRows: number;
}

export const createFixedAsset = async (
  userId: string,
  input: CreateAssetInput,
): Promise<CreateAssetResult> => {
  const uid = normalizeUserId(userId);
  await ensureCategoriesSeeded(uid);

  // Resolve category & defaults
  let category: FixedAssetCategory | null = null;
  if (input.category_id) {
    const { data } = await supabase
      .from('fixed_asset_categories')
      .select('*')
      .eq('user_id', uid)
      .eq('id', input.category_id)
      .maybeSingle();
    category = (data as FixedAssetCategory) || null;
  }

  const usefulLife = input.useful_life_years ?? category?.default_useful_life_years ?? 5;
  const method = input.depreciation_method ?? category?.default_depreciation_method ?? 'SLM';
  const depreciationRate =
    input.depreciation_rate ??
    (method === 'WDV' ? category?.default_depreciation_rate ?? 15 : null);
  const salvage = input.salvage_value ?? 0;
  const purchaseValue = round2(input.purchase_value);
  const gstAmount = round2(input.gst_amount || 0);
  const cgst = round2(input.cgst_amount || 0);
  const sgst = round2(input.sgst_amount || 0);
  const igst = round2(input.igst_amount || 0);
  const itcEligible = input.itc_eligible ?? true;

  // If ITC is claimed, GST is recoverable and doesn't capitalise into the asset.
  // If ITC is NOT eligible (blocked credit, e.g. motor vehicles), GST adds to cost.
  const capitalised = round2(purchaseValue + (itcEligible ? 0 : gstAmount));

  const assetCode = await nextAssetCode(uid);

  // Auto-create the per-asset COA accounts.
  const [assetAccountId, accumDepAccountId, depExpenseAccountId] = await Promise.all([
    getOrCreateAccount(uid, ASSET_ACCOUNT_NAME(assetCode, input.name), 'Asset'),
    getOrCreateAccount(uid, ACCUM_DEP_ACCOUNT_NAME(assetCode), 'Asset'),
    getOrCreateAccount(uid, DEP_EXPENSE_ACCOUNT_NAME, 'Expense'),
  ]);

  // Persist the asset
  const insertPayload = {
    user_id: uid,
    asset_code: assetCode,
    name: input.name,
    description: input.description || null,
    category_id: input.category_id || null,
    category_name: input.category_name || category?.name || null,
    purchase_value: purchaseValue,
    gst_amount: gstAmount,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    gst_rate: input.gst_rate ?? null,
    itc_eligible: itcEligible,
    total_capitalised_value: capitalised,
    purchase_date: input.purchase_date,
    capitalised_on: input.purchase_date,
    vendor_id: input.vendor_id || null,
    vendor_name: input.vendor_name || null,
    source_type: input.source_type || 'manual',
    source_id: input.source_id || null,
    source_bill_id: input.source_bill_id || null,
    source_bill_line_id: input.source_bill_line_id || null,
    useful_life_years: usefulLife,
    depreciation_method: method,
    depreciation_rate: depreciationRate,
    salvage_value: salvage,
    accumulated_depreciation: 0,
    book_value: capitalised,
    location: input.location || null,
    branch_id: input.branch_id || null,
    cost_center_id: input.cost_center_id || null,
    custodian: input.custodian || null,
    serial_number: input.serial_number || null,
    status: 'active' as const,
    asset_account_id: assetAccountId,
    accum_dep_account_id: accumDepAccountId,
    dep_expense_account_id: depExpenseAccountId,
    notes: input.notes || null,
    created_by: uid,
  };

  const { data: assetRow, error: insertErr } = await supabase
    .from('fixed_assets')
    .insert(insertPayload)
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  const asset = assetRow as FixedAsset;

  // Post the purchase journal (unless explicitly skipped).
  let purchaseJournalId: string | null = null;
  const shouldPost = input.post_journal !== false;
  if (shouldPost && purchaseValue > 0) {
    purchaseJournalId = await postAssetPurchaseJournal(uid, asset, input.payment_mode || 'credit');
  }

  // Lifecycle event
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: asset.id,
    transaction_type: 'purchase',
    transaction_date: input.purchase_date,
    amount: capitalised,
    journal_id: purchaseJournalId,
    notes: `Purchased${input.vendor_name ? ` from ${input.vendor_name}` : ''}`,
    created_by: uid,
  });

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: asset.id,
    action: 'created',
    after_state: asset as unknown as Record<string, unknown>,
    actor: uid,
  });

  // Seed depreciation schedule (planned rows for full useful life).
  let scheduleRows = 0;
  if (method !== 'None' && usefulLife > 0) {
    scheduleRows = await generateDepreciationSchedule(uid, asset.id);
  }

  return { asset, purchaseJournalId, scheduleRows };
};

// ── Journal posting ─────────────────────────────────────────────────────────
export const postAssetPurchaseJournal = async (
  userId: string,
  asset: FixedAsset,
  paymentMode: 'credit' | 'cash' | 'bank',
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const lines: JournalLineInput[] = [];

  // Dr Fixed Asset (capitalised value — minus GST if ITC eligible)
  const fixedAssetDebit = asset.itc_eligible
    ? asset.purchase_value
    : asset.total_capitalised_value;
  lines.push({
    account_id: asset.asset_account_id!,
    debit: round2(fixedAssetDebit),
    credit: 0,
    line_narration: `Asset capitalisation: ${asset.name}`,
    vendor_id: asset.vendor_id || null,
    cost_center_id: asset.cost_center_id || null,
  });

  // Dr Input GST (only when ITC is eligible — otherwise GST was already added to cost)
  if (asset.itc_eligible && asset.gst_amount > 0) {
    if (asset.igst_amount > 0) {
      const igstAcc = await getOrCreateAccount(uid, 'Input IGST', 'Asset');
      lines.push({
        account_id: igstAcc,
        debit: round2(asset.igst_amount),
        credit: 0,
        line_narration: 'IGST on asset purchase',
        tax_type: 'igst',
      });
    }
    if (asset.cgst_amount > 0) {
      const cgstAcc = await getOrCreateAccount(uid, 'Input CGST', 'Asset');
      lines.push({
        account_id: cgstAcc,
        debit: round2(asset.cgst_amount),
        credit: 0,
        line_narration: 'CGST on asset purchase',
        tax_type: 'cgst',
      });
    }
    if (asset.sgst_amount > 0) {
      const sgstAcc = await getOrCreateAccount(uid, 'Input SGST', 'Asset');
      lines.push({
        account_id: sgstAcc,
        debit: round2(asset.sgst_amount),
        credit: 0,
        line_narration: 'SGST on asset purchase',
        tax_type: 'sgst',
      });
    }
  }

  // Credit side: AP if on credit, Bank/Cash otherwise.
  const totalCredit = round2(asset.purchase_value + asset.gst_amount);
  if (paymentMode === 'credit') {
    const apAcc = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
    lines.push({
      account_id: apAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `Payable for ${asset.name}`,
      vendor_id: asset.vendor_id || null,
    });
  } else {
    const bankName = paymentMode === 'cash' ? 'Cash' : 'Bank';
    const bankAcc = await getOrCreateAccount(uid, bankName, 'Asset');
    lines.push({
      account_id: bankAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `Paid for ${asset.name}`,
    });
  }

  const journalId = await postJournal({
    user_id: uid,
    date: asset.purchase_date,
    narration: `Asset purchase: ${asset.asset_code} — ${asset.name}`,
    source_type: 'asset_purchase',
    source_id: asset.id,
    idempotency_key: `asset_purchase:${asset.id}`,
    lines,
  });

  return journalId;
};

// ── Convert a purchase bill into a fixed asset ──────────────────────────────
// Used by the "Convert to asset" action on a purchase bill that the user
// realises should have been capitalised. Reads the bill, creates the asset
// with source_type='purchase_bill', and posts the asset_purchase journal. The
// caller is responsible for reversing/adjusting the original bill journal if
// the bill's full amount was previously expensed.
export const convertBillToAsset = async (
  userId: string,
  billId: string,
  overrides: Partial<CreateAssetInput> = {},
): Promise<CreateAssetResult> => {
  const uid = normalizeUserId(userId);
  const { data: bill, error } = await supabase
    .from('purchase_bills')
    .select('*')
    .eq('user_id', uid)
    .eq('id', billId)
    .maybeSingle();
  if (error) throw error;
  if (!bill) throw new Error('Purchase bill not found.');

  const input: CreateAssetInput = {
    name: overrides.name || bill.description || `Asset from bill ${bill.bill_number}`,
    purchase_value: overrides.purchase_value ?? Number(bill.amount || 0),
    gst_amount: overrides.gst_amount ?? Number(bill.gst_amount || 0),
    cgst_amount: overrides.cgst_amount ?? Number(bill.cgst_amount || 0),
    sgst_amount: overrides.sgst_amount ?? Number(bill.sgst_amount || 0),
    igst_amount: overrides.igst_amount ?? Number(bill.igst_amount || 0),
    purchase_date: overrides.purchase_date || bill.bill_date,
    vendor_id: overrides.vendor_id ?? bill.vendor_id,
    vendor_name: overrides.vendor_name ?? bill.vendor_name,
    source_type: 'purchase_bill',
    source_id: billId,
    payment_mode: 'credit',
    ...overrides,
  };

  return createFixedAsset(uid, input);
};

// ── Convert an expense to a fixed asset ─────────────────────────────────────
export const convertExpenseToAsset = async (
  userId: string,
  expenseId: string,
  overrides: Partial<CreateAssetInput> = {},
): Promise<CreateAssetResult> => {
  const uid = normalizeUserId(userId);
  const { data: exp, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', uid)
    .eq('id', expenseId)
    .maybeSingle();
  if (error) throw error;
  if (!exp) throw new Error('Expense not found.');

  const input: CreateAssetInput = {
    name: overrides.name || exp.description || `Asset from expense ${exp.expense_number}`,
    purchase_value: overrides.purchase_value ?? Number(exp.amount || 0),
    gst_amount: overrides.gst_amount ?? Number(exp.tax_amount || 0),
    purchase_date: overrides.purchase_date || exp.expense_date,
    vendor_name: overrides.vendor_name ?? exp.vendor_name,
    source_type: 'expense',
    source_id: expenseId,
    payment_mode: 'bank',
    ...overrides,
  };

  return createFixedAsset(uid, input);
};

// ── Generic update (used by Edit Asset page) ────────────────────────────────
export const updateFixedAsset = async (
  userId: string,
  id: string,
  patch: Partial<FixedAsset>,
): Promise<FixedAsset> => {
  const uid = normalizeUserId(userId);
  const { data: before } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();

  // Strip identity / immutable fields
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.asset_code;
  delete cleaned.created_at;
  delete cleaned.created_by;

  const { data, error } = await supabase
    .from('fixed_assets')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: id,
    action: 'updated',
    before_state: before as unknown as Record<string, unknown>,
    after_state: data as unknown as Record<string, unknown>,
    actor: uid,
  });

  return data as FixedAsset;
};

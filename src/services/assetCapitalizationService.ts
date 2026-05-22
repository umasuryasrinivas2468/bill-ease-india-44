// ════════════════════════════════════════════════════════════════════════════
// Asset Capitalization Service — AP → Fixed Asset register flow
//
// Purchase bills with asset-classified lines (items[*].__classification = 'asset')
// already have their asset_amount debited to a generic "Fixed Assets" account
// by the bill journal. This service:
//
//   1. Lists bills awaiting capitalization (v_uncapitalized_asset_bills).
//   2. Extracts the per-line asset entries (v_bill_asset_lines).
//   3. For each line the user confirms, creates a fixed_assets register row
//      (per-asset leaf accounts, depreciation schedule) tagged with
//      source_bill_id + source_bill_line_id for idempotency.
//   4. Posts a single reclassification journal:
//        Dr Fixed Asset — <asset_code> — <name>   (per-asset leaf)
//        Cr Fixed Assets                          (generic standard account)
//      The trial balance total is unchanged; the sub-ledger now resolves.
//   5. The DB trigger refresh_bill_capitalization_status keeps
//      purchase_bills.capitalization_status in sync.
//
// Idempotency: the (user_id, source_bill_id, source_bill_line_id) UNIQUE
// constraint on fixed_assets prevents double-capitalization at the DB layer.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  getOrCreateAccount,
  postJournal,
  STANDARD_ACCOUNTS,
  type JournalLineInput,
} from '@/utils/journalEngine';
import type { CreateAssetInput, FixedAsset, DepreciationMethod } from '@/types/fixedAssets';
import { createFixedAsset } from './fixedAssetService';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Public read shapes ─────────────────────────────────────────────────────
export interface UncapitalizedBill {
  bill_id: string;
  user_id: string;
  bill_number: string;
  bill_date: string;
  vendor_id: string | null;
  vendor_name: string | null;
  amount: number;
  gst_amount: number;
  total_amount: number;
  asset_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  classification: string | null;
  itc_eligible: boolean;
  cost_center_id: string | null;
  branch_id: string | null;
  project_id: string | null;
  items: unknown;
  capitalization_status: 'pending' | 'partial' | 'capitalized' | 'skipped' | 'not_applicable';
  capitalized_at: string | null;
  capitalized_by: string | null;
  assets_created_count: number;
}

export interface BillAssetLine {
  user_id: string;
  bill_id: string;
  bill_number: string;
  bill_date: string;
  vendor_id: string | null;
  vendor_name: string | null;
  line_id: string;
  line_index: number;
  description: string;
  hsn_sac: string | null;
  product_id: string | null;
  quantity: number;
  rate: number | null;
  amount: number;
  tax_rate: number | null;
  already_capitalized: boolean;
}

// ── Reads ──────────────────────────────────────────────────────────────────
export const listUncapitalizedBills = async (userId: string): Promise<UncapitalizedBill[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_uncapitalized_asset_bills' as any)
    .select('*')
    .eq('user_id', uid)
    .order('bill_date', { ascending: false });
  if (error) throw error;
  return (data || []) as UncapitalizedBill[];
};

export const listBillAssetLines = async (
  userId: string,
  billId: string,
): Promise<BillAssetLine[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_bill_asset_lines' as any)
    .select('*')
    .eq('user_id', uid)
    .eq('bill_id', billId)
    .order('line_index');
  if (error) throw error;
  return (data || []) as BillAssetLine[];
};

// ── Preview ────────────────────────────────────────────────────────────────
// What we'd create if capitalize() ran with no overrides. The UI uses this to
// render the table that the user then tweaks per-line.
export interface CapitalizationPreviewLine extends BillAssetLine {
  proposed_name: string;
  proposed_purchase_value: number;   // line taxable value
  proposed_gst_share: number;        // proportional GST allocation
  proposed_useful_life_years: number;
  proposed_depreciation_method: DepreciationMethod;
  proposed_salvage_value: number;
}

export const previewBillCapitalization = async (
  userId: string,
  billId: string,
): Promise<{ bill: UncapitalizedBill | null; lines: CapitalizationPreviewLine[] }> => {
  const uid = normalizeUserId(userId);

  const [{ data: billRow, error: billErr }, lines] = await Promise.all([
    supabase
      .from('v_uncapitalized_asset_bills' as any)
      .select('*')
      .eq('user_id', uid)
      .eq('bill_id', billId)
      .maybeSingle(),
    listBillAssetLines(uid, billId),
  ]);
  if (billErr) throw billErr;

  const bill = (billRow as UncapitalizedBill | null) || null;
  const billGst = Number(bill?.gst_amount || 0);
  const billTaxable = Number(bill?.amount || 0);

  const previews: CapitalizationPreviewLine[] = lines.map(line => {
    const gstShare = billTaxable > 0
      ? round2((Number(line.amount) / billTaxable) * billGst)
      : 0;
    return {
      ...line,
      proposed_name: line.description.slice(0, 100),
      proposed_purchase_value: round2(Number(line.amount) || 0),
      proposed_gst_share: gstShare,
      proposed_useful_life_years: 5,
      proposed_depreciation_method: 'SLM' as DepreciationMethod,
      proposed_salvage_value: 0,
    };
  });

  return { bill, lines: previews };
};

// ── Capitalize ─────────────────────────────────────────────────────────────
export interface CapitalizationLineInput {
  line_id: string;
  line_index: number;
  name: string;
  purchase_value: number;
  gst_amount?: number;
  cgst_amount?: number;
  sgst_amount?: number;
  igst_amount?: number;
  category_id?: string;
  useful_life_years?: number;
  depreciation_method?: DepreciationMethod;
  depreciation_rate?: number;
  salvage_value?: number;
  location?: string;
  custodian?: string;
  serial_number?: string;
  notes?: string;
}

export interface CapitalizationResult {
  bill_id: string;
  created: Array<{ asset: FixedAsset; reclassification_journal_id: string; schedule_rows: number }>;
  skipped: Array<{ line_id: string; reason: string }>;
}

export const capitalizeBillLines = async (
  userId: string,
  billId: string,
  lineInputs: CapitalizationLineInput[],
): Promise<CapitalizationResult> => {
  const uid = normalizeUserId(userId);

  const { data: billRow, error: billErr } = await supabase
    .from('purchase_bills' as any)
    .select('id, bill_number, bill_date, vendor_id, vendor_name, itc_eligible, cost_center_id, branch_id, project_id, gst_amount, cgst_amount, sgst_amount, igst_amount, amount')
    .eq('user_id', uid)
    .eq('id', billId)
    .maybeSingle();
  if (billErr) throw billErr;
  if (!billRow) throw new Error(`Purchase bill ${billId} not found.`);
  const bill = billRow as any;

  // Resolve the generic Fixed Assets account once — this is the credit leg of
  // the reclassification journal (cancels the debit posted by the original
  // bill journal).
  const genericFixedAssetsAccount = await getOrCreateAccount(
    uid,
    STANDARD_ACCOUNTS.FIXED_ASSETS.name,
    'Asset',
  );

  const created: CapitalizationResult['created'] = [];
  const skipped: CapitalizationResult['skipped'] = [];

  for (const input of lineInputs) {
    const purchaseValue = Number(input.purchase_value || 0);
    if (purchaseValue <= 0) {
      skipped.push({ line_id: input.line_id, reason: 'Purchase value must be > 0.' });
      continue;
    }

    // Pre-flight: is this bill line already a fixed asset? (Unique constraint
    // would also catch it, but we return a clean reason rather than a DB error.)
    const { data: existing } = await supabase
      .from('fixed_assets' as any)
      .select('id, asset_code')
      .eq('user_id', uid)
      .eq('source_bill_id', billId)
      .eq('source_bill_line_id', input.line_id)
      .maybeSingle();
    if (existing) {
      skipped.push({ line_id: input.line_id, reason: `Already capitalized as ${(existing as any).asset_code}.` });
      continue;
    }

    // Build the CreateAssetInput. We pass post_journal: false because the
    // bill's own journal already booked the AP credit + the generic Fixed
    // Assets debit + the input GST. We re-route the asset debit below via
    // the reclassification journal.
    const createInput: CreateAssetInput = {
      name: input.name || `Asset from ${bill.bill_number} L${input.line_index + 1}`,
      purchase_value: purchaseValue,
      gst_amount: Number(input.gst_amount || 0),
      cgst_amount: Number(input.cgst_amount || 0),
      sgst_amount: Number(input.sgst_amount || 0),
      igst_amount: Number(input.igst_amount || 0),
      itc_eligible: bill.itc_eligible !== false,
      purchase_date: bill.bill_date,
      vendor_id: bill.vendor_id || undefined,
      vendor_name: bill.vendor_name || undefined,
      category_id: input.category_id,
      useful_life_years: input.useful_life_years,
      depreciation_method: input.depreciation_method,
      depreciation_rate: input.depreciation_rate,
      salvage_value: input.salvage_value,
      location: input.location,
      branch_id: bill.branch_id || undefined,
      cost_center_id: bill.cost_center_id || undefined,
      custodian: input.custodian,
      serial_number: input.serial_number,
      source_type: 'purchase_bill',
      source_id: billId,
      source_bill_id: billId,
      source_bill_line_id: input.line_id,
      notes: input.notes || `Capitalized from bill ${bill.bill_number}, line ${input.line_index + 1}`,
      post_journal: false,
    };

    let result;
    try {
      result = await createFixedAsset(uid, createInput);
    } catch (err: any) {
      // Hit the UNIQUE (user_id, source_bill_id, source_bill_line_id) — race.
      if (err?.code === '23505' || /unique/i.test(String(err?.message))) {
        skipped.push({ line_id: input.line_id, reason: 'Already capitalized (concurrent run).' });
        continue;
      }
      throw err;
    }

    const asset = result.asset;

    // Post the reclassification journal:
    //   Dr Fixed Asset — <code> — <name>    (per-asset leaf account)
    //   Cr Fixed Assets                     (generic standard account)
    const lines: JournalLineInput[] = [
      {
        account_id: asset.asset_account_id!,
        debit: round2(purchaseValue),
        credit: 0,
        line_narration: `Capitalize ${asset.asset_code} — ${asset.name}`,
        vendor_id: bill.vendor_id || null,
        cost_center_id: bill.cost_center_id || null,
        project_id: bill.project_id || null,
        branch_id: bill.branch_id || null,
      },
      {
        account_id: genericFixedAssetsAccount,
        debit: 0,
        credit: round2(purchaseValue),
        line_narration: `Reclassify from generic Fixed Assets — bill ${bill.bill_number}`,
        vendor_id: bill.vendor_id || null,
      },
    ];

    const reclassJournalId = await postJournal({
      user_id: uid,
      date: bill.bill_date,
      narration: `Asset capitalization: ${asset.asset_code} from bill ${bill.bill_number}`,
      source_type: 'asset_capitalization',
      source_id: asset.id,
      idempotency_key: `asset_capitalization:${asset.id}`,
      lines,
    });

    // Stash the journal id on the asset for traceability.
    await supabase
      .from('fixed_assets' as any)
      .update({ reclassification_journal_id: reclassJournalId })
      .eq('user_id', uid)
      .eq('id', asset.id);

    // Replace the generic 'purchase' lifecycle event the createFixedAsset
    // helper logged with a 'capitalization' event that points to our journal.
    await supabase
      .from('asset_transactions' as any)
      .update({
        transaction_type: 'capitalization',
        journal_id: reclassJournalId,
        notes: `Capitalized from bill ${bill.bill_number}, line ${input.line_index + 1}`,
      })
      .eq('user_id', uid)
      .eq('asset_id', asset.id)
      .eq('transaction_type', 'purchase');

    created.push({
      asset,
      reclassification_journal_id: reclassJournalId,
      schedule_rows: result.scheduleRows,
    });
  }

  return { bill_id: billId, created, skipped };
};

// ── Mark bill as 'do not capitalize' ───────────────────────────────────────
// Useful when a bill has asset_amount > 0 but the user decides those lines
// shouldn't actually become register entries (e.g. low-value consumables that
// were misclassified). Hides the bill from the queue.
export const markBillSkipped = async (userId: string, billId: string): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('purchase_bills' as any)
    .update({
      capitalization_status: 'skipped',
      capitalized_at: new Date().toISOString(),
      capitalized_by: uid,
    })
    .eq('user_id', uid)
    .eq('id', billId);
  if (error) throw error;
};

export const unskipBill = async (userId: string, billId: string): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('purchase_bills' as any)
    .update({ capitalization_status: 'pending', capitalized_at: null, capitalized_by: null })
    .eq('user_id', uid)
    .eq('id', billId);
  if (error) throw error;
};

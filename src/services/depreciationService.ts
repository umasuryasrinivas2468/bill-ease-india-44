// ════════════════════════════════════════════════════════════════════════════
// Depreciation Engine
//
// - Generates the full monthly depreciation schedule for an asset using either
//   Straight Line Method (SLM) or Written Down Value (WDV).
// - Posts depreciation journals (Dr Depreciation Expense / Cr Accumulated
//   Depreciation) for due periods.
// - Allows preview (no DB writes) and manual override on a specific period.
// - Keeps fixed_assets.book_value & accumulated_depreciation in sync.
//
// Period granularity: monthly. The schedule prorates the first month from the
// purchase_date to month-end, so partial-month purchases don't over-depreciate.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type { FixedAsset, AssetDepreciationRow, DepreciationMethod } from '@/types/fixedAssets';

const round2 = (n: number) => Math.round(n * 100) / 100;

const lastDayOfMonth = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0);

const addMonths = (d: Date, months: number): Date => {
  const out = new Date(d.getFullYear(), d.getMonth() + months, 1);
  return out;
};

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

const fiscalYearOf = (d: Date): string => {
  // Indian FY: April-March
  const m = d.getMonth();
  const y = d.getFullYear();
  const startYear = m >= 3 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
};

// ── Period plan ─────────────────────────────────────────────────────────────
export interface DepreciationPeriod {
  periodIndex: number;
  periodStart: string;
  periodEnd: string;
  fiscalYear: string;
  openingBookValue: number;
  depreciationAmount: number;
  accumulatedAfter: number;
  closingBookValue: number;
}

/** Pure calculator — no DB. Used for preview and persistence. */
export const computeDepreciationPlan = (asset: {
  total_capitalised_value: number;
  salvage_value: number;
  useful_life_years: number;
  depreciation_method: DepreciationMethod;
  depreciation_rate?: number | null;
  purchase_date: string;
}): DepreciationPeriod[] => {
  if (asset.depreciation_method === 'None' || asset.useful_life_years <= 0) return [];

  const cost = asset.total_capitalised_value;
  const salvage = asset.salvage_value || 0;
  const depreciableBase = Math.max(0, cost - salvage);
  if (depreciableBase <= 0) return [];

  const totalMonths = Math.round(asset.useful_life_years * 12);
  if (totalMonths <= 0) return [];

  const purchaseDate = new Date(asset.purchase_date);
  const firstPeriodEnd = lastDayOfMonth(purchaseDate);
  // Days in the first month attributable to the asset (proration).
  const firstMonthTotalDays =
    new Date(purchaseDate.getFullYear(), purchaseDate.getMonth() + 1, 0).getDate();
  const firstMonthOwnedDays = firstMonthTotalDays - purchaseDate.getDate() + 1;
  const firstProrationFactor = firstMonthOwnedDays / firstMonthTotalDays;

  const periods: DepreciationPeriod[] = [];
  let bookValue = cost;
  let accumulated = 0;

  if (asset.depreciation_method === 'SLM') {
    const fullMonthly = depreciableBase / totalMonths;
    for (let i = 1; i <= totalMonths; i++) {
      const periodEnd =
        i === 1 ? firstPeriodEnd : lastDayOfMonth(addMonths(firstPeriodEnd, i - 1));
      const periodStart = i === 1 ? new Date(purchaseDate) : addMonths(firstPeriodEnd, i - 1);
      const proration = i === 1 ? firstProrationFactor : 1;
      let depAmt = round2(fullMonthly * proration);
      // Last period reconciles rounding drift and never takes BV below salvage.
      const remainingDepreciable = round2(bookValue - salvage);
      if (i === totalMonths || depAmt > remainingDepreciable) {
        depAmt = Math.max(0, remainingDepreciable);
      }
      accumulated = round2(accumulated + depAmt);
      const closing = round2(bookValue - depAmt);
      periods.push({
        periodIndex: i,
        periodStart: isoDate(periodStart),
        periodEnd: isoDate(periodEnd),
        fiscalYear: fiscalYearOf(periodEnd),
        openingBookValue: round2(bookValue),
        depreciationAmount: depAmt,
        accumulatedAfter: accumulated,
        closingBookValue: closing,
      });
      bookValue = closing;
      if (bookValue <= salvage + 0.01) break;
    }
  } else if (asset.depreciation_method === 'WDV') {
    const annualRate = (asset.depreciation_rate || 0) / 100;
    const monthlyRate = annualRate / 12;
    for (let i = 1; i <= totalMonths; i++) {
      const periodEnd =
        i === 1 ? firstPeriodEnd : lastDayOfMonth(addMonths(firstPeriodEnd, i - 1));
      const periodStart = i === 1 ? new Date(purchaseDate) : addMonths(firstPeriodEnd, i - 1);
      const proration = i === 1 ? firstProrationFactor : 1;
      let depAmt = round2(bookValue * monthlyRate * proration);
      // Never depreciate below salvage.
      const remainingDepreciable = round2(bookValue - salvage);
      if (depAmt > remainingDepreciable) depAmt = Math.max(0, remainingDepreciable);
      accumulated = round2(accumulated + depAmt);
      const closing = round2(bookValue - depAmt);
      periods.push({
        periodIndex: i,
        periodStart: isoDate(periodStart),
        periodEnd: isoDate(periodEnd),
        fiscalYear: fiscalYearOf(periodEnd),
        openingBookValue: round2(bookValue),
        depreciationAmount: depAmt,
        accumulatedAfter: accumulated,
        closingBookValue: closing,
      });
      bookValue = closing;
      if (bookValue <= salvage + 0.01) break;
    }
  }

  return periods;
};

// ── Persist a fresh schedule (replaces any planned rows for the asset) ──────
export const generateDepreciationSchedule = async (
  userId: string,
  assetId: string,
): Promise<number> => {
  const uid = normalizeUserId(userId);
  const { data: asset, error: aErr } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', assetId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!asset) throw new Error('Asset not found.');

  const periods = computeDepreciationPlan(asset as FixedAsset);
  if (periods.length === 0) return 0;

  // Wipe existing PLANNED rows (don't touch posted ones).
  await supabase
    .from('asset_depreciation_schedule')
    .delete()
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .eq('status', 'planned');

  const rows = periods.map((p) => ({
    user_id: uid,
    asset_id: assetId,
    period_index: p.periodIndex,
    period_start: p.periodStart,
    period_end: p.periodEnd,
    fiscal_year: p.fiscalYear,
    opening_book_value: p.openingBookValue,
    depreciation_amount: p.depreciationAmount,
    accumulated_after: p.accumulatedAfter,
    closing_book_value: p.closingBookValue,
    status: 'planned' as const,
  }));

  const { error } = await supabase.from('asset_depreciation_schedule').upsert(rows, {
    onConflict: 'asset_id,period_index',
  });
  if (error) throw error;
  return rows.length;
};

// ── Post a single period's depreciation journal ─────────────────────────────
export const postDepreciationForPeriod = async (
  userId: string,
  scheduleRowId: string,
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const { data: row, error } = await supabase
    .from('asset_depreciation_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('id', scheduleRowId)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('Depreciation period not found.');
  if (row.status === 'posted') return row.journal_id as string;
  if (row.depreciation_amount <= 0) {
    // Mark as skipped & return.
    await supabase
      .from('asset_depreciation_schedule')
      .update({ status: 'skipped' })
      .eq('id', scheduleRowId);
    return '';
  }

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', row.asset_id)
    .maybeSingle();
  if (!asset) throw new Error('Asset missing.');
  if (!asset.dep_expense_account_id || !asset.accum_dep_account_id) {
    throw new Error('Asset is missing linked depreciation accounts.');
  }

  const amount = Number(row.depreciation_amount);
  const lines: JournalLineInput[] = [
    {
      account_id: asset.dep_expense_account_id,
      debit: round2(amount),
      credit: 0,
      line_narration: `Depreciation — ${asset.asset_code} (${row.period_end})`,
      cost_center_id: asset.cost_center_id || null,
    },
    {
      account_id: asset.accum_dep_account_id,
      debit: 0,
      credit: round2(amount),
      line_narration: `Accumulated depreciation — ${asset.asset_code}`,
    },
  ];

  const journalId = await postJournal({
    user_id: uid,
    date: row.period_end,
    narration: `Depreciation for ${asset.name} (period ${row.period_index})`,
    source_type: 'depreciation',
    source_id: row.id,
    idempotency_key: `depreciation:${row.id}`,
    lines,
  });

  // Mark the row as posted & advance asset balances.
  await supabase
    .from('asset_depreciation_schedule')
    .update({
      status: 'posted',
      journal_id: journalId,
      posted_at: new Date().toISOString(),
      posted_by: uid,
    })
    .eq('id', scheduleRowId);

  await supabase
    .from('fixed_assets')
    .update({
      accumulated_depreciation: row.accumulated_after,
      book_value: row.closing_book_value,
      last_depreciated_through: row.period_end,
    })
    .eq('id', row.asset_id);

  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: row.asset_id,
    transaction_type: 'depreciation',
    transaction_date: row.period_end,
    amount,
    journal_id: journalId,
    notes: `Depreciation period ${row.period_index}`,
    created_by: uid,
  });

  return journalId;
};

// ── Bulk: post every planned period that's due (period_end <= asOf) ─────────
export interface BulkDepreciationResult {
  posted: number;
  skipped: number;
  totalAmount: number;
}

export const runDepreciationBatch = async (
  userId: string,
  asOf: string, // YYYY-MM-DD inclusive
  assetIds?: string[],
): Promise<BulkDepreciationResult> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_depreciation_schedule')
    .select('id, depreciation_amount, asset_id')
    .eq('user_id', uid)
    .eq('status', 'planned')
    .lte('period_end', asOf)
    .order('period_end');
  if (assetIds && assetIds.length > 0) q = q.in('asset_id', assetIds);

  const { data, error } = await q;
  if (error) throw error;

  let posted = 0;
  let skipped = 0;
  let total = 0;
  for (const r of data || []) {
    try {
      await postDepreciationForPeriod(uid, r.id);
      posted++;
      total += Number(r.depreciation_amount || 0);
    } catch (e) {
      console.warn('[depreciation] failed to post', r.id, e);
      skipped++;
    }
  }
  return { posted, skipped, totalAmount: round2(total) };
};

// ── Manual adjustment (override planned amount, regenerate downstream) ──────
export const adjustPlannedPeriod = async (
  userId: string,
  scheduleRowId: string,
  newAmount: number,
  note?: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data: row } = await supabase
    .from('asset_depreciation_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('id', scheduleRowId)
    .maybeSingle();
  if (!row) throw new Error('Period not found.');
  if (row.status === 'posted') throw new Error('Period is already posted.');

  await supabase
    .from('asset_depreciation_schedule')
    .update({
      depreciation_amount: round2(newAmount),
      accumulated_after: round2(row.opening_book_value - (row.opening_book_value - newAmount)),
      closing_book_value: round2(row.opening_book_value - newAmount),
      manual_override: true,
      notes: note || row.notes,
      status: 'adjusted',
    })
    .eq('id', scheduleRowId);
};

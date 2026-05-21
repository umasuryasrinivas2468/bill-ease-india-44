// ════════════════════════════════════════════════════════════════════════════
// Asset Revaluation Service (Module 7)
//
// Restates a fixed asset to its new fair value using the **elimination method**:
//   1) Reset accumulated_depreciation to 0
//   2) Set total_capitalised_value (gross) = new_fair_value
//   3) Set book_value = new_fair_value
//   4) Regenerate the depreciation schedule against new (remaining) useful life
//
// Accounting split (Ind AS 16 / AS 10):
//   Upward (delta = new_fair_value − book_value > 0):
//     - First REVERSE prior loss recorded in P&L (Cr Revaluation Gain)
//     - Surplus → Cr Revaluation Reserve (Equity)
//   Downward (delta < 0, magnitude = |delta|):
//     - First ABSORB against existing reserve on this asset (Dr Reserve)
//     - Deficit → Dr Revaluation Loss (Expense)
//
// Journal (asset side, elimination method):
//   Dr Accumulated Depreciation     (= prior accum_dep)
//   Dr or Cr Asset Account          (= new_fair_value − prior gross)
//   ↳ net debit on asset side = delta
//   plus the matched equity / P&L lines on the other side.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import { generateDepreciationSchedule } from '@/services/depreciationService';
import type {
  AssetRevaluation,
  RevaluationPreview,
  RevalueAssetInput,
} from '@/types/assetRevaluation';
import type { FixedAsset } from '@/types/fixedAssets';

const round2 = (n: number) => Math.round(n * 100) / 100;

const REVALUATION_RESERVE_ACCOUNT = 'Revaluation Reserve';
const REVALUATION_LOSS_ACCOUNT    = 'Revaluation Loss';
const REVALUATION_GAIN_ACCOUNT    = 'Revaluation Gain';

// ── Reads ───────────────────────────────────────────────────────────────────
export const listRevaluations = async (
  userId: string,
  assetId?: string,
): Promise<AssetRevaluation[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_revaluations')
    .select('*')
    .eq('user_id', uid)
    .order('revaluation_date', { ascending: false });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetRevaluation[];
};

// ── Pure split (no DB) — used by UI preview ─────────────────────────────────
export const computeRevaluationSplit = (
  prevBookValue: number,
  newFairValue: number,
  currentReserveBalance: number,
  currentCumulativeLoss: number,
): RevaluationPreview => {
  const prev = round2(prevBookValue);
  const next = round2(newFairValue);
  const delta = round2(next - prev);
  const direction = delta >= 0 ? 'upward' : 'downward';

  let reserve_impact = 0;
  let pl_impact = 0;

  if (delta > 0) {
    const reversal = Math.min(delta, currentCumulativeLoss);
    pl_impact = round2(reversal);
    reserve_impact = round2(delta - reversal);
  } else if (delta < 0) {
    const mag = -delta;
    const absorb = Math.min(mag, currentReserveBalance);
    reserve_impact = round2(-absorb);
    pl_impact = round2(-(mag - absorb));
  }

  return {
    prev_book_value: prev,
    new_fair_value: next,
    delta,
    direction,
    reserve_impact,
    pl_impact,
    current_reserve_balance: round2(currentReserveBalance),
    current_cumulative_loss: round2(currentCumulativeLoss),
  };
};

export const previewRevaluation = async (
  userId: string,
  assetId: string,
  newFairValue: number,
): Promise<RevaluationPreview> => {
  const uid = normalizeUserId(userId);
  const { data: asset, error } = await supabase
    .from('fixed_assets')
    .select('book_value, revaluation_reserve_balance, cumulative_revaluation_loss')
    .eq('user_id', uid)
    .eq('id', assetId)
    .maybeSingle();
  if (error) throw error;
  if (!asset) throw new Error('Asset not found.');
  return computeRevaluationSplit(
    Number((asset as any).book_value || 0),
    newFairValue,
    Number((asset as any).revaluation_reserve_balance || 0),
    Number((asset as any).cumulative_revaluation_loss || 0),
  );
};

// ── Perform revaluation ─────────────────────────────────────────────────────
export interface RevalueResult {
  revaluation: AssetRevaluation;
  journalId: string;
  scheduleRowsRegenerated: number;
}

export const revalueAsset = async (
  userId: string,
  input: RevalueAssetInput,
): Promise<RevalueResult> => {
  const uid = normalizeUserId(userId);

  const { data: assetRow, error: aErr } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assetRow) throw new Error('Asset not found.');
  const asset = assetRow as FixedAsset & {
    revaluation_reserve_balance?: number;
    cumulative_revaluation_loss?: number;
  };
  if (asset.status === 'disposed' || asset.status === 'written_off') {
    throw new Error(`Cannot revalue a ${asset.status} asset.`);
  }
  if (!asset.asset_account_id || !asset.accum_dep_account_id) {
    throw new Error('Asset is missing linked COA accounts — cannot post revaluation journal.');
  }

  const prevGross = round2(asset.total_capitalised_value);
  const prevAccum = round2(asset.accumulated_depreciation);
  const prevBook  = round2(prevGross - prevAccum);
  const newFV     = round2(input.new_fair_value);
  const delta     = round2(newFV - prevBook);

  if (Math.abs(delta) < 0.01) {
    throw new Error('New fair value matches current book value — no revaluation needed.');
  }

  const reserveBal = round2(Number(asset.revaluation_reserve_balance || 0));
  const cumulLoss  = round2(Number(asset.cumulative_revaluation_loss  || 0));
  const split = computeRevaluationSplit(prevBook, newFV, reserveBal, cumulLoss);

  const direction = split.direction;
  const reserveImpact = split.reserve_impact; // +ve credit, -ve debit
  const plImpact = split.pl_impact;           // +ve credit (gain), -ve debit (loss)

  // Asset-side journal lines (elimination method)
  const lines: JournalLineInput[] = [];
  if (prevAccum > 0) {
    lines.push({
      account_id: asset.accum_dep_account_id,
      debit: prevAccum,
      credit: 0,
      line_narration: `Release accumulated depreciation on ${asset.asset_code}`,
    });
  }
  const grossDelta = round2(newFV - prevGross);
  if (grossDelta > 0) {
    lines.push({
      account_id: asset.asset_account_id,
      debit: grossDelta,
      credit: 0,
      line_narration: `Revalue ${asset.asset_code} upward — restate gross to fair value`,
    });
  } else if (grossDelta < 0) {
    lines.push({
      account_id: asset.asset_account_id,
      debit: 0,
      credit: Math.abs(grossDelta),
      line_narration: `Revalue ${asset.asset_code} downward — restate gross to fair value`,
    });
  }

  // Equity / P&L offset
  if (direction === 'upward') {
    if (plImpact > 0) {
      const gainAcc = await getOrCreateAccount(uid, REVALUATION_GAIN_ACCOUNT, 'Income');
      lines.push({
        account_id: gainAcc,
        debit: 0,
        credit: round2(plImpact),
        line_narration: `Reverse prior revaluation loss — ${asset.asset_code}`,
      });
    }
    if (reserveImpact > 0) {
      const reserveAcc = await getOrCreateAccount(uid, REVALUATION_RESERVE_ACCOUNT, 'Equity');
      lines.push({
        account_id: reserveAcc,
        debit: 0,
        credit: round2(reserveImpact),
        line_narration: `Revaluation surplus to equity reserve — ${asset.asset_code}`,
      });
    }
  } else {
    const absorb = Math.abs(reserveImpact);   // positive amount debited to reserve
    const toPl   = Math.abs(plImpact);        // positive amount debited to loss
    if (absorb > 0) {
      const reserveAcc = await getOrCreateAccount(uid, REVALUATION_RESERVE_ACCOUNT, 'Equity');
      lines.push({
        account_id: reserveAcc,
        debit: absorb,
        credit: 0,
        line_narration: `Absorb downward revaluation against reserve — ${asset.asset_code}`,
      });
    }
    if (toPl > 0) {
      const lossAcc = await getOrCreateAccount(uid, REVALUATION_LOSS_ACCOUNT, 'Expense');
      lines.push({
        account_id: lossAcc,
        debit: toPl,
        credit: 0,
        line_narration: `Revaluation loss to P&L — ${asset.asset_code}`,
      });
    }
  }

  // Post the journal
  const journalId = await postJournal({
    user_id: uid,
    date: input.revaluation_date,
    narration: `Revaluation (${direction}): ${asset.asset_code} ${asset.name} — ${prevBook} → ${newFV}`,
    source_type: 'asset_revaluation',
    source_id: asset.id,
    idempotency_key: `asset_revaluation:${asset.id}:${input.revaluation_date}:${newFV}`,
    lines,
  });

  // Compute new reserve / cumulative-loss balances
  let newReserveBalance = reserveBal;
  let newCumulativeLoss = cumulLoss;
  if (direction === 'upward') {
    newCumulativeLoss = round2(cumulLoss - plImpact);     // pl_impact is +ve (reversal)
    newReserveBalance = round2(reserveBal + reserveImpact); // reserve_impact is +ve
  } else {
    newReserveBalance = round2(reserveBal + reserveImpact);            // reserve_impact is -ve (decrease)
    newCumulativeLoss = round2(cumulLoss + Math.abs(plImpact));         // pl_impact is -ve (new loss)
  }
  newReserveBalance = Math.max(0, newReserveBalance);
  newCumulativeLoss = Math.max(0, newCumulativeLoss);

  // Insert revaluation event log
  const remainingLife = round2(
    input.remaining_useful_life_years ?? asset.useful_life_years,
  );
  const { data: revRow, error: rErr } = await supabase
    .from('asset_revaluations')
    .insert({
      user_id: uid,
      asset_id: asset.id,
      revaluation_date: input.revaluation_date,
      direction,
      prev_gross_value: prevGross,
      prev_accumulated_depreciation: prevAccum,
      prev_book_value: prevBook,
      new_fair_value: newFV,
      revaluation_amount: Math.abs(delta),
      reserve_impact: reserveImpact,
      pl_impact: plImpact,
      remaining_useful_life_years: remainingLife,
      valuer_name: input.valuer_name || null,
      valuer_contact: input.valuer_contact || null,
      method: input.method || null,
      reason: input.reason || null,
      document_url: input.document_url || null,
      notes: input.notes || null,
      journal_id: journalId,
      created_by: uid,
    })
    .select('*')
    .single();
  if (rErr) throw rErr;

  // Restate the asset (elimination method)
  await supabase
    .from('fixed_assets')
    .update({
      total_capitalised_value: newFV,
      purchase_value: newFV,                  // align so future regen uses correct base
      gst_amount: 0,                          // GST already settled
      accumulated_depreciation: 0,
      book_value: newFV,
      useful_life_years: remainingLife,
      last_revalued_on: input.revaluation_date,
      capitalised_on: input.revaluation_date, // depreciation start from revaluation date
      purchase_date: input.revaluation_date,  // used by depreciation engine as origin
      revaluation_reserve_balance: newReserveBalance,
      cumulative_revaluation_loss: newCumulativeLoss,
    })
    .eq('user_id', uid)
    .eq('id', asset.id);

  // Lifecycle event
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: asset.id,
    transaction_type: 'revaluation',
    transaction_date: input.revaluation_date,
    amount: delta,
    journal_id: journalId,
    notes: `Revalued ${direction} from ${prevBook} to ${newFV}`,
    created_by: uid,
  });

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: asset.id,
    action: 'revalued',
    before_state: { gross: prevGross, accum: prevAccum, book: prevBook, reserve: reserveBal, cumulative_loss: cumulLoss } as Record<string, unknown>,
    after_state: { gross: newFV, accum: 0, book: newFV, reserve: newReserveBalance, cumulative_loss: newCumulativeLoss } as Record<string, unknown>,
    actor: uid,
  });

  // Regenerate depreciation schedule on the new book value
  let scheduleRowsRegenerated = 0;
  if (asset.depreciation_method !== 'None' && remainingLife > 0) {
    scheduleRowsRegenerated = await generateDepreciationSchedule(uid, asset.id);
  }

  return { revaluation: revRow as AssetRevaluation, journalId, scheduleRowsRegenerated };
};

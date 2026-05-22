// ════════════════════════════════════════════════════════════════════════════
// Asset Disposal Service (Module 9)
//
// disposeFixedAsset(): direct disposal — computes profit/loss and posts:
//   Dr Bank / Cash                                  (sale proceeds + GST collected)
//   Dr Accumulated Depreciation                      (release accum)
//   Cr Fixed Asset                                   (gross capitalised value)
//   Cr Output GST                                    (when gst_amount > 0)
//   Cr Profit on Asset Sale   (Income)               if profit > 0
//   Dr Loss on Asset Sale     (Expense)              if loss  > 0
//
// Three-stage approval flow:
//   requestDisposal()   → creates a pending row
//   approveDisposal()   → invokes disposeFixedAsset() with locked-in values
//   rejectDisposal()    → marks request rejected; asset unaffected
//
// 'scrap_value' is captured as info on the asset (residual recovered parts).
// 'disposal_type' classifies the event (sale / scrap / donation / etc.).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import {
  getOrCreateAccount,
  postJournal,
  resolveCustomerReceivableAccount,
  STANDARD_ACCOUNTS,
  type JournalLineInput,
} from '@/utils/journalEngine';
import { isIntraState, splitGst, gstinStateCode, STATE_CODE_MAP } from '@/lib/gstHelpers';
import type { FixedAsset } from '@/types/fixedAssets';
import type {
  AssetDisposalRequest,
  AssetDisposalRequestEnriched,
  CreateDisposalRequestInput,
  DisposalType,
  DisposalPaymentMode,
} from '@/types/assetDisposal';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DisposalInput {
  asset_id: string;
  disposal_date: string;
  sale_proceeds: number;
  /** 'bank'/'cash' → settle immediately; 'credit' → route through AR. */
  payment_mode?: DisposalPaymentMode;
  reason?: string;
  /** When true, no proceeds collected — full write-off. */
  write_off?: boolean;
  notes?: string;
  /** Classification of the disposal — defaults to 'sale' (or 'write_off' if write_off=true). */
  disposal_type?: DisposalType;
  /** Output GST collected on the sale (when applicable). */
  gst_amount?: number;
  gst_rate?: number;
  /** Scrap / salvaged-parts value recovered separately. Stored as metadata, not journalled. */
  scrap_value?: number;
  buyer_name?: string;
  /** When buyer is GST-registered: split CGST/SGST vs IGST resolves from the state code. */
  buyer_gstin?: string;
  /** Free-text place-of-supply name; used when buyer_gstin is absent. */
  place_of_supply?: string;
  /** Linked registered customer — when set, AR routes to their sub-ledger account. */
  customer_id?: string;
  /** When set, links the disposal to a previously-approved request and stamps it 'completed'. */
  request_id?: string;
}

export interface DisposalResult {
  asset: FixedAsset;
  journalId: string;
  profitLoss: number;
  gstSplit: { cgst: number; sgst: number; igst: number; intra_state: boolean | null };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fetchBusinessGstin = async (uid: string): Promise<string | null> => {
  const { data } = await supabase
    .from('user_settings' as any)
    .select('gst_number, gstin, business_gstin')
    .eq('user_id', uid)
    .maybeSingle();
  const row = data as any;
  return (row?.gst_number || row?.gstin || row?.business_gstin || null) as string | null;
};

const fetchClientGstin = async (
  uid: string,
  customerId: string,
): Promise<{ gstin: string | null; state: string | null }> => {
  const { data } = await supabase
    .from('clients')
    .select('gst_number, state')
    .eq('user_id', uid)
    .eq('id', customerId)
    .maybeSingle();
  const row = data as any;
  return { gstin: row?.gst_number || null, state: row?.state || null };
};

/**
 * Resolve intra-state-ness for a disposal. Priority order:
 *   1. buyer_gstin vs business_gstin (most reliable — state codes built in)
 *   2. place_of_supply vs business_state (text comparison fallback)
 *   3. default: intra-state (single-state operations is the common case)
 */
const resolveIntraState = async (
  uid: string,
  buyerGstin: string | null,
  placeOfSupply: string | null,
): Promise<boolean> => {
  const businessGstin = await fetchBusinessGstin(uid);
  const fromGstin = isIntraState(businessGstin, buyerGstin);
  if (fromGstin !== null) return fromGstin;

  if (placeOfSupply && businessGstin) {
    const businessState = STATE_CODE_MAP[gstinStateCode(businessGstin) || ''];
    if (businessState) {
      return businessState.toLowerCase() === placeOfSupply.trim().toLowerCase();
    }
  }
  return true; // default intra-state
};

export const disposeFixedAsset = async (
  userId: string,
  input: DisposalInput,
): Promise<DisposalResult> => {
  const uid = normalizeUserId(userId);

  const { data: assetRow, error: aErr } = await supabase
    .from('fixed_assets')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assetRow) throw new Error('Asset not found.');
  const asset = assetRow as FixedAsset;
  if (asset.status === 'disposed' || asset.status === 'written_off') {
    throw new Error('Asset is already disposed.');
  }
  if (!asset.asset_account_id || !asset.accum_dep_account_id) {
    throw new Error('Asset is missing linked COA accounts — cannot post disposal journal.');
  }

  const grossValue = round2(asset.total_capitalised_value);
  const accumDep = round2(asset.accumulated_depreciation);
  const bookValue = round2(grossValue - accumDep);
  const proceeds = input.write_off ? 0 : round2(input.sale_proceeds || 0);
  const gstAmount = input.write_off ? 0 : round2(input.gst_amount || 0);
  const profitLoss = round2(proceeds - bookValue);
  const disposalType: DisposalType = input.disposal_type || (input.write_off ? 'write_off' : 'sale');
  const paymentMode: DisposalPaymentMode = input.payment_mode || 'bank';

  // Resolve buyer GSTIN / state for GST split. When customer_id is set, prefer
  // the client's recorded GSTIN — keeps the AR sub-ledger and GST treatment
  // consistent without forcing the user to re-enter it on every disposal.
  let buyerGstin = input.buyer_gstin || null;
  let placeOfSupply = input.place_of_supply || null;
  if (!buyerGstin && input.customer_id) {
    const fromClient = await fetchClientGstin(uid, input.customer_id);
    buyerGstin   = buyerGstin || fromClient.gstin;
    placeOfSupply = placeOfSupply || fromClient.state;
  }
  const intraState = gstAmount > 0
    ? await resolveIntraState(uid, buyerGstin, placeOfSupply)
    : null;
  const gstSplit = gstAmount > 0 && intraState !== null
    ? splitGst(gstAmount, intraState)
    : { cgst: 0, sgst: 0, igst: 0 };

  // Build the journal
  const lines: JournalLineInput[] = [];

  // Debit side of proceeds. Credit-mode disposals settle through AR; cash/bank
  // disposals settle immediately. GST collected rides with proceeds either way.
  const inflowTotal = round2(proceeds + gstAmount);
  if (inflowTotal > 0) {
    if (paymentMode === 'credit') {
      const arAcc = await resolveCustomerReceivableAccount(uid, input.customer_id || null);
      lines.push({
        account_id: arAcc,
        debit: inflowTotal,
        credit: 0,
        line_narration: `Receivable from ${input.buyer_name || 'buyer'} — sale of ${asset.asset_code}`,
        customer_id: input.customer_id,
      });
    } else {
      const bankName = paymentMode === 'cash' ? 'Cash' : 'Bank';
      const bankAcc = await getOrCreateAccount(uid, bankName, 'Asset');
      lines.push({
        account_id: bankAcc,
        debit: inflowTotal,
        credit: 0,
        line_narration: `Sale proceeds (incl. GST) for ${asset.name}`,
      });
    }
  }

  // Release accumulated depreciation (Dr)
  if (accumDep > 0) {
    lines.push({
      account_id: asset.accum_dep_account_id,
      debit: accumDep,
      credit: 0,
      line_narration: `Reverse accumulated depreciation on ${asset.asset_code}`,
    });
  }

  // Remove the asset at gross value (Cr)
  lines.push({
    account_id: asset.asset_account_id,
    debit: 0,
    credit: grossValue,
    line_narration: `Reverse fixed asset ${asset.asset_code}`,
  });

  // Output GST — split into CGST+SGST (intra-state) or IGST (inter-state).
  // Falls back to a single 'Output GST' line when state can't be determined.
  if (gstAmount > 0) {
    if (gstSplit.cgst > 0 || gstSplit.sgst > 0 || gstSplit.igst > 0) {
      if (gstSplit.cgst > 0) {
        const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.CGST_OUTPUT.name, 'Liability');
        lines.push({
          account_id: id,
          debit: 0,
          credit: gstSplit.cgst,
          line_narration: `CGST output on disposal of ${asset.asset_code}`,
          tax_type: 'cgst',
        });
      }
      if (gstSplit.sgst > 0) {
        const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.SGST_OUTPUT.name, 'Liability');
        lines.push({
          account_id: id,
          debit: 0,
          credit: gstSplit.sgst,
          line_narration: `SGST output on disposal of ${asset.asset_code}`,
          tax_type: 'sgst',
        });
      }
      if (gstSplit.igst > 0) {
        const id = await getOrCreateAccount(uid, STANDARD_ACCOUNTS.IGST_OUTPUT.name, 'Liability');
        lines.push({
          account_id: id,
          debit: 0,
          credit: gstSplit.igst,
          line_narration: `IGST output on disposal of ${asset.asset_code}`,
          tax_type: 'igst',
        });
      }
    } else {
      const outputGstAcc = await getOrCreateAccount(uid, 'Output GST', 'Liability');
      lines.push({
        account_id: outputGstAcc,
        debit: 0,
        credit: gstAmount,
        line_narration: `Output GST on disposal of ${asset.asset_code}`,
        tax_type: 'output_gst',
      });
    }
  }

  // Plug with Profit / Loss account
  if (profitLoss > 0) {
    const profitAcc = await getOrCreateAccount(uid, 'Profit on Asset Sale', 'Income');
    lines.push({
      account_id: profitAcc,
      debit: 0,
      credit: profitLoss,
      line_narration: 'Profit on asset disposal',
    });
  } else if (profitLoss < 0) {
    const lossAcc = await getOrCreateAccount(uid, 'Loss on Asset Sale', 'Expense');
    lines.push({
      account_id: lossAcc,
      debit: Math.abs(profitLoss),
      credit: 0,
      line_narration: 'Loss on asset disposal',
    });
  }

  const journalId = await postJournal({
    user_id: uid,
    date: input.disposal_date,
    narration: input.write_off
      ? `Asset write-off: ${asset.asset_code} — ${asset.name}`
      : `Asset disposal: ${asset.asset_code} — ${asset.name}`,
    source_type: input.write_off ? 'asset_write_off' : 'asset_disposal',
    source_id: asset.id,
    idempotency_key: `${input.write_off ? 'asset_write_off' : 'asset_disposal'}:${asset.id}`,
    lines,
  });

  // Update the asset row
  const newStatus = input.write_off ? 'written_off' : 'disposed';
  const { data: updated, error: uErr } = await supabase
    .from('fixed_assets')
    .update({
      status: newStatus,
      disposed_at: input.disposal_date,
      disposal_amount: proceeds,
      profit_loss_on_disposal: profitLoss,
      book_value: 0,
      disposal_reason: input.reason || null,
      disposal_type: disposalType,
      scrap_value: input.scrap_value ?? null,
      disposal_gst_amount: gstAmount || 0,
      disposal_gst_rate: input.gst_rate ?? null,
      disposal_buyer_name: input.buyer_name || null,
      disposal_buyer_gstin: buyerGstin,
      disposal_place_of_supply: placeOfSupply,
      disposal_customer_id: input.customer_id || null,
      disposal_payment_mode: paymentMode,
      disposal_intra_state: intraState,
      disposal_cgst_amount: gstSplit.cgst,
      disposal_sgst_amount: gstSplit.sgst,
      disposal_igst_amount: gstSplit.igst,
    })
    .eq('id', asset.id)
    .select('*')
    .single();
  if (uErr) throw uErr;

  // Cancel remaining planned depreciation
  await supabase
    .from('asset_depreciation_schedule')
    .update({ status: 'skipped', notes: 'Cancelled: asset disposed' })
    .eq('asset_id', asset.id)
    .eq('status', 'planned');

  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: asset.id,
    transaction_type: input.write_off ? 'write_off' : 'disposal',
    transaction_date: input.disposal_date,
    amount: proceeds,
    journal_id: journalId,
    notes: input.notes || input.reason || null,
    created_by: uid,
  });

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: asset.id,
    action: input.write_off ? 'write_off' : 'disposed',
    before_state: asset as unknown as Record<string, unknown>,
    after_state: updated as unknown as Record<string, unknown>,
    actor: uid,
  });

  // If this disposal came from an approved request, mark the request 'completed'
  if (input.request_id) {
    await supabase
      .from('asset_disposal_requests')
      .update({ status: 'completed', disposal_journal_id: journalId })
      .eq('user_id', uid)
      .eq('id', input.request_id);
  }

  return {
    asset: updated as FixedAsset,
    journalId,
    profitLoss,
    gstSplit: { ...gstSplit, intra_state: intraState },
  };
};


// ════════════════════════════════════════════════════════════════════════════
// Disposal approval workflow
// ════════════════════════════════════════════════════════════════════════════

export const listDisposalRequests = async (
  userId: string,
  status?: 'pending' | 'approved' | 'rejected' | 'completed' | 'cancelled',
): Promise<AssetDisposalRequestEnriched[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('v_disposal_requests_enriched')
    .select('*')
    .eq('user_id', uid)
    .order('requested_on', { ascending: false });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetDisposalRequestEnriched[];
};

export const getDisposalRequest = async (
  userId: string,
  id: string,
): Promise<AssetDisposalRequest | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_disposal_requests')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetDisposalRequest) || null;
};

export const requestDisposal = async (
  userId: string,
  input: CreateDisposalRequestInput,
): Promise<AssetDisposalRequest> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);

  // No duplicate pending request on the same asset
  const { data: dupes } = await supabase
    .from('asset_disposal_requests')
    .select('id')
    .eq('user_id', uid)
    .eq('asset_id', input.asset_id)
    .in('status', ['pending', 'approved']);
  if (dupes && dupes.length > 0) {
    throw new Error('A pending or approved disposal request already exists for this asset.');
  }

  // Pre-compute the proposed GST split so the approver sees exactly what will
  // post — even if the asset's terminal state isn't yet known.
  const proposedGst = round2(input.proposed_gst_amount || 0);
  let proposedIntra: boolean | null = null;
  let proposedSplit = { cgst: 0, sgst: 0, igst: 0 };
  if (proposedGst > 0) {
    let buyerGstin = input.buyer_gstin || null;
    let placeOfSupply = input.place_of_supply || input.buyer_state || null;
    if (!buyerGstin && input.customer_id) {
      const c = await fetchClientGstin(uid, input.customer_id);
      buyerGstin    = buyerGstin    || c.gstin;
      placeOfSupply = placeOfSupply || c.state;
    }
    proposedIntra = await resolveIntraState(uid, buyerGstin, placeOfSupply);
    proposedSplit = splitGst(proposedGst, proposedIntra);
  }

  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    disposal_type: input.disposal_type,
    reason: input.reason,
    proposed_disposal_date: input.proposed_disposal_date,
    proposed_sale_proceeds: round2(input.proposed_sale_proceeds || 0),
    proposed_scrap_value: round2(input.proposed_scrap_value || 0),
    proposed_gst_rate: input.proposed_gst_rate ?? null,
    proposed_gst_amount: proposedGst,
    proposed_cgst_amount: proposedSplit.cgst,
    proposed_sgst_amount: proposedSplit.sgst,
    proposed_igst_amount: proposedSplit.igst,
    proposed_intra_state: proposedIntra,
    payment_mode: input.payment_mode || 'bank',
    buyer_name: input.buyer_name || null,
    buyer_gstin: input.buyer_gstin || null,
    buyer_state: input.buyer_state || null,
    place_of_supply: input.place_of_supply || null,
    customer_id: input.customer_id || null,
    document_url: input.document_url || null,
    notes: input.notes || null,
    status: 'pending' as const,
    requested_by: uid,
    requested_on: today,
  };
  const { data, error } = await supabase
    .from('asset_disposal_requests')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetDisposalRequest;
};

export interface ApproveDisposalResult {
  request: AssetDisposalRequest;
  asset: FixedAsset;
  journalId: string;
  profitLoss: number;
}

export const approveDisposal = async (
  userId: string,
  id: string,
): Promise<ApproveDisposalResult> => {
  const uid = normalizeUserId(userId);
  const req = await getDisposalRequest(uid, id);
  if (!req) throw new Error('Disposal request not found.');
  if (req.status !== 'pending') throw new Error(`Cannot approve a ${req.status} request.`);
  const today = new Date().toISOString().slice(0, 10);

  // Stamp approved first (so the disposeFixedAsset call can pick up the linkage)
  const { data: approvedRow, error: aErr } = await supabase
    .from('asset_disposal_requests')
    .update({ status: 'approved', approver: uid, approved_on: today })
    .eq('user_id', uid)
    .eq('id', req.id)
    .select('*')
    .single();
  if (aErr) throw aErr;
  const approved = approvedRow as AssetDisposalRequest;

  // Execute the disposal using the locked-in values
  const disposalResult = await disposeFixedAsset(uid, {
    asset_id: approved.asset_id,
    disposal_date: approved.proposed_disposal_date,
    sale_proceeds: approved.proposed_sale_proceeds,
    gst_amount: approved.proposed_gst_amount,
    gst_rate: approved.proposed_gst_rate ?? undefined,
    scrap_value: approved.proposed_scrap_value,
    disposal_type: approved.disposal_type,
    write_off: approved.disposal_type === 'write_off',
    payment_mode: approved.payment_mode,
    buyer_name: approved.buyer_name ?? undefined,
    buyer_gstin: approved.buyer_gstin ?? undefined,
    place_of_supply: approved.place_of_supply ?? approved.buyer_state ?? undefined,
    customer_id: approved.customer_id ?? undefined,
    reason: approved.reason,
    notes: approved.notes ?? undefined,
    request_id: approved.id,
  });

  return {
    request: { ...approved, status: 'completed', disposal_journal_id: disposalResult.journalId },
    asset: disposalResult.asset,
    journalId: disposalResult.journalId,
    profitLoss: disposalResult.profitLoss,
  };
};

export const rejectDisposal = async (
  userId: string,
  id: string,
  reason: string,
): Promise<AssetDisposalRequest> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('asset_disposal_requests')
    .update({
      status: 'rejected',
      approver: uid,
      approved_on: today,
      rejection_reason: reason,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetDisposalRequest;
};

export const cancelDisposalRequest = async (
  userId: string,
  id: string,
): Promise<AssetDisposalRequest> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_disposal_requests')
    .update({ status: 'cancelled' })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetDisposalRequest;
};

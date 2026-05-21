// ════════════════════════════════════════════════════════════════════════════
// Asset Transfer Service (Module 3)
//
// Records branch / department / location / custodian / cost-center transfers
// of fixed assets. On 'completed' status:
//   1) snapshots current values into the from_* columns
//   2) updates fixed_assets.{branch_id, department, location, custodian,
//      cost_center_id} to the target values
//   3) inserts an asset_transactions row (transaction_type='transfer')
//   4) inserts an asset_audit_log row
//   5) optionally posts a memorandum journal that retags the book value to
//      the new cost-centre / branch (same account, different cost_center_id
//      on each side — net zero account impact, but cost-centre slices align)
//
// 'asset_transfer' is already in the journals.source_type CHECK from the
// earlier fixed-assets migration.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  AssetTransfer,
  AssetTransferEnriched,
  CreateTransferInput,
  TransferStatus,
} from '@/types/assetTransfer';

const round2 = (n: number) => Math.round(n * 100) / 100;

export const listAssetTransfers = async (
  userId: string,
  filters?: { assetId?: string; status?: TransferStatus },
): Promise<AssetTransferEnriched[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('v_asset_transfers_enriched')
    .select('*')
    .eq('user_id', uid)
    .order('transfer_date', { ascending: false });
  if (filters?.assetId) q = q.eq('asset_id', filters.assetId);
  if (filters?.status) q = q.eq('status', filters.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetTransferEnriched[];
};

export const getAssetTransfer = async (
  userId: string,
  id: string,
): Promise<AssetTransfer | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_transfers')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetTransfer) || null;
};

export interface CreateTransferResult {
  transfer: AssetTransfer;
  journalId: string | null;
  assetUpdated: boolean;
}

export const createAssetTransfer = async (
  userId: string,
  input: CreateTransferInput,
): Promise<CreateTransferResult> => {
  const uid = normalizeUserId(userId);

  // Snapshot the asset's current location/branch/etc so the from_* fields
  // reflect reality at transfer time.
  const { data: asset, error: assetErr } = await supabase
    .from('fixed_assets')
    .select('id, asset_code, name, book_value, asset_account_id, branch_id, location, custodian, cost_center_id, department')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (assetErr) throw assetErr;
  if (!asset) throw new Error('Asset not found.');

  const status: TransferStatus = input.status || 'completed';
  const isCompleted = status === 'completed';

  // No-op detection: if every relevant target equals the current value, refuse.
  const targets = {
    branch_id: input.to_branch_id ?? asset.branch_id,
    location: input.to_location ?? asset.location,
    custodian: input.to_custodian ?? asset.custodian,
    cost_center_id: input.to_cost_center_id ?? asset.cost_center_id,
    department: input.to_department ?? asset.department,
  };
  const nothingChanged =
    targets.branch_id === asset.branch_id &&
    targets.location === asset.location &&
    targets.custodian === asset.custodian &&
    targets.cost_center_id === asset.cost_center_id &&
    targets.department === asset.department;
  if (nothingChanged && isCompleted) {
    throw new Error('Nothing to transfer — target matches current values.');
  }

  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    transfer_type: input.transfer_type,
    from_branch_id: asset.branch_id || null,
    from_location: asset.location || null,
    from_custodian: asset.custodian || null,
    from_cost_center_id: asset.cost_center_id || null,
    from_department: (asset as any).department || null,
    to_branch_id: targets.branch_id || null,
    to_location: targets.location || null,
    to_custodian: targets.custodian || null,
    to_cost_center_id: targets.cost_center_id || null,
    to_department: targets.department || null,
    transfer_date: input.transfer_date,
    status,
    requested_by: uid,
    approved_by: isCompleted ? uid : null,
    approved_on: isCompleted ? input.transfer_date : null,
    reason: input.reason || null,
    notes: input.notes || null,
    document_url: input.document_url || null,
    created_by: uid,
  };

  const { data: xferRow, error: xferErr } = await supabase
    .from('asset_transfers')
    .insert(payload)
    .select('*')
    .single();
  if (xferErr) throw xferErr;
  let transfer = xferRow as AssetTransfer;

  // Only mutate the asset + ledger if we're completing immediately.
  let journalId: string | null = null;
  let assetUpdated = false;
  if (isCompleted) {
    await applyTransferEffects(uid, asset, transfer);
    assetUpdated = true;

    if (input.post_journal && asset.book_value > 0 && asset.asset_account_id) {
      journalId = await postTransferMemoJournal(uid, asset, transfer);
      const { data: updated, error: upErr } = await supabase
        .from('asset_transfers')
        .update({ journal_id: journalId })
        .eq('user_id', uid)
        .eq('id', transfer.id)
        .select('*')
        .single();
      if (upErr) throw upErr;
      transfer = updated as AssetTransfer;
    }
  }

  return { transfer, journalId, assetUpdated };
};

// Apply asset metadata change, log lifecycle + audit rows.
const applyTransferEffects = async (
  userId: string,
  asset: any,
  transfer: AssetTransfer,
): Promise<void> => {
  const uid = normalizeUserId(userId);

  // 1) Update fixed_assets metadata
  const { error: upErr } = await supabase
    .from('fixed_assets')
    .update({
      branch_id: transfer.to_branch_id,
      location: transfer.to_location,
      custodian: transfer.to_custodian,
      cost_center_id: transfer.to_cost_center_id,
      department: transfer.to_department,
    })
    .eq('user_id', uid)
    .eq('id', transfer.asset_id);
  if (upErr) throw upErr;

  // 2) Log on asset_transactions
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: transfer.asset_id,
    transaction_type: 'transfer',
    transaction_date: transfer.transfer_date,
    amount: asset.book_value,
    from_location: transfer.from_location,
    to_location: transfer.to_location,
    journal_id: transfer.journal_id || null,
    notes: `Transfer (${transfer.transfer_type})${transfer.reason ? ' — ' + transfer.reason : ''}`,
    created_by: uid,
  });

  // 3) Append to asset_audit_log
  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: transfer.asset_id,
    action: 'transferred',
    before_state: {
      branch_id: transfer.from_branch_id,
      location: transfer.from_location,
      custodian: transfer.from_custodian,
      cost_center_id: transfer.from_cost_center_id,
      department: transfer.from_department,
    } as Record<string, unknown>,
    after_state: {
      branch_id: transfer.to_branch_id,
      location: transfer.to_location,
      custodian: transfer.to_custodian,
      cost_center_id: transfer.to_cost_center_id,
      department: transfer.to_department,
    } as Record<string, unknown>,
    actor: uid,
  });
};

// Memorandum journal that retags the asset's book value across cost centres
// / branches. Net zero account-level impact; cost-centre sliced reports get
// the move correctly.
const postTransferMemoJournal = async (
  userId: string,
  asset: any,
  transfer: AssetTransfer,
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const amount = round2(Number(asset.book_value || 0));
  const lines: JournalLineInput[] = [
    {
      account_id: asset.asset_account_id,
      debit: amount,
      credit: 0,
      line_narration: `Asset retagged — to ${transfer.to_cost_center_id || transfer.to_branch_id || transfer.to_location || 'new tag'}`,
      cost_center_id: transfer.to_cost_center_id || null,
      branch_id: transfer.to_branch_id || null,
    },
    {
      account_id: asset.asset_account_id,
      debit: 0,
      credit: amount,
      line_narration: `Asset retagged — from ${transfer.from_cost_center_id || transfer.from_branch_id || transfer.from_location || 'prior tag'}`,
      cost_center_id: transfer.from_cost_center_id || null,
      branch_id: transfer.from_branch_id || null,
    },
  ];

  return postJournal({
    user_id: uid,
    date: transfer.transfer_date,
    narration: `Asset transfer (${transfer.transfer_type}): ${asset.asset_code} — ${asset.name}`,
    source_type: 'asset_transfer',
    source_id: transfer.id,
    idempotency_key: `asset_transfer:${transfer.id}`,
    lines,
  });
};

// ── Approval workflow ───────────────────────────────────────────────────────
export const approveTransfer = async (
  userId: string,
  id: string,
  approverNotes?: string,
): Promise<AssetTransfer> => {
  const uid = normalizeUserId(userId);
  const xfer = await getAssetTransfer(uid, id);
  if (!xfer) throw new Error('Transfer not found.');
  if (xfer.status !== 'pending_approval' && xfer.status !== 'draft') {
    throw new Error(`Cannot approve a transfer with status '${xfer.status}'.`);
  }

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, asset_code, name, book_value, asset_account_id, branch_id, location, custodian, cost_center_id, department')
    .eq('user_id', uid)
    .eq('id', xfer.asset_id)
    .maybeSingle();
  if (!asset) throw new Error('Asset not found.');

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('asset_transfers')
    .update({
      status: 'completed',
      approved_by: uid,
      approved_on: today,
      notes: approverNotes ?? xfer.notes,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  const completed = data as AssetTransfer;
  await applyTransferEffects(uid, asset, completed);
  return completed;
};

export const rejectTransfer = async (
  userId: string,
  id: string,
  reason: string,
): Promise<AssetTransfer> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_transfers')
    .update({ status: 'rejected', rejected_reason: reason, approved_by: uid })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetTransfer;
};

// ── Reversal ────────────────────────────────────────────────────────────────
// Creates a NEW transfer that swaps from/to of the original and marks the
// original 'reverted'. This preserves the full audit trail.
export const revertTransfer = async (
  userId: string,
  id: string,
  reason: string,
): Promise<AssetTransfer> => {
  const uid = normalizeUserId(userId);
  const original = await getAssetTransfer(uid, id);
  if (!original) throw new Error('Transfer not found.');
  if (original.status !== 'completed') {
    throw new Error(`Only completed transfers can be reverted (status: ${original.status}).`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const reversal = await createAssetTransfer(uid, {
    asset_id: original.asset_id,
    transfer_type: original.transfer_type,
    to_branch_id: original.from_branch_id || undefined,
    to_location: original.from_location || undefined,
    to_custodian: original.from_custodian || undefined,
    to_cost_center_id: original.from_cost_center_id || undefined,
    to_department: original.from_department || undefined,
    transfer_date: today,
    status: 'completed',
    reason: `Reverts ${original.id}: ${reason}`,
    post_journal: !!original.journal_id,
  });

  // Stamp the reverts_transfer_id + mark the original 'reverted'
  await supabase
    .from('asset_transfers')
    .update({ reverts_transfer_id: original.id })
    .eq('user_id', uid)
    .eq('id', reversal.transfer.id);
  await supabase
    .from('asset_transfers')
    .update({ status: 'reverted' })
    .eq('user_id', uid)
    .eq('id', original.id);

  return reversal.transfer;
};

// ── Branch-wise breakdown (used by dashboard) ───────────────────────────────
export interface BranchAssetBreakdown {
  branch_id: string | null;
  asset_count: number;
  total_book_value: number;
}

export const getBranchAssetBreakdown = async (
  userId: string,
): Promise<BranchAssetBreakdown[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('fixed_assets')
    .select('branch_id, book_value, status')
    .eq('user_id', uid)
    .in('status', ['active', 'transferred']);
  if (error) throw error;

  const byBranch = new Map<string | null, { count: number; value: number }>();
  for (const row of data || []) {
    const key = (row as any).branch_id ?? null;
    const prev = byBranch.get(key) || { count: 0, value: 0 };
    prev.count += 1;
    prev.value += Number((row as any).book_value || 0);
    byBranch.set(key, prev);
  }
  return [...byBranch.entries()].map(([branch_id, v]) => ({
    branch_id,
    asset_count: v.count,
    total_book_value: round2(v.value),
  }));
};

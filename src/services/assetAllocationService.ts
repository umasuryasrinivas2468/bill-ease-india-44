// ════════════════════════════════════════════════════════════════════════════
// Asset Allocation Service (Module 4)
//
// Issues and returns of assets to employees / teams / departments.
//
// On issue (createAllocation):
//   - inserts the allocation row (status = 'active')
//   - updates fixed_assets.custodian to the new holder
//   - inserts asset_transactions row (transaction_type='transfer' — reuses
//     the existing lifecycle event; allocation is a soft "in-hand" transfer)
//   - inserts asset_audit_log entry
//
// On return (returnAllocation):
//   - flips status based on condition_on_return
//     ('good'/'fair'/'new' -> 'returned';  'damaged' -> 'damaged';  'lost' -> 'lost')
//   - clears fixed_assets.custodian (or sets to next still-active holder)
//   - logs audit event
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import type {
  AssetAllocation,
  AssetAllocationSummary,
  CreateAllocationInput,
  EmployeeAllocationSummary,
  OverdueAllocation,
  ReturnAllocationInput,
  ReturnAllocationResult,
} from '@/types/assetAllocation';
import { disposeFixedAsset, postAssetImpairment } from '@/services/assetDisposalService';

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

// ── Reads ───────────────────────────────────────────────────────────────────
export const listAllocations = async (
  userId: string,
  filters?: { assetId?: string; employeeId?: string; statusIn?: string[] },
): Promise<AssetAllocation[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_allocations')
    .select('*')
    .eq('user_id', uid)
    .order('issued_on', { ascending: false });
  if (filters?.assetId) q = q.eq('asset_id', filters.assetId);
  if (filters?.employeeId) q = q.eq('employee_id', filters.employeeId);
  if (filters?.statusIn && filters.statusIn.length > 0) q = q.in('status', filters.statusIn);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetAllocation[];
};

export const getAllocation = async (
  userId: string,
  id: string,
): Promise<AssetAllocation | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_allocations')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetAllocation) || null;
};

export const getAssetAllocationSummary = async (
  userId: string,
  assetId: string,
): Promise<AssetAllocationSummary | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_allocation_summary')
    .select('*')
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetAllocationSummary) || null;
};

export const listEmployeeAllocationSummaries = async (
  userId: string,
): Promise<EmployeeAllocationSummary[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_employee_allocation_summary')
    .select('*')
    .eq('user_id', uid)
    .order('active_allocations', { ascending: false });
  if (error) throw error;
  return (data || []) as EmployeeAllocationSummary[];
};

export const listOverdueAllocations = async (
  userId: string,
): Promise<OverdueAllocation[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('asset_allocations')
    .select('*, fixed_assets!inner(asset_code, name)')
    .eq('user_id', uid)
    .eq('status', 'active')
    .lt('expected_return_on', today)
    .order('expected_return_on', { ascending: true });
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...(row as AssetAllocation),
    asset_code: row.fixed_assets?.asset_code,
    asset_name: row.fixed_assets?.name,
    days_overdue: row.expected_return_on
      ? -daysBetween(row.expected_return_on, today)
      : 0,
  }));
};

// ── Issue ───────────────────────────────────────────────────────────────────
export const createAllocation = async (
  userId: string,
  input: CreateAllocationInput,
): Promise<AssetAllocation> => {
  const uid = normalizeUserId(userId);

  const { data: asset } = await supabase
    .from('fixed_assets')
    .select('id, asset_code, name, custodian, cost_center_id, branch_id')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (!asset) throw new Error('Asset not found.');

  // Refuse to over-allocate if another active holder exists
  const { data: existing } = await supabase
    .from('asset_allocations')
    .select('id, employee_name')
    .eq('user_id', uid)
    .eq('asset_id', input.asset_id)
    .eq('status', 'active')
    .limit(1);
  if (existing && existing.length > 0) {
    throw new Error(
      `Asset is already allocated to ${(existing[0] as any).employee_name}. Return it first.`,
    );
  }

  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    allocated_to_type: input.allocated_to_type || 'employee',
    employee_id: input.employee_id || null,
    employee_name: input.employee_name,
    employee_email: input.employee_email || null,
    employee_phone: input.employee_phone || null,
    team_name: input.team_name || null,
    department: input.department || null,
    designation: input.designation || null,
    issued_on: input.issued_on,
    expected_return_on: input.expected_return_on || null,
    condition_on_issue: input.condition_on_issue || 'good',
    status: 'active' as const,
    acknowledgement_url: input.acknowledgement_url || null,
    cost_center_id: input.cost_center_id || asset.cost_center_id || null,
    branch_id: input.branch_id || asset.branch_id || null,
    notes: input.notes || null,
    created_by: uid,
  };

  const { data: row, error } = await supabase
    .from('asset_allocations')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  const allocation = row as AssetAllocation;

  // Stamp custodian on the asset
  await supabase
    .from('fixed_assets')
    .update({ custodian: input.employee_name })
    .eq('user_id', uid)
    .eq('id', input.asset_id);

  // Lifecycle event
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: input.asset_id,
    transaction_type: 'transfer',
    transaction_date: input.issued_on,
    from_location: asset.custodian || null,
    to_location: input.employee_name,
    notes: `Issued to ${input.employee_name}${input.designation ? ` (${input.designation})` : ''}`,
    created_by: uid,
  });

  // Audit
  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: input.asset_id,
    action: 'allocated',
    before_state: { custodian: asset.custodian || null } as Record<string, unknown>,
    after_state: { custodian: input.employee_name } as Record<string, unknown>,
    actor: uid,
  });

  return allocation;
};

// ── Return ──────────────────────────────────────────────────────────────────
//
// Accounting wiring:
//   * condition_on_return = 'lost'    → full write-off via disposeFixedAsset
//                                       (Dr Accum Dep + Dr Loss / Cr Asset).
//   * condition_on_return = 'damaged' AND damage_value > 0
//                                     → partial impairment (Dr Loss / Cr Accum Dep)
//                                       — asset stays in service, status flips
//                                       to 'impaired' if it was 'active'.
//   * condition_on_return = 'damaged' without a damage_value
//                                     → metadata only, no journal (caller hasn't
//                                       quantified the loss yet).
//   * Anything else (good/fair/new)   → metadata only, no journal.
//
// The resulting journal_id (if any) is stamped onto the allocation row.
export const returnAllocation = async (
  userId: string,
  input: ReturnAllocationInput,
): Promise<ReturnAllocationResult> => {
  const uid = normalizeUserId(userId);
  const existing = await getAllocation(uid, input.allocation_id);
  if (!existing) throw new Error('Allocation not found.');
  if (existing.status !== 'active' && existing.status !== 'overdue') {
    throw new Error(`Cannot return an allocation with status '${existing.status}'.`);
  }

  const newStatus =
    input.condition_on_return === 'lost'      ? 'lost' :
    input.condition_on_return === 'damaged'   ? 'damaged' :
                                                'returned';

  const { data: row, error } = await supabase
    .from('asset_allocations')
    .update({
      returned_on: input.returned_on,
      condition_on_return: input.condition_on_return,
      damage_notes: input.damage_notes ?? existing.damage_notes ?? null,
      damage_value: input.damage_value ?? existing.damage_value ?? null,
      return_document_url: input.return_document_url ?? existing.return_document_url ?? null,
      status: newStatus,
      notes: input.notes ?? existing.notes ?? null,
    })
    .eq('user_id', uid)
    .eq('id', input.allocation_id)
    .select('*')
    .single();
  if (error) throw error;
  const updated = row as AssetAllocation;

  // Clear / re-stamp custodian on the asset (in case a chained allocation exists)
  const { data: nextActive } = await supabase
    .from('asset_allocations')
    .select('employee_name')
    .eq('user_id', uid)
    .eq('asset_id', updated.asset_id)
    .eq('status', 'active')
    .limit(1);
  const nextCustodian = nextActive && nextActive.length > 0
    ? (nextActive[0] as any).employee_name
    : null;
  await supabase
    .from('fixed_assets')
    .update({ custodian: nextCustodian })
    .eq('user_id', uid)
    .eq('id', updated.asset_id);

  // Lifecycle event
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: updated.asset_id,
    transaction_type: 'transfer',
    transaction_date: input.returned_on,
    from_location: updated.employee_name,
    to_location: nextCustodian || 'Stores',
    notes: `Returned by ${updated.employee_name} — ${input.condition_on_return}${
      input.damage_value ? ` (damage ₹${input.damage_value})` : ''
    }`,
    created_by: uid,
  });

  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: updated.asset_id,
    action: input.condition_on_return === 'lost' ? 'lost' : 'returned',
    before_state: { custodian: updated.employee_name } as Record<string, unknown>,
    after_state: { custodian: nextCustodian, condition: input.condition_on_return } as Record<string, unknown>,
    actor: uid,
  });

  // ── Post the accounting journal for damage / loss ──
  let journalId: string | null = null;
  let journalKind: ReturnAllocationResult['journal_kind'] = null;
  let journalAmount = 0;

  try {
    if (input.condition_on_return === 'lost') {
      const result = await disposeFixedAsset(uid, {
        asset_id: updated.asset_id,
        disposal_date: input.returned_on,
        sale_proceeds: 0,
        write_off: true,
        disposal_type: 'write_off',
        reason: `Lost during allocation to ${updated.employee_name}`,
        notes: input.damage_notes || input.notes || undefined,
      });
      journalId = result.journalId;
      journalKind = 'write_off';
      journalAmount = Math.abs(result.profitLoss);
    } else if (input.condition_on_return === 'damaged' && (input.damage_value ?? 0) > 0) {
      const result = await postAssetImpairment(uid, {
        asset_id: updated.asset_id,
        impairment_date: input.returned_on,
        amount: Number(input.damage_value),
        reason: `Damage on return from ${updated.employee_name}`,
        source_id: updated.id,
        source_label: 'allocation',
      });
      journalId = result.journalId;
      journalKind = 'impairment';
      journalAmount = result.amount;
    }
  } catch (e) {
    // Re-throw with a clearer prefix so the UI can show what failed without
    // losing the underlying message (e.g. 'Impairment exceeds book value').
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Allocation return recorded but journal failed: ${msg}`);
  }

  // Stamp the posted journal id back onto the allocation
  if (journalId) {
    const { data: stamped, error: stampErr } = await supabase
      .from('asset_allocations')
      .update({ journal_id: journalId })
      .eq('user_id', uid)
      .eq('id', updated.id)
      .select('*')
      .single();
    if (stampErr) throw stampErr;
    return {
      allocation: stamped as AssetAllocation,
      journal_id: journalId,
      journal_kind: journalKind,
      journal_amount: journalAmount,
    };
  }

  return {
    allocation: updated,
    journal_id: null,
    journal_kind: null,
    journal_amount: 0,
  };
};

// Mark active+past-due as 'overdue' (idempotent — can be called on app load).
export const refreshOverdueStatus = async (userId: string): Promise<number> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('asset_allocations')
    .update({ status: 'overdue' })
    .eq('user_id', uid)
    .eq('status', 'active')
    .lt('expected_return_on', today)
    .select('id');
  if (error) throw error;
  return (data || []).length;
};

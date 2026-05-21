// ════════════════════════════════════════════════════════════════════════════
// Asset Coverage Service (Module 2: Warranty & Insurance Tracking)
//
// Owns warranties, insurance policies, and claims tied to fixed assets.
//
// Journal patterns:
//   Premium paid:
//     Dr Insurance Expense (+ GST capitalized when not ITC eligible)
//     Dr Input CGST / SGST / IGST (when ITC eligible)
//     Cr Bank / Cash / Accounts Payable
//   Claim settled:
//     Dr Bank / Cash               (settled amount)
//     Cr Insurance Claim Recovery  (Income)
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  AssetCoverageSummary,
  AssetInsuranceClaim,
  AssetInsurancePolicy,
  AssetWarranty,
  CreateInsuranceClaimInput,
  CreateInsurancePolicyInput,
  CreateWarrantyInput,
  PolicyExpiryAlert,
  SettleClaimInput,
  WarrantyExpiryAlert,
} from '@/types/assetCoverage';

const round2 = (n: number) => Math.round(n * 100) / 100;

const INSURANCE_EXPENSE_ACCOUNT_NAME = 'Insurance Expense';
const INSURANCE_RECOVERY_ACCOUNT_NAME = 'Insurance Claim Recovery';

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

// ── Warranties ──────────────────────────────────────────────────────────────
export const listWarranties = async (
  userId: string,
  assetId?: string,
): Promise<AssetWarranty[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_warranties')
    .select('*')
    .eq('user_id', uid)
    .order('end_date', { ascending: true });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetWarranty[];
};

export const createWarranty = async (
  userId: string,
  input: CreateWarrantyInput,
): Promise<AssetWarranty> => {
  const uid = normalizeUserId(userId);
  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    warranty_type: input.warranty_type || 'manufacturer',
    provider_name: input.provider_name,
    provider_contact: input.provider_contact || null,
    warranty_number: input.warranty_number || null,
    start_date: input.start_date,
    end_date: input.end_date,
    coverage_terms: input.coverage_terms || null,
    exclusions: input.exclusions || null,
    claim_contact: input.claim_contact || null,
    document_url: input.document_url || null,
    reminder_days_before: input.reminder_days_before ?? 30,
    is_active: true,
    notes: input.notes || null,
    created_by: uid,
  };
  const { data, error } = await supabase
    .from('asset_warranties')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetWarranty;
};

export const updateWarranty = async (
  userId: string,
  id: string,
  patch: Partial<AssetWarranty>,
): Promise<AssetWarranty> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  const { data, error } = await supabase
    .from('asset_warranties')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetWarranty;
};

export const deactivateWarranty = async (userId: string, id: string): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('asset_warranties')
    .update({ is_active: false })
    .eq('user_id', uid)
    .eq('id', id);
  if (error) throw error;
};

// ── Policies ────────────────────────────────────────────────────────────────
export const listPolicies = async (
  userId: string,
  assetId?: string,
): Promise<AssetInsurancePolicy[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_insurance_policies')
    .select('*')
    .eq('user_id', uid)
    .order('end_date', { ascending: true });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetInsurancePolicy[];
};

export const getPolicy = async (
  userId: string,
  id: string,
): Promise<AssetInsurancePolicy | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_insurance_policies')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetInsurancePolicy) || null;
};

export interface CreatePolicyResult {
  policy: AssetInsurancePolicy;
  journalId: string | null;
}

export const createPolicy = async (
  userId: string,
  input: CreateInsurancePolicyInput,
): Promise<CreatePolicyResult> => {
  const uid = normalizeUserId(userId);

  // Pull asset for journal narration
  const { data: assetRow } = await supabase
    .from('fixed_assets')
    .select('id, asset_code, name, cost_center_id, branch_id')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (!assetRow) throw new Error('Asset not found.');

  const premium = round2(input.premium_amount || 0);
  const gst = round2(input.gst_amount || 0);
  const cgst = round2(input.cgst_amount || 0);
  const sgst = round2(input.sgst_amount || 0);
  const igst = round2(input.igst_amount || 0);

  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    policy_type: input.policy_type || 'comprehensive',
    insurer_name: input.insurer_name,
    vendor_id: input.vendor_id || null,
    broker_name: input.broker_name || null,
    policy_number: input.policy_number,
    coverage_amount: round2(input.coverage_amount || 0),
    premium_amount: premium,
    gst_amount: gst,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    itc_eligible: input.itc_eligible ?? true,
    start_date: input.start_date,
    end_date: input.end_date,
    premium_due_date: input.premium_due_date || null,
    premium_paid: input.premium_paid ?? false,
    payment_mode: input.payment_mode || 'bank',
    paid_on: input.paid_on || null,
    status: 'active' as const,
    claim_contact: input.claim_contact || null,
    document_url: input.document_url || null,
    reminder_days_before: input.reminder_days_before ?? 30,
    cost_center_id: input.cost_center_id || assetRow.cost_center_id || null,
    branch_id: input.branch_id || assetRow.branch_id || null,
    notes: input.notes || null,
    created_by: uid,
  };

  const { data: policyRow, error: insErr } = await supabase
    .from('asset_insurance_policies')
    .insert(payload)
    .select('*')
    .single();
  if (insErr) throw insErr;
  let policy = policyRow as AssetInsurancePolicy;

  let journalId: string | null = null;
  if ((input.post_journal !== false) && policy.premium_paid && premium > 0) {
    journalId = await postPremiumJournal(uid, policy, assetRow.asset_code, assetRow.name);
    const { data: updated, error: upErr } = await supabase
      .from('asset_insurance_policies')
      .update({ journal_id: journalId })
      .eq('user_id', uid)
      .eq('id', policy.id)
      .select('*')
      .single();
    if (upErr) throw upErr;
    policy = updated as AssetInsurancePolicy;
  }

  return { policy, journalId };
};

export const markPolicyPremiumPaid = async (
  userId: string,
  id: string,
  paidOn: string,
  paymentMode: 'cash' | 'bank' | 'credit' = 'bank',
): Promise<{ policy: AssetInsurancePolicy; journalId: string }> => {
  const uid = normalizeUserId(userId);
  const policy = await getPolicy(uid, id);
  if (!policy) throw new Error('Policy not found.');
  if (policy.premium_paid && policy.journal_id) {
    throw new Error('Premium is already marked as paid.');
  }

  const { data: assetRow } = await supabase
    .from('fixed_assets')
    .select('asset_code, name')
    .eq('user_id', uid)
    .eq('id', policy.asset_id)
    .maybeSingle();

  const updatedPolicy: AssetInsurancePolicy = {
    ...policy,
    premium_paid: true,
    payment_mode: paymentMode,
    paid_on: paidOn,
  };
  const journalId = await postPremiumJournal(
    uid,
    updatedPolicy,
    assetRow?.asset_code || '',
    assetRow?.name || '',
  );

  const { data, error } = await supabase
    .from('asset_insurance_policies')
    .update({ premium_paid: true, payment_mode: paymentMode, paid_on: paidOn, journal_id: journalId })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;

  return { policy: data as AssetInsurancePolicy, journalId };
};

export const updatePolicy = async (
  userId: string,
  id: string,
  patch: Partial<AssetInsurancePolicy>,
): Promise<AssetInsurancePolicy> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  delete cleaned.journal_id;
  const { data, error } = await supabase
    .from('asset_insurance_policies')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetInsurancePolicy;
};

// ── Premium journal ─────────────────────────────────────────────────────────
const postPremiumJournal = async (
  userId: string,
  policy: AssetInsurancePolicy,
  assetCode: string,
  assetName: string,
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const lines: JournalLineInput[] = [];

  const expenseAcc = await getOrCreateAccount(uid, INSURANCE_EXPENSE_ACCOUNT_NAME, 'Expense');
  const expenseDebit = policy.itc_eligible
    ? policy.premium_amount
    : policy.premium_amount + policy.gst_amount;
  lines.push({
    account_id: expenseAcc,
    debit: round2(expenseDebit),
    credit: 0,
    line_narration: `Insurance premium ${policy.policy_type} — ${assetCode} ${assetName}`,
    vendor_id: policy.vendor_id || null,
    cost_center_id: policy.cost_center_id || null,
    branch_id: policy.branch_id || null,
  });

  if (policy.itc_eligible && policy.gst_amount > 0) {
    const splitTotal = policy.cgst_amount + policy.sgst_amount + policy.igst_amount;
    if (policy.igst_amount > 0) {
      const igstAcc = await getOrCreateAccount(uid, 'Input IGST', 'Asset');
      lines.push({ account_id: igstAcc, debit: round2(policy.igst_amount), credit: 0, line_narration: 'IGST on insurance', tax_type: 'igst' });
    }
    if (policy.cgst_amount > 0) {
      const cgstAcc = await getOrCreateAccount(uid, 'Input CGST', 'Asset');
      lines.push({ account_id: cgstAcc, debit: round2(policy.cgst_amount), credit: 0, line_narration: 'CGST on insurance', tax_type: 'cgst' });
    }
    if (policy.sgst_amount > 0) {
      const sgstAcc = await getOrCreateAccount(uid, 'Input SGST', 'Asset');
      lines.push({ account_id: sgstAcc, debit: round2(policy.sgst_amount), credit: 0, line_narration: 'SGST on insurance', tax_type: 'sgst' });
    }
    if (splitTotal === 0) {
      const itcAcc = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
      lines.push({ account_id: itcAcc, debit: round2(policy.gst_amount), credit: 0, line_narration: 'Input GST on insurance', tax_type: 'itc' });
    }
  }

  const totalCredit = round2(policy.premium_amount + policy.gst_amount);
  if (policy.payment_mode === 'credit') {
    const apAcc = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
    lines.push({ account_id: apAcc, debit: 0, credit: totalCredit, line_narration: `Premium payable to ${policy.insurer_name}`, vendor_id: policy.vendor_id || null });
  } else {
    const acc = policy.payment_mode === 'cash' ? 'Cash' : 'Bank';
    const bankAcc = await getOrCreateAccount(uid, acc, 'Asset');
    lines.push({ account_id: bankAcc, debit: 0, credit: totalCredit, line_narration: `${acc} paid for premium ${policy.policy_number}` });
  }

  return postJournal({
    user_id: uid,
    date: policy.paid_on || policy.start_date,
    narration: `Insurance premium — ${policy.insurer_name} ${policy.policy_number}`,
    source_type: 'insurance_premium',
    source_id: policy.id,
    idempotency_key: `insurance_premium:${policy.id}`,
    lines,
  });
};

// ── Claims ──────────────────────────────────────────────────────────────────
export const listClaims = async (
  userId: string,
  assetId?: string,
  policyId?: string,
): Promise<AssetInsuranceClaim[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_insurance_claims')
    .select('*')
    .eq('user_id', uid)
    .order('claim_filed_date', { ascending: false });
  if (assetId) q = q.eq('asset_id', assetId);
  if (policyId) q = q.eq('policy_id', policyId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetInsuranceClaim[];
};

export const createClaim = async (
  userId: string,
  input: CreateInsuranceClaimInput,
): Promise<AssetInsuranceClaim> => {
  const uid = normalizeUserId(userId);
  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    policy_id: input.policy_id,
    claim_number: input.claim_number,
    incident_date: input.incident_date,
    claim_filed_date: input.claim_filed_date,
    claim_amount: round2(input.claim_amount || 0),
    status: input.status || 'filed',
    incident_description: input.incident_description || null,
    surveyor_name: input.surveyor_name || null,
    surveyor_contact: input.surveyor_contact || null,
    document_url: input.document_url || null,
    notes: input.notes || null,
    created_by: uid,
  };
  const { data, error } = await supabase
    .from('asset_insurance_claims')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetInsuranceClaim;
};

export const updateClaim = async (
  userId: string,
  id: string,
  patch: Partial<AssetInsuranceClaim>,
): Promise<AssetInsuranceClaim> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  delete cleaned.journal_id;
  const { data, error } = await supabase
    .from('asset_insurance_claims')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetInsuranceClaim;
};

export interface SettleClaimResult {
  claim: AssetInsuranceClaim;
  journalId: string;
}

export const settleClaim = async (
  userId: string,
  input: SettleClaimInput,
): Promise<SettleClaimResult> => {
  const uid = normalizeUserId(userId);
  const { data: claimRow } = await supabase
    .from('asset_insurance_claims')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.claim_id)
    .maybeSingle();
  if (!claimRow) throw new Error('Claim not found.');
  const claim = claimRow as AssetInsuranceClaim;
  if (claim.journal_id) throw new Error('Claim is already settled.');

  const { data: assetRow } = await supabase
    .from('fixed_assets')
    .select('asset_code, name')
    .eq('user_id', uid)
    .eq('id', claim.asset_id)
    .maybeSingle();

  const amount = round2(input.settled_amount);
  const paymentMode = input.payment_mode || 'bank';

  const bankAcc = await getOrCreateAccount(uid, paymentMode === 'cash' ? 'Cash' : 'Bank', 'Asset');
  const incomeAcc = await getOrCreateAccount(uid, INSURANCE_RECOVERY_ACCOUNT_NAME, 'Income');

  const journalId = await postJournal({
    user_id: uid,
    date: input.settled_on,
    narration: `Insurance claim settlement — ${claim.claim_number} (${assetRow?.asset_code || ''})`,
    source_type: 'insurance_claim',
    source_id: claim.id,
    idempotency_key: `insurance_claim:${claim.id}`,
    lines: [
      {
        account_id: bankAcc,
        debit: amount,
        credit: 0,
        line_narration: `${paymentMode === 'cash' ? 'Cash' : 'Bank'} received — claim ${claim.claim_number}`,
        cost_center_id: claim.cost_center_id || null,
        branch_id: claim.branch_id || null,
      },
      {
        account_id: incomeAcc,
        debit: 0,
        credit: amount,
        line_narration: `Insurance recovery on ${assetRow?.name || claim.asset_id}`,
        cost_center_id: claim.cost_center_id || null,
        branch_id: claim.branch_id || null,
      },
    ],
  });

  const newStatus = input.partially_settled ? 'partially_settled' : 'settled';
  const { data, error } = await supabase
    .from('asset_insurance_claims')
    .update({
      settled_amount: amount,
      settled_on: input.settled_on,
      payment_mode: paymentMode,
      status: newStatus,
      journal_id: journalId,
      notes: input.notes ?? claim.notes ?? null,
    })
    .eq('user_id', uid)
    .eq('id', claim.id)
    .select('*')
    .single();
  if (error) throw error;

  return { claim: data as AssetInsuranceClaim, journalId };
};

// ── Aggregates / alerts ─────────────────────────────────────────────────────
export const getCoverageSummary = async (
  userId: string,
  assetId: string,
): Promise<AssetCoverageSummary | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_coverage_summary')
    .select('*')
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetCoverageSummary) || null;
};

export const listCoverageSummaries = async (userId: string): Promise<AssetCoverageSummary[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_coverage_summary')
    .select('*')
    .eq('user_id', uid);
  if (error) throw error;
  return (data || []) as AssetCoverageSummary[];
};

export const listWarrantyExpiryAlerts = async (
  userId: string,
  withinDays = 60,
): Promise<WarrantyExpiryAlert[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('asset_warranties')
    .select('*, fixed_assets!inner(id, asset_code, name)')
    .eq('user_id', uid)
    .eq('is_active', true)
    .lte('end_date', horizonIso)
    .order('end_date', { ascending: true });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const days = daysBetween(today, row.end_date);
    return {
      warranty: row as AssetWarranty,
      asset_code: row.fixed_assets?.asset_code || '',
      asset_name: row.fixed_assets?.name || '',
      days_until_expiry: days,
      is_expired: days < 0,
    };
  });
};

export const listPolicyExpiryAlerts = async (
  userId: string,
  withinDays = 45,
): Promise<PolicyExpiryAlert[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('asset_insurance_policies')
    .select('*, fixed_assets!inner(id, asset_code, name)')
    .eq('user_id', uid)
    .eq('status', 'active')
    .lte('end_date', horizonIso)
    .order('end_date', { ascending: true });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const days = daysBetween(today, row.end_date);
    return {
      policy: row as AssetInsurancePolicy,
      asset_code: row.fixed_assets?.asset_code || '',
      asset_name: row.fixed_assets?.name || '',
      days_until_expiry: days,
      is_expired: days < 0,
    };
  });
};

// ════════════════════════════════════════════════════════════════════════════
// CWIP Service (Module 8)
//
// addCwipCost: book a cost against a CWIP project. Posts a journal:
//   Dr CWIP Account                (cost incl. GST when ITC ineligible)
//   Dr Input GST                   (when ITC eligible)
//   Cr Bank / Cash / AP
// Updates cwip_projects.total_accumulated_cost.
//
// capitalizeCwip: convert accumulated costs into a fixed asset. Posts:
//   Dr Fixed Asset                 (sum of selected cost rows)
//   Cr CWIP Account
// Then bootstraps the depreciation schedule via the standard depreciation
// service. Supports phased capitalization (only selected costs go in).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import {
  ASSET_ACCOUNT_NAME,
  ACCUM_DEP_ACCOUNT_NAME,
  DEP_EXPENSE_ACCOUNT_NAME,
} from '@/services/fixedAssetService';
import { generateDepreciationSchedule } from '@/services/depreciationService';
import type {
  AddCwipCostInput,
  CapitalizeCwipInput,
  CreateCwipProjectInput,
  CwipCost,
  CwipProject,
} from '@/types/cwip';
import type { FixedAsset } from '@/types/fixedAssets';

const round2 = (n: number) => Math.round(n * 100) / 100;
const CWIP_ACCOUNT_NAME = 'Capital Work-In-Progress';

const nextCwipCode = async (userId: string): Promise<string> => {
  const uid = normalizeUserId(userId);
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('cwip_projects')
    .select('cwip_code')
    .eq('user_id', uid)
    .like('cwip_code', `CWIP/${year}/%`)
    .order('cwip_code', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).cwip_code.match(/CWIP\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `CWIP/${year}/${String(seq).padStart(4, '0')}`;
};

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
    const m = (data[0] as any).asset_code.match(/FA\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `FA/${year}/${String(seq).padStart(4, '0')}`;
};

// ── Reads ───────────────────────────────────────────────────────────────────
export const listCwipProjects = async (userId: string): Promise<CwipProject[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('cwip_projects')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CwipProject[];
};

export const getCwipProject = async (
  userId: string,
  id: string,
): Promise<CwipProject | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('cwip_projects')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as CwipProject) || null;
};

export const listCwipCosts = async (userId: string, cwipId: string): Promise<CwipCost[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('cwip_costs')
    .select('*')
    .eq('user_id', uid)
    .eq('cwip_id', cwipId)
    .order('cost_date', { ascending: false });
  if (error) throw error;
  return (data || []) as CwipCost[];
};

// ── Create project ──────────────────────────────────────────────────────────
export const createCwipProject = async (
  userId: string,
  input: CreateCwipProjectInput,
): Promise<CwipProject> => {
  const uid = normalizeUserId(userId);
  const cwipCode = input.cwip_code || (await nextCwipCode(uid));
  const payload = {
    user_id: uid,
    cwip_code: cwipCode,
    name: input.name,
    description: input.description || null,
    expected_asset_category_id: input.expected_asset_category_id || null,
    expected_useful_life_years: input.expected_useful_life_years ?? 5,
    expected_depreciation_method: input.expected_depreciation_method || 'SLM',
    budget_amount: round2(input.budget_amount || 0),
    start_date: input.start_date,
    expected_completion_date: input.expected_completion_date || null,
    status: 'in_progress' as const,
    cost_center_id: input.cost_center_id || null,
    branch_id: input.branch_id || null,
    department: input.department || null,
    document_url: input.document_url || null,
    notes: input.notes || null,
    created_by: uid,
  };
  const { data, error } = await supabase
    .from('cwip_projects')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as CwipProject;
};

export const updateCwipProject = async (
  userId: string,
  id: string,
  patch: Partial<CwipProject>,
): Promise<CwipProject> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  delete cleaned.total_accumulated_cost;
  delete cleaned.total_capitalized;
  delete cleaned.capitalization_journal_id;
  const { data, error } = await supabase
    .from('cwip_projects')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CwipProject;
};

// ── Add cost + journal ──────────────────────────────────────────────────────
export interface AddCostResult {
  cost: CwipCost;
  journalId: string | null;
}

export const addCwipCost = async (
  userId: string,
  input: AddCwipCostInput,
): Promise<AddCostResult> => {
  const uid = normalizeUserId(userId);
  const project = await getCwipProject(uid, input.cwip_id);
  if (!project) throw new Error('CWIP project not found.');
  if (project.status === 'capitalized' || project.status === 'cancelled') {
    throw new Error(`Cannot add costs to a ${project.status} project.`);
  }

  const amount = round2(input.amount);
  const gst = round2(input.gst_amount || 0);
  const cgst = round2(input.cgst_amount || 0);
  const sgst = round2(input.sgst_amount || 0);
  const igst = round2(input.igst_amount || 0);
  const itcEligible = input.itc_eligible ?? false;
  const paymentMode = input.payment_mode || 'bank';

  // Insert cost row
  const { data: costRow, error: insErr } = await supabase
    .from('cwip_costs')
    .insert({
      user_id: uid,
      cwip_id: input.cwip_id,
      cost_type: input.cost_type,
      cost_date: input.cost_date,
      description: input.description,
      amount,
      gst_amount: gst,
      cgst_amount: cgst,
      sgst_amount: sgst,
      igst_amount: igst,
      itc_eligible: itcEligible,
      payment_mode: paymentMode,
      vendor_id: input.vendor_id || null,
      vendor_name: input.vendor_name || null,
      source_type: 'manual' as const,
      notes: input.notes || null,
      document_url: input.document_url || null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (insErr) throw insErr;
  let cost = costRow as CwipCost;

  // Post journal
  let journalId: string | null = null;
  if (input.post_journal !== false) {
    const cwipAcc = await getOrCreateAccount(uid, CWIP_ACCOUNT_NAME, 'Asset');
    const lines: JournalLineInput[] = [];

    // Dr CWIP — capitalises GST if ITC not eligible
    const cwipDebit = itcEligible ? amount : amount + gst;
    lines.push({
      account_id: cwipAcc,
      debit: round2(cwipDebit),
      credit: 0,
      line_narration: `CWIP ${project.cwip_code}: ${input.cost_type} — ${input.description}`,
      vendor_id: input.vendor_id || null,
      cost_center_id: project.cost_center_id || null,
      branch_id: project.branch_id || null,
    });

    // Dr Input GST (when ITC eligible)
    if (itcEligible && gst > 0) {
      const splitTotal = cgst + sgst + igst;
      if (igst > 0) {
        const igstAcc = await getOrCreateAccount(uid, 'Input IGST', 'Asset');
        lines.push({ account_id: igstAcc, debit: igst, credit: 0, line_narration: 'IGST on CWIP cost', tax_type: 'igst' });
      }
      if (cgst > 0) {
        const cgstAcc = await getOrCreateAccount(uid, 'Input CGST', 'Asset');
        lines.push({ account_id: cgstAcc, debit: cgst, credit: 0, line_narration: 'CGST on CWIP cost', tax_type: 'cgst' });
      }
      if (sgst > 0) {
        const sgstAcc = await getOrCreateAccount(uid, 'Input SGST', 'Asset');
        lines.push({ account_id: sgstAcc, debit: sgst, credit: 0, line_narration: 'SGST on CWIP cost', tax_type: 'sgst' });
      }
      if (splitTotal === 0) {
        const itcAcc = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
        lines.push({ account_id: itcAcc, debit: gst, credit: 0, line_narration: 'Input GST on CWIP', tax_type: 'itc' });
      }
    }

    // Cr Bank / Cash / AP
    const totalCredit = round2(amount + gst);
    if (paymentMode === 'credit') {
      const apAcc = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
      lines.push({ account_id: apAcc, debit: 0, credit: totalCredit, line_narration: `Payable for CWIP ${project.cwip_code}`, vendor_id: input.vendor_id || null });
    } else {
      const accName = paymentMode === 'cash' ? 'Cash' : 'Bank';
      const bankAcc = await getOrCreateAccount(uid, accName, 'Asset');
      lines.push({ account_id: bankAcc, debit: 0, credit: totalCredit, line_narration: `${accName} paid for CWIP ${project.cwip_code}` });
    }

    journalId = await postJournal({
      user_id: uid,
      date: input.cost_date,
      narration: `CWIP cost — ${project.cwip_code}: ${input.description}`,
      source_type: 'cwip_addition',
      source_id: cost.id,
      idempotency_key: `cwip_addition:${cost.id}`,
      lines,
    });

    const { data: updated, error: upErr } = await supabase
      .from('cwip_costs')
      .update({ journal_id: journalId })
      .eq('user_id', uid)
      .eq('id', cost.id)
      .select('*')
      .single();
    if (upErr) throw upErr;
    cost = updated as CwipCost;
  }

  // Update project running total (uncapitalized cost = "total_accumulated_cost")
  const recordedDebit = (itcEligible ? amount : amount + gst);
  await supabase
    .from('cwip_projects')
    .update({
      total_accumulated_cost: round2(project.total_accumulated_cost + recordedDebit),
    })
    .eq('user_id', uid)
    .eq('id', project.id);

  return { cost, journalId };
};

// ── Capitalize (convert accumulated costs into a fixed asset) ──────────────
export interface CapitalizeCwipResult {
  asset: FixedAsset;
  journalId: string;
  costsCapitalized: number;
  amount: number;
}

export const capitalizeCwip = async (
  userId: string,
  input: CapitalizeCwipInput,
): Promise<CapitalizeCwipResult> => {
  const uid = normalizeUserId(userId);
  const project = await getCwipProject(uid, input.cwip_id);
  if (!project) throw new Error('CWIP project not found.');
  if (project.status === 'capitalized') throw new Error('Project already fully capitalized.');

  // Select costs to capitalize
  let costsQuery = supabase
    .from('cwip_costs')
    .select('*')
    .eq('user_id', uid)
    .eq('cwip_id', project.id)
    .eq('capitalized', false);
  if (input.cost_ids && input.cost_ids.length > 0) {
    costsQuery = costsQuery.in('id', input.cost_ids);
  }
  const { data: costs, error: costsErr } = await costsQuery;
  if (costsErr) throw costsErr;
  if (!costs || costs.length === 0) {
    throw new Error('No uncapitalized costs to capitalize.');
  }

  // Total capitalised value = sum of cost amounts (incl. GST when ITC ineligible)
  const capitalizedAmount = round2(
    (costs as CwipCost[]).reduce(
      (s, c) => s + (c.itc_eligible ? Number(c.amount) : Number(c.amount) + Number(c.gst_amount)),
      0,
    ),
  );
  if (capitalizedAmount <= 0) throw new Error('Capitalized amount must be positive.');

  // Create fixed asset
  const assetCode = await nextAssetCode(uid);
  const assetName = input.asset_name || project.name;
  const usefulLife = input.useful_life_years ?? project.expected_useful_life_years ?? 5;
  const method = input.depreciation_method || project.expected_depreciation_method;

  const [assetAccountId, accumDepAccountId, depExpenseAccountId] = await Promise.all([
    getOrCreateAccount(uid, ASSET_ACCOUNT_NAME(assetCode, assetName), 'Asset'),
    getOrCreateAccount(uid, ACCUM_DEP_ACCOUNT_NAME(assetCode), 'Asset'),
    getOrCreateAccount(uid, DEP_EXPENSE_ACCOUNT_NAME, 'Expense'),
  ]);
  const cwipAcc = await getOrCreateAccount(uid, CWIP_ACCOUNT_NAME, 'Asset');

  const { data: assetRow, error: assetErr } = await supabase
    .from('fixed_assets')
    .insert({
      user_id: uid,
      asset_code: assetCode,
      name: assetName,
      description: project.description || `Capitalized from ${project.cwip_code}`,
      category_id: project.expected_asset_category_id || null,
      purchase_value: capitalizedAmount,
      gst_amount: 0,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 0,
      itc_eligible: true,
      total_capitalised_value: capitalizedAmount,
      purchase_date: input.capitalized_on,
      capitalised_on: input.capitalized_on,
      source_type: 'manual',
      useful_life_years: usefulLife,
      depreciation_method: method,
      depreciation_rate: input.depreciation_rate ?? null,
      salvage_value: round2(input.salvage_value || 0),
      accumulated_depreciation: 0,
      book_value: capitalizedAmount,
      location: input.asset_location || null,
      branch_id: project.branch_id || null,
      cost_center_id: project.cost_center_id || null,
      department: project.department || null,
      custodian: input.asset_custodian || null,
      serial_number: input.asset_serial_number || null,
      status: 'active',
      asset_account_id: assetAccountId,
      accum_dep_account_id: accumDepAccountId,
      dep_expense_account_id: depExpenseAccountId,
      notes: `Capitalized from CWIP ${project.cwip_code}`,
      created_by: uid,
    })
    .select('*')
    .single();
  if (assetErr) throw assetErr;
  const asset = assetRow as FixedAsset;

  // Post capitalization journal: Dr Fixed Asset / Cr CWIP
  const journalId = await postJournal({
    user_id: uid,
    date: input.capitalized_on,
    narration: `CWIP capitalization — ${project.cwip_code} → ${asset.asset_code} ${asset.name}`,
    source_type: 'cwip_capitalization',
    source_id: asset.id,
    idempotency_key: `cwip_capitalization:${asset.id}`,
    lines: [
      {
        account_id: assetAccountId,
        debit: capitalizedAmount,
        credit: 0,
        line_narration: `Capitalize CWIP into ${asset.asset_code}`,
        cost_center_id: project.cost_center_id || null,
        branch_id: project.branch_id || null,
      },
      {
        account_id: cwipAcc,
        debit: 0,
        credit: capitalizedAmount,
        line_narration: `Transfer CWIP balance — ${project.cwip_code}`,
        cost_center_id: project.cost_center_id || null,
      },
    ],
  });

  // Mark selected costs as capitalized
  const costIdsCapitalized = (costs as CwipCost[]).map((c) => c.id);
  await supabase
    .from('cwip_costs')
    .update({ capitalized: true, capitalized_into: asset.id })
    .eq('user_id', uid)
    .in('id', costIdsCapitalized);

  // Update project
  const closeProject = input.close_project ?? (!input.cost_ids || input.cost_ids.length === 0);
  await supabase
    .from('cwip_projects')
    .update({
      total_capitalized: round2(project.total_capitalized + capitalizedAmount),
      total_accumulated_cost: round2(project.total_accumulated_cost - capitalizedAmount),
      status: closeProject ? 'capitalized' : 'in_progress',
      capitalized_on: closeProject ? input.capitalized_on : project.capitalized_on,
      fixed_asset_id: closeProject ? asset.id : project.fixed_asset_id,
      capitalization_journal_id: closeProject ? journalId : project.capitalization_journal_id,
    })
    .eq('user_id', uid)
    .eq('id', project.id);

  // Lifecycle event on the new asset
  await supabase.from('asset_transactions').insert({
    user_id: uid,
    asset_id: asset.id,
    transaction_type: 'capitalization',
    transaction_date: input.capitalized_on,
    amount: capitalizedAmount,
    journal_id: journalId,
    notes: `Capitalized from CWIP ${project.cwip_code}`,
    created_by: uid,
  });

  // Audit log
  await supabase.from('asset_audit_log').insert({
    user_id: uid,
    asset_id: asset.id,
    action: 'created',
    after_state: asset as unknown as Record<string, unknown>,
    actor: uid,
  });

  // Seed depreciation
  if (method !== 'None' && usefulLife > 0) {
    await generateDepreciationSchedule(uid, asset.id);
  }

  return { asset, journalId, costsCapitalized: costIdsCapitalized.length, amount: capitalizedAmount };
};

// ── Cancel project (no asset created) ───────────────────────────────────────
export const cancelCwipProject = async (
  userId: string,
  id: string,
  reason: string,
): Promise<CwipProject> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('cwip_projects')
    .update({
      status: 'cancelled',
      notes: reason ? `Cancelled: ${reason}` : null,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as CwipProject;
};

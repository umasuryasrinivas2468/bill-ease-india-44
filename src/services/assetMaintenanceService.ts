// ════════════════════════════════════════════════════════════════════════════
// Asset Maintenance Service (Module 1)
//
// Owns the full lifecycle of asset maintenance:
//   - schedule recurring services / AMC contracts
//   - log service / repair / inspection events
//   - post the maintenance-expense journal via journalEngine.postJournal
//   - advance schedule.next_due_date when a recurring service completes
//   - surface due / overdue / AMC-expiring alerts
//
// Journal pattern for a completed paid maintenance record:
//   Dr  Repairs & Maintenance Expense  (cost + (gst when not ITC-eligible))
//   Dr  Input CGST / SGST / IGST       (only when ITC-eligible & GST > 0)
//   Cr  Bank / Cash / Accounts Payable (cost + gst)
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  AssetMaintenanceRecord,
  AssetMaintenanceSchedule,
  AssetMaintenanceSummary,
  CreateMaintenanceRecordInput,
  CreateMaintenanceScheduleInput,
  MaintenanceDueAlert,
  AmcExpiryAlert,
} from '@/types/assetMaintenance';

const round2 = (n: number) => Math.round(n * 100) / 100;

const MAINT_EXPENSE_ACCOUNT_NAME = 'Repairs & Maintenance Expense';

// ── Schedules: CRUD ─────────────────────────────────────────────────────────
export const listMaintenanceSchedules = async (
  userId: string,
  assetId?: string,
): Promise<AssetMaintenanceSchedule[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_maintenance_schedules')
    .select('*')
    .eq('user_id', uid)
    .order('next_due_date', { ascending: true });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetMaintenanceSchedule[];
};

export const getMaintenanceSchedule = async (
  userId: string,
  id: string,
): Promise<AssetMaintenanceSchedule | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_maintenance_schedules')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetMaintenanceSchedule) || null;
};

export const createMaintenanceSchedule = async (
  userId: string,
  input: CreateMaintenanceScheduleInput,
): Promise<AssetMaintenanceSchedule> => {
  const uid = normalizeUserId(userId);
  const payload = {
    user_id: uid,
    asset_id: input.asset_id,
    schedule_type: input.schedule_type,
    title: input.title,
    description: input.description || null,
    vendor_id: input.vendor_id || null,
    vendor_name: input.vendor_name || null,
    frequency_months: input.frequency_months ?? null,
    amc_start_date: input.amc_start_date || null,
    amc_end_date: input.amc_end_date || null,
    amc_amount: round2(input.amc_amount || 0),
    amc_paid: input.amc_paid ?? false,
    next_due_date: input.next_due_date,
    reminder_days_before: input.reminder_days_before ?? 7,
    cost_center_id: input.cost_center_id || null,
    branch_id: input.branch_id || null,
    is_active: true,
    notes: input.notes || null,
    created_by: uid,
  };
  const { data, error } = await supabase
    .from('asset_maintenance_schedules')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetMaintenanceSchedule;
};

export const updateMaintenanceSchedule = async (
  userId: string,
  id: string,
  patch: Partial<AssetMaintenanceSchedule>,
): Promise<AssetMaintenanceSchedule> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  const { data, error } = await supabase
    .from('asset_maintenance_schedules')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetMaintenanceSchedule;
};

export const deactivateMaintenanceSchedule = async (
  userId: string,
  id: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('asset_maintenance_schedules')
    .update({ is_active: false })
    .eq('user_id', uid)
    .eq('id', id);
  if (error) throw error;
};

// ── Records: list / get ─────────────────────────────────────────────────────
export const listMaintenanceRecords = async (
  userId: string,
  assetId?: string,
): Promise<AssetMaintenanceRecord[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_maintenance_records')
    .select('*')
    .eq('user_id', uid)
    .order('performed_on', { ascending: false });
  if (assetId) q = q.eq('asset_id', assetId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as AssetMaintenanceRecord[];
};

export const getMaintenanceRecord = async (
  userId: string,
  id: string,
): Promise<AssetMaintenanceRecord | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_maintenance_records')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetMaintenanceRecord) || null;
};

// ── Records: create + journal ───────────────────────────────────────────────
export interface CreateMaintenanceRecordResult {
  record: AssetMaintenanceRecord;
  journalId: string | null;
  scheduleAdvancedTo: string | null;
}

const addMonths = (isoDate: string, months: number): string => {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export const createMaintenanceRecord = async (
  userId: string,
  input: CreateMaintenanceRecordInput,
): Promise<CreateMaintenanceRecordResult> => {
  const uid = normalizeUserId(userId);

  // Resolve asset for journal narration / vendor fallback
  const { data: assetRow } = await supabase
    .from('fixed_assets')
    .select('id, asset_code, name, vendor_id, vendor_name, cost_center_id, branch_id')
    .eq('user_id', uid)
    .eq('id', input.asset_id)
    .maybeSingle();
  if (!assetRow) throw new Error('Asset not found.');

  const status = input.status ?? 'completed';
  const cost = round2(input.cost || 0);
  const gst = round2(input.gst_amount || 0);
  const cgst = round2(input.cgst_amount || 0);
  const sgst = round2(input.sgst_amount || 0);
  const igst = round2(input.igst_amount || 0);
  const itcEligible = input.itc_eligible ?? true;
  const paymentMode = input.payment_mode ?? 'bank';

  const insertPayload = {
    user_id: uid,
    asset_id: input.asset_id,
    schedule_id: input.schedule_id || null,
    record_type: input.record_type,
    status,
    performed_on: input.performed_on,
    cost,
    gst_amount: gst,
    cgst_amount: cgst,
    sgst_amount: sgst,
    igst_amount: igst,
    itc_eligible: itcEligible,
    payment_mode: paymentMode,
    vendor_id: input.vendor_id || null,
    vendor_name: input.vendor_name || null,
    labour_hours: input.labour_hours ?? null,
    parts_replaced: input.parts_replaced || null,
    downtime_hours: input.downtime_hours ?? null,
    cost_center_id: input.cost_center_id || assetRow.cost_center_id || null,
    branch_id: input.branch_id || assetRow.branch_id || null,
    description: input.description || null,
    notes: input.notes || null,
    attachment_url: input.attachment_url || null,
    created_by: uid,
  };

  const { data: rec, error: insertErr } = await supabase
    .from('asset_maintenance_records')
    .insert(insertPayload)
    .select('*')
    .single();
  if (insertErr) throw insertErr;
  let record = rec as AssetMaintenanceRecord;

  // Post the maintenance-expense journal
  let journalId: string | null = null;
  const shouldPost = input.post_journal !== false;
  if (shouldPost && status === 'completed' && cost > 0) {
    journalId = await postMaintenanceJournal(uid, record, assetRow.asset_code, assetRow.name);
    const { data: updated, error: upErr } = await supabase
      .from('asset_maintenance_records')
      .update({ journal_id: journalId })
      .eq('user_id', uid)
      .eq('id', record.id)
      .select('*')
      .single();
    if (upErr) throw upErr;
    record = updated as AssetMaintenanceRecord;
  }

  // Log lifecycle on the asset's transaction history
  if (status === 'completed') {
    await supabase.from('asset_transactions').insert({
      user_id: uid,
      asset_id: input.asset_id,
      transaction_type: 'adjustment',
      transaction_date: input.performed_on,
      amount: cost,
      journal_id: journalId,
      notes: `Maintenance: ${input.record_type}${input.description ? ' — ' + input.description : ''}`,
      created_by: uid,
    });
  }

  // Advance the schedule's next_due_date if this record closes out a cycle
  let scheduleAdvancedTo: string | null = null;
  if (input.schedule_id && status === 'completed') {
    const schedule = await getMaintenanceSchedule(uid, input.schedule_id);
    if (schedule && schedule.frequency_months && schedule.frequency_months > 0) {
      const newDue = addMonths(input.performed_on, schedule.frequency_months);
      await supabase
        .from('asset_maintenance_schedules')
        .update({ last_serviced_on: input.performed_on, next_due_date: newDue })
        .eq('user_id', uid)
        .eq('id', schedule.id);
      scheduleAdvancedTo = newDue;
      await supabase
        .from('asset_maintenance_records')
        .update({ next_service_date: newDue })
        .eq('user_id', uid)
        .eq('id', record.id);
      record = { ...record, next_service_date: newDue };
    } else if (schedule) {
      // Non-recurring schedule: just stamp last_serviced_on.
      await supabase
        .from('asset_maintenance_schedules')
        .update({ last_serviced_on: input.performed_on })
        .eq('user_id', uid)
        .eq('id', schedule.id);
    }
  }

  return { record, journalId, scheduleAdvancedTo };
};

export const updateMaintenanceRecord = async (
  userId: string,
  id: string,
  patch: Partial<AssetMaintenanceRecord>,
): Promise<AssetMaintenanceRecord> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  delete cleaned.journal_id; // protect — journal_id is set by post flow
  const { data, error } = await supabase
    .from('asset_maintenance_records')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetMaintenanceRecord;
};

// ── Journal posting ─────────────────────────────────────────────────────────
export const postMaintenanceJournal = async (
  userId: string,
  record: AssetMaintenanceRecord,
  assetCode: string,
  assetName: string,
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const lines: JournalLineInput[] = [];

  const expenseAcc = await getOrCreateAccount(uid, MAINT_EXPENSE_ACCOUNT_NAME, 'Expense');

  // Dr Repairs & Maintenance Expense. When ITC is NOT eligible, GST adds to cost.
  const expenseDebit = record.itc_eligible ? record.cost : record.cost + record.gst_amount;
  lines.push({
    account_id: expenseAcc,
    debit: round2(expenseDebit),
    credit: 0,
    line_narration: `Maintenance: ${record.record_type} on ${assetCode} — ${assetName}`,
    vendor_id: record.vendor_id || null,
    cost_center_id: record.cost_center_id || null,
    branch_id: record.branch_id || null,
  });

  // Dr Input GST (when ITC eligible & GST > 0)
  if (record.itc_eligible && record.gst_amount > 0) {
    if (record.igst_amount > 0) {
      const igstAcc = await getOrCreateAccount(uid, 'Input IGST', 'Asset');
      lines.push({
        account_id: igstAcc,
        debit: round2(record.igst_amount),
        credit: 0,
        line_narration: 'IGST on maintenance',
        tax_type: 'igst',
      });
    }
    if (record.cgst_amount > 0) {
      const cgstAcc = await getOrCreateAccount(uid, 'Input CGST', 'Asset');
      lines.push({
        account_id: cgstAcc,
        debit: round2(record.cgst_amount),
        credit: 0,
        line_narration: 'CGST on maintenance',
        tax_type: 'cgst',
      });
    }
    if (record.sgst_amount > 0) {
      const sgstAcc = await getOrCreateAccount(uid, 'Input SGST', 'Asset');
      lines.push({
        account_id: sgstAcc,
        debit: round2(record.sgst_amount),
        credit: 0,
        line_narration: 'SGST on maintenance',
        tax_type: 'sgst',
      });
    }
    // Fallback when caller passed only the consolidated gst_amount without the split
    const splitTotal = record.cgst_amount + record.sgst_amount + record.igst_amount;
    if (splitTotal === 0) {
      const itcAcc = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
      lines.push({
        account_id: itcAcc,
        debit: round2(record.gst_amount),
        credit: 0,
        line_narration: 'Input GST on maintenance',
        tax_type: 'itc',
      });
    }
  }

  // Credit side: AP if on credit, Bank/Cash otherwise.
  const totalCredit = round2(record.cost + record.gst_amount);
  if (record.payment_mode === 'credit') {
    const apAcc = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
    lines.push({
      account_id: apAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `Payable to ${record.vendor_name || 'vendor'} for maintenance`,
      vendor_id: record.vendor_id || null,
    });
  } else {
    const acc = record.payment_mode === 'cash' ? 'Cash' : 'Bank';
    const bankAcc = await getOrCreateAccount(uid, acc, 'Asset');
    lines.push({
      account_id: bankAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `${acc} paid for maintenance of ${assetCode}`,
    });
  }

  return postJournal({
    user_id: uid,
    date: record.performed_on,
    narration: `Asset maintenance: ${assetCode} — ${record.record_type}`,
    source_type: 'asset_maintenance',
    source_id: record.id,
    idempotency_key: `asset_maintenance:${record.id}`,
    lines,
  });
};

// ── Aggregates / alerts ─────────────────────────────────────────────────────
export const getMaintenanceSummaryForAsset = async (
  userId: string,
  assetId: string,
): Promise<AssetMaintenanceSummary | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_maintenance_summary')
    .select('*')
    .eq('user_id', uid)
    .eq('asset_id', assetId)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetMaintenanceSummary) || null;
};

export const listAllMaintenanceSummaries = async (
  userId: string,
): Promise<AssetMaintenanceSummary[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_maintenance_summary')
    .select('*')
    .eq('user_id', uid);
  if (error) throw error;
  return (data || []) as AssetMaintenanceSummary[];
};

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

/**
 * Schedules where next_due_date is within `withinDays` of today, plus all
 * overdue ones. Used for the dashboard banner + alerts inbox.
 */
export const listDueMaintenanceAlerts = async (
  userId: string,
  withinDays = 14,
): Promise<MaintenanceDueAlert[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('asset_maintenance_schedules')
    .select('*, fixed_assets!inner(id, asset_code, name)')
    .eq('user_id', uid)
    .eq('is_active', true)
    .lte('next_due_date', horizonIso)
    .order('next_due_date', { ascending: true });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const days = daysBetween(today, row.next_due_date);
    return {
      schedule: row as AssetMaintenanceSchedule,
      asset_code: row.fixed_assets?.asset_code || '',
      asset_name: row.fixed_assets?.name || '',
      days_until_due: days,
      is_overdue: days < 0,
    };
  });
};

export const listAmcExpiringAlerts = async (
  userId: string,
  withinDays = 30,
): Promise<AmcExpiryAlert[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('asset_maintenance_schedules')
    .select('*, fixed_assets!inner(id, asset_code, name)')
    .eq('user_id', uid)
    .eq('schedule_type', 'amc')
    .eq('is_active', true)
    .not('amc_end_date', 'is', null)
    .lte('amc_end_date', horizonIso)
    .order('amc_end_date', { ascending: true });
  if (error) throw error;

  return (data || []).map((row: any) => {
    const days = daysBetween(today, row.amc_end_date);
    return {
      schedule: row as AssetMaintenanceSchedule,
      asset_code: row.fixed_assets?.asset_code || '',
      asset_name: row.fixed_assets?.name || '',
      days_until_expiry: days,
      is_expired: days < 0,
    };
  });
};

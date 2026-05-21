// ════════════════════════════════════════════════════════════════════════════
// Lease Asset Management Service (Module 6)
//
// Lifecycle:
//   draft → activate → (post payments...) → expired / terminated
//
// Operating / rental lease:
//   No recognition journal. Each payment posts:
//     Dr Lease Rental Expense
//     Dr Input GST (when ITC eligible & GST > 0)
//     Cr Bank / Cash / AP
//
// Finance lease (Ind AS 116):
//   Recognition (on activate):
//     Dr Right-of-Use Asset       (PV of payments)
//     Cr Lease Liability          (PV of payments)
//   Each payment (effective-interest method):
//     Dr Lease Liability          (principal portion)
//     Dr Lease Interest Expense   (interest portion)
//     Dr Input GST                (when ITC eligible)
//     Cr Bank                     (total + GST)
//   Termination with remaining balance written off:
//     Dr Lease Liability          (remaining)
//     Cr Gain on Lease Termination
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  CreateLeaseInput,
  LeaseContract,
  LeaseDueAlert,
  LeasePaymentScheduleRow,
  LeaseSummary,
  PostLeasePaymentInput,
  TerminateLeaseInput,
} from '@/types/lease';

const round2 = (n: number) => Math.round(n * 100) / 100;

const ROU_ASSET_ACCOUNT_NAME      = 'Right-of-Use Asset';
const LEASE_LIABILITY_ACCOUNT_NAME = 'Lease Liability';
const LEASE_INTEREST_ACCOUNT_NAME  = 'Lease Interest Expense';
const RENT_EXPENSE_ACCOUNT_NAME    = 'Lease Rental Expense';
const TERMINATION_GAIN_ACCOUNT_NAME = 'Gain on Lease Termination';

const PERIODS_PER_YEAR: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
};

const addPeriods = (isoDate: string, freq: string, n: number): string => {
  const d = new Date(isoDate + 'T00:00:00Z');
  const monthsAdd =
    freq === 'monthly'    ? n :
    freq === 'quarterly'  ? n * 3 :
    freq === 'semi_annual'? n * 6 :
                            n * 12;
  d.setUTCMonth(d.getUTCMonth() + monthsAdd);
  return d.toISOString().slice(0, 10);
};

const periodCount = (start: string, end: string, freq: string): number => {
  const s = new Date(start + 'T00:00:00Z');
  const e = new Date(end + 'T00:00:00Z');
  const monthsBetween = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 +
                        (e.getUTCMonth() - s.getUTCMonth());
  const ppy = PERIODS_PER_YEAR[freq] || 12;
  const monthsPerPeriod = 12 / ppy;
  return Math.max(1, Math.round(monthsBetween / monthsPerPeriod));
};

const presentValueAnnuity = (payment: number, periodRate: number, n: number, advance = false): number => {
  if (periodRate === 0) return payment * n;
  const pv = payment * (1 - Math.pow(1 + periodRate, -n)) / periodRate;
  return advance ? pv * (1 + periodRate) : pv;
};

const nextLeaseCode = async (userId: string): Promise<string> => {
  const uid = normalizeUserId(userId);
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('lease_contracts')
    .select('lease_code')
    .eq('user_id', uid)
    .like('lease_code', `LEA/${year}/%`)
    .order('lease_code', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).lease_code.match(/LEA\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `LEA/${year}/${String(seq).padStart(4, '0')}`;
};

// ── Reads ───────────────────────────────────────────────────────────────────
export const listLeases = async (userId: string): Promise<LeaseSummary[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_lease_summary')
    .select('*')
    .eq('user_id', uid)
    .order('start_date', { ascending: false });
  if (error) throw error;
  return (data || []) as LeaseSummary[];
};

export const getLease = async (userId: string, id: string): Promise<LeaseContract | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('lease_contracts')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as LeaseContract) || null;
};

export const listLeaseSchedule = async (
  userId: string,
  leaseId: string,
): Promise<LeasePaymentScheduleRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('lease_payment_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('lease_id', leaseId)
    .order('period_index');
  if (error) throw error;
  return (data || []) as LeasePaymentScheduleRow[];
};

// ── Create (status = draft) ─────────────────────────────────────────────────
export const createLease = async (
  userId: string,
  input: CreateLeaseInput,
): Promise<LeaseContract> => {
  const uid = normalizeUserId(userId);
  if (input.lease_type === 'finance' && (input.discount_rate_annual === undefined || input.discount_rate_annual === null)) {
    throw new Error('Finance leases require an annual discount rate.');
  }

  const leaseCode = input.lease_code || (await nextLeaseCode(uid));
  const payload = {
    user_id: uid,
    lease_code: leaseCode,
    lease_type: input.lease_type,
    name: input.name,
    description: input.description || null,
    asset_id: input.asset_id || null,
    lessor_name: input.lessor_name,
    lessor_contact: input.lessor_contact || null,
    vendor_id: input.vendor_id || null,
    start_date: input.start_date,
    end_date: input.end_date,
    payment_frequency: input.payment_frequency || 'monthly',
    payment_amount: round2(input.payment_amount),
    gst_amount_per_period: round2(input.gst_amount_per_period || 0),
    itc_eligible: input.itc_eligible ?? true,
    payments_in_advance: input.payments_in_advance ?? false,
    security_deposit: round2(input.security_deposit || 0),
    discount_rate_annual: input.discount_rate_annual ?? null,
    reminder_days_before: input.reminder_days_before ?? 5,
    status: 'draft' as const,
    cost_center_id: input.cost_center_id || null,
    branch_id: input.branch_id || null,
    department: input.department || null,
    document_url: input.document_url || null,
    notes: input.notes || null,
    created_by: uid,
  };

  const { data, error } = await supabase
    .from('lease_contracts')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data as LeaseContract;
};

// ── Activate (generate schedule + post recognition for finance leases) ─────
export interface ActivateLeaseResult {
  lease: LeaseContract;
  recognitionJournalId: string | null;
  scheduleRows: number;
}

export const activateLease = async (
  userId: string,
  id: string,
): Promise<ActivateLeaseResult> => {
  const uid = normalizeUserId(userId);
  const lease = await getLease(uid, id);
  if (!lease) throw new Error('Lease not found.');
  if (lease.status !== 'draft') throw new Error(`Lease already activated (status: ${lease.status}).`);

  const n = periodCount(lease.start_date, lease.end_date, lease.payment_frequency);
  const ppy = PERIODS_PER_YEAR[lease.payment_frequency] || 12;

  // Build schedule rows
  let rou = 0;
  let openLiab = 0;
  const rows: Array<Partial<LeasePaymentScheduleRow> & { user_id: string; lease_id: string }> = [];

  if (lease.lease_type === 'finance') {
    const periodRate = (Number(lease.discount_rate_annual) / 100) / ppy;
    rou = round2(presentValueAnnuity(lease.payment_amount, periodRate, n, lease.payments_in_advance));
    openLiab = rou;
    let running = rou;
    for (let i = 0; i < n; i++) {
      const due = addPeriods(lease.start_date, lease.payment_frequency, lease.payments_in_advance ? i : i + 1);
      const interest = round2(running * periodRate);
      const principal = round2(lease.payment_amount - interest);
      const closing = round2(running - principal);
      rows.push({
        user_id: uid,
        lease_id: lease.id,
        period_index: i + 1,
        due_date: due,
        total_payment: round2(lease.payment_amount),
        principal_portion: principal,
        interest_portion: interest,
        gst_amount: round2(lease.gst_amount_per_period),
        opening_liability: round2(running),
        closing_liability: Math.max(0, closing),
        status: 'planned',
      });
      running = Math.max(0, closing);
    }
  } else {
    // operating / rental — flat schedule
    for (let i = 0; i < n; i++) {
      const due = addPeriods(lease.start_date, lease.payment_frequency, lease.payments_in_advance ? i : i + 1);
      rows.push({
        user_id: uid,
        lease_id: lease.id,
        period_index: i + 1,
        due_date: due,
        total_payment: round2(lease.payment_amount),
        principal_portion: round2(lease.payment_amount),
        interest_portion: 0,
        gst_amount: round2(lease.gst_amount_per_period),
        opening_liability: 0,
        closing_liability: 0,
        status: 'planned',
      });
    }
  }

  if (rows.length > 0) {
    const { error: schedErr } = await supabase.from('lease_payment_schedule').insert(rows);
    if (schedErr) throw schedErr;
  }

  // Post recognition journal for finance leases
  let recognitionJournalId: string | null = null;
  if (lease.lease_type === 'finance' && rou > 0) {
    const rouAcc = await getOrCreateAccount(uid, ROU_ASSET_ACCOUNT_NAME, 'Asset');
    const liabAcc = await getOrCreateAccount(uid, LEASE_LIABILITY_ACCOUNT_NAME, 'Liability');
    const lines: JournalLineInput[] = [
      {
        account_id: rouAcc,
        debit: rou,
        credit: 0,
        line_narration: `ROU asset — lease ${lease.lease_code}`,
        cost_center_id: lease.cost_center_id || null,
        branch_id: lease.branch_id || null,
      },
      {
        account_id: liabAcc,
        debit: 0,
        credit: rou,
        line_narration: `Lease liability — lessor ${lease.lessor_name}`,
        vendor_id: lease.vendor_id || null,
        cost_center_id: lease.cost_center_id || null,
        branch_id: lease.branch_id || null,
      },
    ];
    recognitionJournalId = await postJournal({
      user_id: uid,
      date: lease.start_date,
      narration: `Lease recognition — ${lease.lease_code} ${lease.name}`,
      source_type: 'lease_recognition',
      source_id: lease.id,
      idempotency_key: `lease_recognition:${lease.id}`,
      lines,
    });
  }

  // Update lease row
  const { data, error } = await supabase
    .from('lease_contracts')
    .update({
      status: 'active',
      rou_asset_value: lease.lease_type === 'finance' ? rou : null,
      opening_liability: lease.lease_type === 'finance' ? openLiab : null,
      outstanding_liability: lease.lease_type === 'finance' ? openLiab : 0,
      recognition_journal_id: recognitionJournalId,
    })
    .eq('user_id', uid)
    .eq('id', lease.id)
    .select('*')
    .single();
  if (error) throw error;

  return { lease: data as LeaseContract, recognitionJournalId, scheduleRows: rows.length };
};

// ── Post a single payment ───────────────────────────────────────────────────
export interface PostLeasePaymentResult {
  journalId: string;
  row: LeasePaymentScheduleRow;
}

export const postLeasePayment = async (
  userId: string,
  input: PostLeasePaymentInput,
): Promise<PostLeasePaymentResult> => {
  const uid = normalizeUserId(userId);

  const { data: rowData, error: rowErr } = await supabase
    .from('lease_payment_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.schedule_row_id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!rowData) throw new Error('Schedule row not found.');
  const row = rowData as LeasePaymentScheduleRow;
  if (row.status === 'paid') throw new Error('Payment already posted.');

  const lease = await getLease(uid, row.lease_id);
  if (!lease) throw new Error('Lease not found.');

  const paidOn = input.paid_on || row.due_date;
  const paymentMode = input.payment_mode || 'bank';
  const itcEligible = lease.itc_eligible;
  const gst = row.gst_amount;

  const lines: JournalLineInput[] = [];

  if (lease.lease_type === 'finance') {
    const liabAcc = await getOrCreateAccount(uid, LEASE_LIABILITY_ACCOUNT_NAME, 'Liability');
    const interestAcc = await getOrCreateAccount(uid, LEASE_INTEREST_ACCOUNT_NAME, 'Expense');
    if (row.principal_portion > 0) {
      lines.push({
        account_id: liabAcc,
        debit: round2(row.principal_portion),
        credit: 0,
        line_narration: `Lease principal — ${lease.lease_code} period ${row.period_index}`,
        vendor_id: lease.vendor_id || null,
        cost_center_id: lease.cost_center_id || null,
      });
    }
    if (row.interest_portion > 0) {
      lines.push({
        account_id: interestAcc,
        debit: round2(row.interest_portion),
        credit: 0,
        line_narration: `Lease interest — ${lease.lease_code} period ${row.period_index}`,
        cost_center_id: lease.cost_center_id || null,
      });
    }
  } else {
    // operating / rental — full payment to Lease Rental Expense
    const rentAcc = await getOrCreateAccount(uid, RENT_EXPENSE_ACCOUNT_NAME, 'Expense');
    lines.push({
      account_id: rentAcc,
      debit: round2(row.total_payment + (!itcEligible ? gst : 0)),
      credit: 0,
      line_narration: `Lease rent — ${lease.lease_code} period ${row.period_index}`,
      vendor_id: lease.vendor_id || null,
      cost_center_id: lease.cost_center_id || null,
      branch_id: lease.branch_id || null,
    });
  }

  // GST (when ITC eligible)
  if (itcEligible && gst > 0) {
    const itcAcc = await getOrCreateAccount(uid, 'Input Tax Credit', 'Asset');
    lines.push({
      account_id: itcAcc,
      debit: round2(gst),
      credit: 0,
      line_narration: `Input GST on lease payment`,
      tax_type: 'itc',
    });
  }

  // Cr Bank / Cash / AP
  const totalCredit = round2(row.total_payment + gst);
  if (paymentMode === 'credit') {
    const apAcc = await getOrCreateAccount(uid, 'Accounts Payable', 'Liability');
    lines.push({
      account_id: apAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `Payable to ${lease.lessor_name} for lease`,
      vendor_id: lease.vendor_id || null,
    });
  } else {
    const accName = paymentMode === 'cash' ? 'Cash' : 'Bank';
    const bankAcc = await getOrCreateAccount(uid, accName, 'Asset');
    lines.push({
      account_id: bankAcc,
      debit: 0,
      credit: totalCredit,
      line_narration: `${accName} paid for ${lease.lease_code} period ${row.period_index}`,
    });
  }

  const journalId = await postJournal({
    user_id: uid,
    date: paidOn,
    narration: `Lease payment — ${lease.lease_code} period ${row.period_index}`,
    source_type: 'lease_payment',
    source_id: row.id,
    idempotency_key: `lease_payment:${row.id}`,
    lines,
  });

  // Update schedule row
  const { data: updatedRow, error: upErr } = await supabase
    .from('lease_payment_schedule')
    .update({
      status: 'paid',
      paid_on: paidOn,
      payment_mode: paymentMode,
      journal_id: journalId,
      posted_by: uid,
    })
    .eq('user_id', uid)
    .eq('id', row.id)
    .select('*')
    .single();
  if (upErr) throw upErr;

  // Decrement outstanding liability on the lease (finance only)
  if (lease.lease_type === 'finance') {
    await supabase
      .from('lease_contracts')
      .update({ outstanding_liability: Math.max(0, lease.outstanding_liability - row.principal_portion) })
      .eq('user_id', uid)
      .eq('id', lease.id);
  }

  return { journalId, row: updatedRow as LeasePaymentScheduleRow };
};

// ── Terminate lease ─────────────────────────────────────────────────────────
export const terminateLease = async (
  userId: string,
  input: TerminateLeaseInput,
): Promise<LeaseContract> => {
  const uid = normalizeUserId(userId);
  const lease = await getLease(uid, input.lease_id);
  if (!lease) throw new Error('Lease not found.');
  if (lease.status === 'terminated' || lease.status === 'expired') {
    throw new Error('Lease already closed.');
  }

  let terminationJournalId: string | null = null;
  if (lease.lease_type === 'finance' && lease.outstanding_liability > 0 && input.write_off_remaining_liability) {
    const liabAcc = await getOrCreateAccount(uid, LEASE_LIABILITY_ACCOUNT_NAME, 'Liability');
    const gainAcc = await getOrCreateAccount(uid, TERMINATION_GAIN_ACCOUNT_NAME, 'Income');
    terminationJournalId = await postJournal({
      user_id: uid,
      date: input.termination_date,
      narration: `Lease termination — ${lease.lease_code}${input.reason ? ' — ' + input.reason : ''}`,
      source_type: 'lease_termination',
      source_id: lease.id,
      idempotency_key: `lease_termination:${lease.id}`,
      lines: [
        {
          account_id: liabAcc,
          debit: round2(lease.outstanding_liability),
          credit: 0,
          line_narration: `Write-off lease liability`,
          vendor_id: lease.vendor_id || null,
        },
        {
          account_id: gainAcc,
          debit: 0,
          credit: round2(lease.outstanding_liability),
          line_narration: `Gain on lease termination`,
          cost_center_id: lease.cost_center_id || null,
        },
      ],
    });
  }

  // Cancel any still-planned schedule rows
  await supabase
    .from('lease_payment_schedule')
    .update({ status: 'skipped' })
    .eq('user_id', uid)
    .eq('lease_id', lease.id)
    .eq('status', 'planned');

  const { data, error } = await supabase
    .from('lease_contracts')
    .update({
      status: 'terminated',
      termination_date: input.termination_date,
      termination_journal_id: terminationJournalId,
      outstanding_liability: input.write_off_remaining_liability ? 0 : lease.outstanding_liability,
      notes: input.reason ? `${lease.notes ? lease.notes + '\n' : ''}Terminated: ${input.reason}` : lease.notes,
    })
    .eq('user_id', uid)
    .eq('id', lease.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as LeaseContract;
};

// ── Alerts ──────────────────────────────────────────────────────────────────
const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};

export const listDueLeasePayments = async (
  userId: string,
  withinDays = 14,
): Promise<LeaseDueAlert[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('lease_payment_schedule')
    .select('*, lease_contracts!inner(*)')
    .eq('user_id', uid)
    .eq('status', 'planned')
    .lte('due_date', horizonIso)
    .order('due_date');
  if (error) throw error;

  return (data || []).map((row: any) => {
    const days = daysBetween(today, row.due_date);
    return {
      lease: row.lease_contracts as LeaseContract,
      next_payment: row as LeasePaymentScheduleRow,
      days_until_due: days,
      is_overdue: days < 0,
    };
  });
};

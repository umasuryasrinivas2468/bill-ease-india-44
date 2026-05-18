// ════════════════════════════════════════════════════════════════════════════
// Liability & Loan Service
//
// Manages liabilities (loans, credit lines, advances received, tax & other
// long-term payables) and their EMI schedules. Posts:
//   - loan disbursement journal:
//       Dr Bank
//       Cr Loan Liability
//   - EMI payment journal:
//       Dr Loan Liability    (principal portion)
//       Dr Interest Expense  (interest portion)
//       Cr Bank              (total EMI)
//
// EMI generation uses the standard reducing-balance amortisation formula.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal, type JournalLineInput } from '@/utils/journalEngine';
import type {
  CreateLiabilityInput,
  Liability,
  LoanEmiRow,
} from '@/types/liabilities';

const round2 = (n: number) => Math.round(n * 100) / 100;

// ── Naming ──────────────────────────────────────────────────────────────────
export const LIABILITY_ACCOUNT_NAME = (code: string, name: string) =>
  `Loan/Liability - ${code} - ${name.slice(0, 40)}`;
export const INTEREST_EXPENSE_ACCOUNT = 'Interest Expense';

// ── ID generators ───────────────────────────────────────────────────────────
const nextLiabilityCode = async (userId: string): Promise<string> => {
  const uid = normalizeUserId(userId);
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('liabilities')
    .select('liability_code')
    .eq('user_id', uid)
    .like('liability_code', `LIAB/${year}/%`)
    .order('liability_code', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = data[0].liability_code.match(/LIAB\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `LIAB/${year}/${String(seq).padStart(4, '0')}`;
};

// ── Reads ───────────────────────────────────────────────────────────────────
export const listLiabilities = async (userId: string): Promise<Liability[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Liability[];
};

export const getLiability = async (userId: string, id: string): Promise<Liability | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as Liability) || null;
};

export const listEmiSchedule = async (
  userId: string,
  liabilityId: string,
): Promise<LoanEmiRow[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('loan_emi_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('liability_id', liabilityId)
    .order('emi_number');
  if (error) throw error;
  return (data || []) as LoanEmiRow[];
};

export const listUpcomingEmis = async (
  userId: string,
  withinDays = 30,
): Promise<(LoanEmiRow & { liability_name: string; lender_name: string | null })[]> => {
  const uid = normalizeUserId(userId);
  const today = new Date();
  const horizon = new Date(today.getTime() + withinDays * 86400000);
  const { data, error } = await supabase
    .from('loan_emi_schedule')
    .select('*, liability:liabilities!inner(name, lender_name)')
    .eq('user_id', uid)
    .in('status', ['planned', 'overdue', 'partial'])
    .lte('due_date', horizon.toISOString().slice(0, 10))
    .order('due_date');
  if (error) throw error;
  return (data || []).map((row: any) => ({
    ...row,
    liability_name: row.liability?.name || '',
    lender_name: row.liability?.lender_name || null,
  }));
};

// ── EMI math ────────────────────────────────────────────────────────────────
/** Reducing-balance EMI amount for a fixed-rate, fixed-tenure loan. */
export const calculateEmi = (
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): number => {
  if (principal <= 0 || tenureMonths <= 0) return 0;
  const r = annualRatePct / 12 / 100;
  if (r === 0) return round2(principal / tenureMonths);
  const num = principal * r * Math.pow(1 + r, tenureMonths);
  const den = Math.pow(1 + r, tenureMonths) - 1;
  return round2(num / den);
};

const addMonths = (d: Date, m: number) => new Date(d.getFullYear(), d.getMonth() + m, d.getDate());

/** Pure amortisation calculator (no DB). */
export const computeEmiSchedule = (params: {
  principal: number;
  annualRate: number;
  tenureMonths: number;
  startDate: string; // YYYY-MM-DD
  emiDay?: number;   // day of month
}): Omit<LoanEmiRow, 'id' | 'user_id' | 'liability_id' | 'status' | 'paid_amount' | 'paid_on' | 'journal_id' | 'notes' | 'created_at'>[] => {
  const { principal, annualRate, tenureMonths } = params;
  const emi = calculateEmi(principal, annualRate, tenureMonths);
  const r = annualRate / 12 / 100;
  const start = new Date(params.startDate);
  const emiDay = params.emiDay && params.emiDay >= 1 && params.emiDay <= 31
    ? params.emiDay
    : start.getDate();

  const out: ReturnType<typeof computeEmiSchedule> = [];
  let balance = principal;
  for (let i = 1; i <= tenureMonths; i++) {
    const interest = round2(balance * r);
    let principalComp = round2(emi - interest);
    let totalEmi = emi;
    if (i === tenureMonths) {
      // Adjust last EMI for rounding drift so closing balance hits zero.
      principalComp = round2(balance);
      totalEmi = round2(principalComp + interest);
    }
    const closing = round2(balance - principalComp);
    const due = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const lastDay = new Date(due.getFullYear(), due.getMonth() + 1, 0).getDate();
    due.setDate(Math.min(emiDay, lastDay));
    out.push({
      emi_number: i,
      due_date: due.toISOString().slice(0, 10),
      opening_balance: round2(balance),
      principal_component: principalComp,
      interest_component: interest,
      total_emi: totalEmi,
      closing_balance: Math.max(0, closing),
    });
    balance = closing;
  }
  return out;
};

// ── Create + disburse ───────────────────────────────────────────────────────
export interface CreateLiabilityResult {
  liability: Liability;
  disbursementJournalId: string | null;
  emiRows: number;
}

export const createLiability = async (
  userId: string,
  input: CreateLiabilityInput,
): Promise<CreateLiabilityResult> => {
  const uid = normalizeUserId(userId);
  const code = await nextLiabilityCode(uid);

  const liabilityAccountId = await getOrCreateAccount(
    uid,
    LIABILITY_ACCOUNT_NAME(code, input.name),
    'Liability',
  );
  const interestAccountId = await getOrCreateAccount(uid, INTEREST_EXPENSE_ACCOUNT, 'Expense');

  const principal = round2(input.principal_amount);
  const tenure = input.tenure_months || 0;
  const annualRate = input.interest_rate ?? 0;
  const emi = input.liability_type === 'loan' && tenure > 0
    ? calculateEmi(principal, annualRate, tenure)
    : null;

  const startDate = input.start_date || new Date().toISOString().slice(0, 10);
  const endDate = tenure > 0
    ? addMonths(new Date(startDate), tenure).toISOString().slice(0, 10)
    : null;

  const { data, error } = await supabase
    .from('liabilities')
    .insert({
      user_id: uid,
      liability_code: code,
      name: input.name,
      liability_type: input.liability_type,
      lender_name: input.lender_name || null,
      lender_contact: input.lender_contact || null,
      vendor_id: input.vendor_id || null,
      principal_amount: principal,
      disbursed_amount: 0,
      outstanding_principal: principal,
      interest_rate: annualRate,
      interest_type: input.interest_type || 'reducing',
      tenure_months: tenure || null,
      emi_amount: emi,
      emi_day_of_month: input.emi_day_of_month || null,
      start_date: startDate,
      end_date: endDate,
      status: 'active',
      liability_account_id: liabilityAccountId,
      interest_expense_account_id: interestAccountId,
      account_number: input.account_number || null,
      notes: input.notes || null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  const liability = data as Liability;

  let disbursementJournalId: string | null = null;
  let emiRows = 0;

  if (input.disburse_now && principal > 0) {
    disbursementJournalId = await postLoanDisbursement(
      uid,
      liability,
      input.receive_into || 'Bank',
    );
    if (input.liability_type === 'loan' && tenure > 0) {
      emiRows = await generateEmiSchedule(uid, liability.id);
    }
  }

  await supabase.from('liability_audit_log').insert({
    user_id: uid,
    liability_id: liability.id,
    action: 'created',
    after_state: liability as unknown as Record<string, unknown>,
    actor: uid,
  });

  return { liability, disbursementJournalId, emiRows };
};

// ── Journals ────────────────────────────────────────────────────────────────
export const postLoanDisbursement = async (
  userId: string,
  liability: Liability,
  receiveInto: string,
): Promise<string> => {
  const uid = normalizeUserId(userId);
  const bankAcc = await getOrCreateAccount(uid, receiveInto, 'Asset');
  const principal = round2(liability.principal_amount);

  const lines: JournalLineInput[] = [
    {
      account_id: bankAcc,
      debit: principal,
      credit: 0,
      line_narration: `Loan disbursement received from ${liability.lender_name || liability.name}`,
    },
    {
      account_id: liability.liability_account_id!,
      debit: 0,
      credit: principal,
      line_narration: `Loan liability — ${liability.liability_code}`,
    },
  ];

  const journalId = await postJournal({
    user_id: uid,
    date: liability.start_date || new Date().toISOString().slice(0, 10),
    narration: `Loan disbursement: ${liability.liability_code} — ${liability.name}`,
    source_type: 'loan_disbursement',
    source_id: liability.id,
    idempotency_key: `loan_disbursement:${liability.id}`,
    lines,
  });

  await supabase
    .from('liabilities')
    .update({
      disbursed_amount: principal,
      next_due_date: null, // will be set when EMI schedule is generated
    })
    .eq('id', liability.id);

  return journalId;
};

// ── Generate EMI rows from liability config ─────────────────────────────────
export const generateEmiSchedule = async (
  userId: string,
  liabilityId: string,
): Promise<number> => {
  const uid = normalizeUserId(userId);
  const { data: liab } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', uid)
    .eq('id', liabilityId)
    .maybeSingle();
  if (!liab) throw new Error('Liability not found.');
  if (liab.liability_type !== 'loan') return 0;
  if (!liab.tenure_months || !liab.start_date) return 0;

  // Clear any existing planned rows; keep paid ones.
  await supabase
    .from('loan_emi_schedule')
    .delete()
    .eq('user_id', uid)
    .eq('liability_id', liabilityId)
    .eq('status', 'planned');

  const plan = computeEmiSchedule({
    principal: Number(liab.principal_amount),
    annualRate: Number(liab.interest_rate || 0),
    tenureMonths: Number(liab.tenure_months),
    startDate: liab.start_date,
    emiDay: liab.emi_day_of_month || undefined,
  });

  const rows = plan.map((p) => ({
    user_id: uid,
    liability_id: liabilityId,
    emi_number: p.emi_number,
    due_date: p.due_date,
    opening_balance: p.opening_balance,
    principal_component: p.principal_component,
    interest_component: p.interest_component,
    total_emi: p.total_emi,
    closing_balance: p.closing_balance,
    status: 'planned' as const,
  }));
  const { error } = await supabase.from('loan_emi_schedule').upsert(rows, {
    onConflict: 'liability_id,emi_number',
  });
  if (error) throw error;

  // Set next_due_date on the liability
  if (plan.length > 0) {
    await supabase
      .from('liabilities')
      .update({ next_due_date: plan[0].due_date })
      .eq('id', liabilityId);
  }

  return rows.length;
};

// ── Pay an EMI (or part of it) ──────────────────────────────────────────────
export interface PayEmiInput {
  emi_id: string;
  payment_date: string;
  payment_mode?: 'bank' | 'cash';
  amount?: number; // defaults to total_emi
}

export const payEmi = async (
  userId: string,
  input: PayEmiInput,
): Promise<{ journalId: string; emi: LoanEmiRow }> => {
  const uid = normalizeUserId(userId);
  const { data: emi, error } = await supabase
    .from('loan_emi_schedule')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.emi_id)
    .maybeSingle();
  if (error) throw error;
  if (!emi) throw new Error('EMI not found.');
  if (emi.status === 'paid') throw new Error('EMI is already paid.');

  const { data: liab } = await supabase
    .from('liabilities')
    .select('*')
    .eq('user_id', uid)
    .eq('id', emi.liability_id)
    .maybeSingle();
  if (!liab) throw new Error('Liability missing.');

  // Allow partial payments — apportion proportionally.
  const fullEmi = Number(emi.total_emi);
  const amount = input.amount ? Math.min(Number(input.amount), fullEmi) : fullEmi;
  const ratio = amount / fullEmi;
  const principalPaid = round2(Number(emi.principal_component) * ratio);
  const interestPaid = round2(amount - principalPaid);

  const bankName = input.payment_mode === 'cash' ? 'Cash' : 'Bank';
  const bankAcc = await getOrCreateAccount(uid, bankName, 'Asset');

  const lines: JournalLineInput[] = [
    {
      account_id: liab.liability_account_id!,
      debit: principalPaid,
      credit: 0,
      line_narration: `Principal repayment — ${liab.liability_code} (EMI ${emi.emi_number})`,
    },
    {
      account_id: liab.interest_expense_account_id!,
      debit: interestPaid,
      credit: 0,
      line_narration: `Interest expense — ${liab.liability_code} (EMI ${emi.emi_number})`,
    },
    {
      account_id: bankAcc,
      debit: 0,
      credit: round2(amount),
      line_narration: `EMI payment ${emi.emi_number} for ${liab.name}`,
    },
  ];

  const journalId = await postJournal({
    user_id: uid,
    date: input.payment_date,
    narration: `EMI ${emi.emi_number} payment: ${liab.liability_code}`,
    source_type: 'loan_emi',
    source_id: emi.id,
    idempotency_key: `loan_emi:${emi.id}`,
    lines,
  });

  const fullyPaid = Math.abs(amount - fullEmi) < 0.01;
  const newStatus = fullyPaid ? 'paid' : 'partial';

  await supabase
    .from('loan_emi_schedule')
    .update({
      status: newStatus,
      paid_amount: round2(Number(emi.paid_amount) + amount),
      paid_on: input.payment_date,
      journal_id: journalId,
    })
    .eq('id', emi.id);

  // Update liability outstanding & next due
  const newOutstanding = Math.max(0, round2(Number(liab.outstanding_principal) - principalPaid));
  const { data: nextEmi } = await supabase
    .from('loan_emi_schedule')
    .select('due_date')
    .eq('liability_id', liab.id)
    .in('status', ['planned', 'overdue', 'partial'])
    .gt('emi_number', emi.emi_number)
    .order('emi_number')
    .limit(1)
    .maybeSingle();

  await supabase
    .from('liabilities')
    .update({
      outstanding_principal: newOutstanding,
      total_interest_paid: round2(Number(liab.total_interest_paid) + interestPaid),
      next_due_date: nextEmi?.due_date || null,
      status: newOutstanding <= 0.01 ? 'closed' : 'active',
      closed_at: newOutstanding <= 0.01 ? input.payment_date : null,
    })
    .eq('id', liab.id);

  const { data: updatedEmi } = await supabase
    .from('loan_emi_schedule')
    .select('*')
    .eq('id', emi.id)
    .maybeSingle();

  return { journalId, emi: (updatedEmi as LoanEmiRow) || (emi as LoanEmiRow) };
};

// ── Generic update ──────────────────────────────────────────────────────────
export const updateLiability = async (
  userId: string,
  id: string,
  patch: Partial<Liability>,
): Promise<Liability> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.liability_code;
  delete cleaned.created_at;
  delete cleaned.created_by;

  const { data, error } = await supabase
    .from('liabilities')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Liability;
};

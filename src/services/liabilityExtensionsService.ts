// ════════════════════════════════════════════════════════════════════════════
// Liability Extensions Service (Phase 6: Modules 10-14)
//
// One service file covers five related modules built on top of the existing
// liabilities + loan_emi_schedule tables. Splitting into five files would be
// over-engineered — the modules share the same `liabilities` aggregate and
// the same query patterns.
//
// Sections:
//   - Module 10: Classification (auto + override)
//   - Module 11: Interest accrual (one period at a time + bulk)
//   - Module 12: Forecasting (read-only aggregates)
//   - Module 13: Covenants & compliance checks
//   - Module 14: Net worth & solvency snapshot
//
// Journal posting reuses 'loan_interest_accrual' (already in the journals
// source_type CHECK from the original liabilities migration).
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { getOrCreateAccount, postJournal } from '@/utils/journalEngine';
import type {
  AccrueInterestInput,
  ClassificationRollup,
  CovenantDeadlineAlert,
  CreateCovenantInput,
  LiabilityClassification,
  LiabilityCovenant,
  LiabilityCovenantCheck,
  LiabilityCovenantEnriched,
  LiabilityForecastSummary,
  LiabilityInterestAccrual,
  NetWorthSnapshot,
  RecordCovenantCheckInput,
  UpcomingEmiForecast,
} from '@/types/liabilityExtensions';

const round2 = (n: number) => Math.round(n * 100) / 100;
const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso + 'T00:00:00Z').getTime();
  const b = new Date(toIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
};
const today = () => new Date().toISOString().slice(0, 10);

const INTEREST_PAYABLE_ACCOUNT = 'Interest Payable';
const INTEREST_EXPENSE_ACCOUNT = 'Interest Expense';

// ════════════════════════════════════════════════════════════════════════════
// Module 10: Classification
// ════════════════════════════════════════════════════════════════════════════

export const listClassifications = async (userId: string): Promise<LiabilityClassification[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_liability_classification')
    .select('*')
    .eq('user_id', uid)
    .order('outstanding_principal', { ascending: false });
  if (error) throw error;
  return (data || []) as LiabilityClassification[];
};

export const getClassificationRollup = async (userId: string): Promise<ClassificationRollup> => {
  const rows = await listClassifications(userId);
  const total_outstanding = round2(rows.reduce((s, r) => s + r.outstanding_principal, 0));
  const current_total     = round2(rows.reduce((s, r) => s + r.current_portion, 0));
  const non_current_total = round2(rows.reduce((s, r) => s + r.non_current_portion, 0));
  const secured_total     = round2(rows.filter(r => r.is_secured).reduce((s, r) => s + r.outstanding_principal, 0));
  const unsecured_total   = round2(rows.filter(r => !r.is_secured).reduce((s, r) => s + r.outstanding_principal, 0));
  const statutory_total   = round2(rows.filter(r => r.is_statutory).reduce((s, r) => s + r.outstanding_principal, 0));
  const byTypeMap = new Map<string, number>();
  for (const r of rows) {
    byTypeMap.set(r.liability_type, (byTypeMap.get(r.liability_type) || 0) + r.outstanding_principal);
  }
  const by_type = [...byTypeMap.entries()]
    .map(([liability_type, total]) => ({ liability_type, total: round2(total) }))
    .sort((a, b) => b.total - a.total);
  return { total_outstanding, current_total, non_current_total, secured_total, unsecured_total, statutory_total, by_type };
};

export const updateLiabilityClassification = async (
  userId: string,
  liabilityId: string,
  patch: {
    is_secured?: boolean;
    is_statutory?: boolean;
    collateral_description?: string;
    collateral_value?: number;
    classification_override?: 'current' | 'non_current' | null;
  },
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('liabilities')
    .update({
      is_secured: patch.is_secured,
      is_statutory: patch.is_statutory,
      collateral_description: patch.collateral_description,
      collateral_value: patch.collateral_value,
      classification_override: patch.classification_override,
    })
    .eq('user_id', uid)
    .eq('id', liabilityId);
  if (error) throw error;
};

// ════════════════════════════════════════════════════════════════════════════
// Module 11: Interest Accrual
// ════════════════════════════════════════════════════════════════════════════

const monthEnd = (iso: string): string => {
  const d = new Date(iso + 'T00:00:00Z');
  const e = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return e.toISOString().slice(0, 10);
};

const addDays = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const listInterestAccruals = async (
  userId: string,
  liabilityId?: string,
): Promise<LiabilityInterestAccrual[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('liability_interest_accruals')
    .select('*')
    .eq('user_id', uid)
    .order('period_end', { ascending: false });
  if (liabilityId) q = q.eq('liability_id', liabilityId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LiabilityInterestAccrual[];
};

export interface AccrueResult {
  accrual: LiabilityInterestAccrual;
  journalId: string | null;
}

export const accrueInterestForLiability = async (
  userId: string,
  input: AccrueInterestInput,
): Promise<AccrueResult> => {
  const uid = normalizeUserId(userId);

  const { data: liabRow } = await supabase
    .from('liabilities')
    .select('id, liability_code, name, outstanding_principal, interest_rate, interest_type, last_accrued_through, start_date, interest_payable_account_id, liability_account_id, cost_center_id, branch_id, vendor_id, status')
    .eq('user_id', uid)
    .eq('id', input.liability_id)
    .maybeSingle();
  if (!liabRow) throw new Error('Liability not found.');
  const liab = liabRow as any;

  if (liab.status !== 'active' && liab.status !== 'restructured') {
    throw new Error(`Cannot accrue interest on a ${liab.status} liability.`);
  }
  if (!liab.interest_rate || liab.interest_type === 'none') {
    throw new Error('Liability has no interest rate configured.');
  }

  // Determine period
  const periodStart = input.period_start
    || (liab.last_accrued_through ? addDays(liab.last_accrued_through, 1) : liab.start_date)
    || today();
  const periodEnd = input.period_end;
  if (periodEnd < periodStart) {
    throw new Error(`period_end (${periodEnd}) must be on or after period_start (${periodStart}).`);
  }

  const days = daysBetween(periodStart, periodEnd) + 1;   // inclusive
  const opening = round2(Number(liab.outstanding_principal || 0));
  const annualRate = Number(liab.interest_rate);
  const accrued = round2(opening * (annualRate / 100) * (days / 365));

  if (accrued <= 0) {
    throw new Error('Accrued amount is zero — nothing to post.');
  }

  let journalId: string | null = null;
  const isPlanOnly = input.plan_only === true;

  if (!isPlanOnly) {
    const expenseAcc = await getOrCreateAccount(uid, INTEREST_EXPENSE_ACCOUNT, 'Expense');
    let payableAcc = liab.interest_payable_account_id;
    if (!payableAcc) {
      payableAcc = await getOrCreateAccount(uid, INTEREST_PAYABLE_ACCOUNT, 'Liability');
      await supabase
        .from('liabilities')
        .update({ interest_payable_account_id: payableAcc })
        .eq('user_id', uid)
        .eq('id', liab.id);
    }

    journalId = await postJournal({
      user_id: uid,
      date: periodEnd,
      narration: `Interest accrual — ${liab.liability_code} ${liab.name} (${periodStart} → ${periodEnd})`,
      source_type: 'loan_interest_accrual',
      source_id: liab.id,
      idempotency_key: `loan_interest_accrual:${liab.id}:${periodStart}:${periodEnd}`,
      lines: [
        {
          account_id: expenseAcc,
          debit: accrued,
          credit: 0,
          line_narration: `Interest expense — ${liab.liability_code}`,
          cost_center_id: liab.cost_center_id || null,
          branch_id: liab.branch_id || null,
        },
        {
          account_id: payableAcc,
          debit: 0,
          credit: accrued,
          line_narration: `Interest payable to ${liab.vendor_id ? 'vendor' : 'lender'}`,
          vendor_id: liab.vendor_id || null,
        },
      ],
    });
  }

  const { data: row, error } = await supabase
    .from('liability_interest_accruals')
    .insert({
      user_id: uid,
      liability_id: liab.id,
      period_start: periodStart,
      period_end: periodEnd,
      days_in_period: days,
      opening_balance: opening,
      annual_rate_pct: annualRate,
      accrued_amount: accrued,
      status: isPlanOnly ? 'planned' : 'posted',
      journal_id: journalId,
      posted_by: isPlanOnly ? null : uid,
      notes: input.notes || null,
    })
    .select('*')
    .single();
  if (error) throw error;

  // Bump trackers on the liability
  if (!isPlanOnly) {
    await supabase
      .from('liabilities')
      .update({
        last_accrued_through: periodEnd,
        total_interest_accrued: round2(Number(liab.total_interest_accrued || 0) + accrued),
      })
      .eq('user_id', uid)
      .eq('id', liab.id);
  }

  return { accrual: row as LiabilityInterestAccrual, journalId };
};

/** Accrue current month-end interest for every active interest-bearing liability. */
export const accrueAllActiveLiabilitiesMonthEnd = async (
  userId: string,
  asOfDate?: string,
): Promise<{ accrued: number; results: AccrueResult[]; errors: Array<{ liability_id: string; message: string }> }> => {
  const uid = normalizeUserId(userId);
  const target = asOfDate || monthEnd(today());

  const { data: liabs } = await supabase
    .from('liabilities')
    .select('id, last_accrued_through, status, interest_rate, interest_type')
    .eq('user_id', uid)
    .in('status', ['active', 'restructured']);

  const results: AccrueResult[] = [];
  const errors: Array<{ liability_id: string; message: string }> = [];
  for (const l of (liabs || []) as any[]) {
    if (!l.interest_rate || l.interest_type === 'none') continue;
    if (l.last_accrued_through && l.last_accrued_through >= target) continue;
    try {
      const r = await accrueInterestForLiability(uid, {
        liability_id: l.id,
        period_end: target,
      });
      results.push(r);
    } catch (e: any) {
      errors.push({ liability_id: l.id, message: e?.message || String(e) });
    }
  }
  return { accrued: results.length, results, errors };
};

// ════════════════════════════════════════════════════════════════════════════
// Module 12: Forecasting
// ════════════════════════════════════════════════════════════════════════════

export const forecastUpcomingEmis = async (
  userId: string,
  withinDays = 90,
): Promise<UpcomingEmiForecast[]> => {
  const uid = normalizeUserId(userId);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('loan_emi_schedule')
    .select('*, liabilities!inner(liability_code, name, lender_name)')
    .eq('user_id', uid)
    .in('status', ['planned', 'overdue', 'partial'])
    .lte('due_date', horizonIso)
    .order('due_date');
  if (error) throw error;

  const t = today();
  return (data || []).map((row: any) => {
    const days = daysBetween(t, row.due_date);
    return {
      liability_id: row.liability_id,
      liability_code: row.liabilities?.liability_code || '',
      liability_name: row.liabilities?.name || '',
      lender_name: row.liabilities?.lender_name || null,
      due_date: row.due_date,
      emi_number: row.emi_number,
      principal_component: Number(row.principal_component || 0),
      interest_component: Number(row.interest_component || 0),
      total_emi: Number(row.total_emi || 0),
      status: row.status,
      days_until_due: days,
      is_overdue: days < 0 || row.status === 'overdue',
    };
  });
};

export const buildForecastSummary = async (
  userId: string,
  horizonDays = 90,
  liquidityThreshold?: number,
): Promise<LiabilityForecastSummary> => {
  const upcoming = await forecastUpcomingEmis(userId, horizonDays);

  let totalEmi = 0, totalPrincipal = 0, totalInterest = 0, overdueAmount = 0;
  const byMonthMap = new Map<string, { principal: number; interest: number; total: number }>();
  for (const e of upcoming) {
    totalEmi += e.total_emi;
    totalPrincipal += e.principal_component;
    totalInterest += e.interest_component;
    if (e.is_overdue) overdueAmount += e.total_emi;
    const ym = e.due_date.slice(0, 7);
    const prev = byMonthMap.get(ym) || { principal: 0, interest: 0, total: 0 };
    prev.principal += e.principal_component;
    prev.interest  += e.interest_component;
    prev.total     += e.total_emi;
    byMonthMap.set(ym, prev);
  }

  // Projected interest accrual on principal that ISN'T already covered by EMI interest
  // (rough — for non-amortising loans / credit lines): outstanding * rate * (days/365)
  const uid = normalizeUserId(userId);
  const { data: liabs } = await supabase
    .from('liabilities')
    .select('outstanding_principal, interest_rate, interest_type, emi_amount, status')
    .eq('user_id', uid)
    .in('status', ['active', 'restructured']);
  let projectedAccrual = 0;
  for (const l of (liabs || []) as any[]) {
    if (l.interest_type === 'none' || !l.interest_rate) continue;
    if (l.emi_amount && l.emi_amount > 0) continue; // EMI loans already covered above
    projectedAccrual += Number(l.outstanding_principal || 0) * (Number(l.interest_rate) / 100) * (horizonDays / 365);
  }

  const by_month = [...byMonthMap.entries()]
    .map(([month, v]) => ({ month, principal: round2(v.principal), interest: round2(v.interest), total: round2(v.total) }))
    .sort((a, b) => a.month.localeCompare(b.month));

  let liquidity_warning: string | undefined;
  if (liquidityThreshold && totalEmi + projectedAccrual > liquidityThreshold) {
    liquidity_warning = `Forecast outflow of ₹${round2(totalEmi + projectedAccrual).toLocaleString('en-IN')} over ${horizonDays} days exceeds threshold of ₹${liquidityThreshold.toLocaleString('en-IN')}.`;
  }

  return {
    horizon_days: horizonDays,
    total_emi_due: round2(totalEmi),
    total_principal_due: round2(totalPrincipal),
    total_interest_due: round2(totalInterest),
    overdue_emi_amount: round2(overdueAmount),
    projected_interest_accrual: round2(projectedAccrual),
    by_month,
    liquidity_warning,
  };
};

// ════════════════════════════════════════════════════════════════════════════
// Module 13: Covenants
// ════════════════════════════════════════════════════════════════════════════

export const listCovenants = async (
  userId: string,
  liabilityId?: string,
): Promise<LiabilityCovenantEnriched[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('v_covenants_enriched')
    .select('*')
    .eq('user_id', uid)
    .order('next_check_due', { ascending: true });
  if (liabilityId) q = q.eq('liability_id', liabilityId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LiabilityCovenantEnriched[];
};

export const getCovenant = async (
  userId: string,
  id: string,
): Promise<LiabilityCovenant | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('liability_covenants')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as LiabilityCovenant) || null;
};

export const listCovenantChecks = async (
  userId: string,
  covenantId: string,
): Promise<LiabilityCovenantCheck[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('liability_covenant_checks')
    .select('*')
    .eq('user_id', uid)
    .eq('covenant_id', covenantId)
    .order('check_date', { ascending: false });
  if (error) throw error;
  return (data || []) as LiabilityCovenantCheck[];
};

export const createCovenant = async (
  userId: string,
  input: CreateCovenantInput,
): Promise<LiabilityCovenant> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('liability_covenants')
    .insert({
      user_id: uid,
      liability_id: input.liability_id,
      covenant_type: input.covenant_type,
      title: input.title,
      description: input.description || null,
      metric: input.metric || null,
      threshold_operator: input.threshold_operator || null,
      threshold_value: input.threshold_value ?? null,
      check_frequency: input.check_frequency || 'quarterly',
      next_check_due: input.next_check_due || null,
      reminder_days_before: input.reminder_days_before ?? 14,
      is_active: true,
      notes: input.notes || null,
      document_url: input.document_url || null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as LiabilityCovenant;
};

export const recordCovenantCheck = async (
  userId: string,
  input: RecordCovenantCheckInput,
): Promise<LiabilityCovenantCheck> => {
  const uid = normalizeUserId(userId);

  // Auto-detect breach when status='met' but observed value violates threshold
  let finalStatus = input.status;
  const covenant = await getCovenant(uid, input.covenant_id);
  if (
    finalStatus === 'met' &&
    covenant?.threshold_operator &&
    covenant?.threshold_value != null &&
    input.observed_value != null
  ) {
    const v = input.observed_value;
    const t = covenant.threshold_value;
    const op = covenant.threshold_operator;
    const passes =
      op === '<'  ? v <  t :
      op === '<=' ? v <= t :
      op === '>'  ? v >  t :
      op === '>=' ? v >= t :
                    Math.abs(v - t) < 1e-6;
    if (!passes) finalStatus = 'breached';
  }

  const { data, error } = await supabase
    .from('liability_covenant_checks')
    .insert({
      user_id: uid,
      covenant_id: input.covenant_id,
      check_date: input.check_date,
      period_label: input.period_label || null,
      status: finalStatus,
      observed_value: input.observed_value ?? null,
      evidence_url: input.evidence_url || null,
      remarks: input.remarks || null,
      acknowledged_by: uid,
      acknowledged_on: today(),
    })
    .select('*')
    .single();
  if (error) throw error;

  // Roll next_check_due forward
  if (covenant && covenant.check_frequency !== 'one_time') {
    const monthsForward =
      covenant.check_frequency === 'monthly'    ? 1 :
      covenant.check_frequency === 'quarterly'  ? 3 :
      covenant.check_frequency === 'semi_annual'? 6 :
                                                  12;
    const next = new Date(input.check_date + 'T00:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + monthsForward);
    await supabase
      .from('liability_covenants')
      .update({ next_check_due: next.toISOString().slice(0, 10) })
      .eq('user_id', uid)
      .eq('id', input.covenant_id);
  }

  return data as LiabilityCovenantCheck;
};

export const listCovenantDeadlineAlerts = async (
  userId: string,
  withinDays = 30,
): Promise<CovenantDeadlineAlert[]> => {
  const uid = normalizeUserId(userId);
  const horizon = new Date();
  horizon.setUTCDate(horizon.getUTCDate() + withinDays);
  const horizonIso = horizon.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('v_covenants_enriched')
    .select('*')
    .eq('user_id', uid)
    .eq('is_active', true)
    .not('next_check_due', 'is', null)
    .lte('next_check_due', horizonIso)
    .order('next_check_due');
  if (error) throw error;

  const t = today();
  return (data || []).map((row: any) => {
    const days = daysBetween(t, row.next_check_due);
    return {
      covenant: row as LiabilityCovenantEnriched,
      days_until_due: days,
      is_overdue: days < 0,
    };
  });
};

export const updateCovenant = async (
  userId: string,
  id: string,
  patch: Partial<LiabilityCovenant>,
): Promise<LiabilityCovenant> => {
  const uid = normalizeUserId(userId);
  const cleaned: Record<string, unknown> = { ...patch };
  delete cleaned.id;
  delete cleaned.user_id;
  delete cleaned.created_at;
  delete cleaned.created_by;
  const { data, error } = await supabase
    .from('liability_covenants')
    .update(cleaned)
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as LiabilityCovenant;
};

// ════════════════════════════════════════════════════════════════════════════
// Module 14: Net Worth & Solvency
// ════════════════════════════════════════════════════════════════════════════

const sumColumn = async (
  userId: string,
  table: string,
  column: string,
  filters: Array<{ col: string; op: 'eq' | 'in' | 'gt'; val: any }> = [],
): Promise<number> => {
  const uid = normalizeUserId(userId);
  let q = supabase.from(table).select(column).eq('user_id', uid);
  for (const f of filters) {
    if (f.op === 'eq') q = q.eq(f.col, f.val);
    else if (f.op === 'in') q = q.in(f.col, f.val);
    else if (f.op === 'gt') q = q.gt(f.col, f.val);
  }
  const { data, error } = await q;
  if (error) return 0;
  return round2((data || []).reduce((s: number, r: any) => s + Number(r[column] || 0), 0));
};

export const getNetWorthSnapshot = async (userId: string): Promise<NetWorthSnapshot> => {
  const uid = normalizeUserId(userId);
  const { data: snap } = await supabase
    .from('v_net_worth_snapshot')
    .select('*')
    .eq('user_id', uid)
    .maybeSingle();

  // Best-effort current-assets aggregation — relies on standard table names
  // present in this project. Failures return 0 silently.
  const [ar, inv, bank, cash, ap] = await Promise.all([
    sumColumn(uid, 'invoices', 'balance_due', [
      { col: 'status', op: 'in', val: ['unpaid', 'partial', 'overdue', 'sent'] },
    ]).catch(() => 0),
    sumColumn(uid, 'inventory_items', 'stock_value').catch(() => 0),
    sumColumn(uid, 'bank_accounts', 'current_balance').catch(() => 0),
    0, // cash on hand — most installations don't have a separate table
    sumColumn(uid, 'purchase_bills', 'balance_due', [
      { col: 'status', op: 'in', val: ['unpaid', 'partial', 'overdue'] },
    ]).catch(() => 0),
  ]);
  const current_assets = round2(ar + inv + bank + cash);

  const fixed_assets_value = Number(snap?.fixed_assets_value || 0);
  const total_assets = round2(fixed_assets_value + current_assets);
  const total_debt = Number(snap?.total_debt || 0);
  const total_liabilities = round2(total_debt + ap);
  const current_liabilities = round2(Number(snap?.current_liabilities || 0) + ap);
  const non_current_liabilities = Number(snap?.non_current_liabilities || 0);

  const equity = round2(total_assets - total_liabilities);
  const debt_to_equity = equity > 0 ? round2(total_debt / equity) : null;
  const current_ratio = current_liabilities > 0 ? round2(current_assets / current_liabilities) : null;
  const leverage_ratio = total_assets > 0 ? round2(total_liabilities / total_assets) : null;

  return {
    user_id: uid,
    fixed_assets_value,
    total_debt,
    secured_debt: Number(snap?.secured_debt || 0),
    unsecured_debt: Number(snap?.unsecured_debt || 0),
    statutory_debt: Number(snap?.statutory_debt || 0),
    current_liabilities,
    non_current_liabilities,
    book_net_worth: equity,
    current_assets,
    total_assets,
    debt_to_equity,
    current_ratio,
    leverage_ratio,
  };
};

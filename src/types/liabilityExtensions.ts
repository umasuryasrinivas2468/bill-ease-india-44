// TypeScript shapes for Phase 6 (Modules 10-14) liability extensions.

// ── Module 10: classification ───────────────────────────────────────────────
export interface LiabilityClassification {
  user_id: string;
  liability_id: string;
  liability_code: string;
  name: string;
  liability_type: string;
  is_secured: boolean;
  is_statutory: boolean;
  outstanding_principal: number;
  classification_override?: 'current' | 'non_current' | null;
  current_portion: number;
  non_current_portion: number;
  liability_status: string;
}

export interface ClassificationRollup {
  total_outstanding: number;
  current_total: number;
  non_current_total: number;
  secured_total: number;
  unsecured_total: number;
  statutory_total: number;
  by_type: Array<{ liability_type: string; total: number }>;
}

// ── Module 11: interest accrual ─────────────────────────────────────────────
export type AccrualStatus = 'planned' | 'posted' | 'reversed';

export interface LiabilityInterestAccrual {
  id: string;
  user_id: string;
  liability_id: string;
  period_start: string;
  period_end: string;
  days_in_period: number;
  opening_balance: number;
  annual_rate_pct: number;
  accrued_amount: number;
  status: AccrualStatus;
  journal_id?: string | null;
  posted_by?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface AccrueInterestInput {
  liability_id: string;
  period_end: string;
  /** Defaults to last_accrued_through + 1 day, or start_date if never accrued. */
  period_start?: string;
  /** If true, don't post a journal — record as 'planned' only. */
  plan_only?: boolean;
  notes?: string;
}

// ── Module 12: forecasting ──────────────────────────────────────────────────
export interface UpcomingEmiForecast {
  liability_id: string;
  liability_code: string;
  liability_name: string;
  lender_name?: string | null;
  due_date: string;
  emi_number: number;
  principal_component: number;
  interest_component: number;
  total_emi: number;
  status: string;
  days_until_due: number;
  is_overdue: boolean;
}

export interface LiabilityForecastSummary {
  horizon_days: number;
  total_emi_due: number;
  total_principal_due: number;
  total_interest_due: number;
  overdue_emi_amount: number;
  projected_interest_accrual: number;
  by_month: Array<{
    month: string; // YYYY-MM
    principal: number;
    interest: number;
    total: number;
  }>;
  liquidity_warning?: string;
}

// ── Module 13: covenants ────────────────────────────────────────────────────
export type CovenantType =
  | 'financial_ratio'
  | 'document_submission'
  | 'payment_obligation'
  | 'reporting_deadline'
  | 'operational'
  | 'negative_pledge'
  | 'other';

export type CovenantCheckStatus =
  | 'pending'
  | 'met'
  | 'breached'
  | 'waived'
  | 'not_applicable';

export type CovenantFrequency =
  | 'monthly'
  | 'quarterly'
  | 'semi_annual'
  | 'annual'
  | 'one_time';

export interface LiabilityCovenant {
  id: string;
  user_id: string;
  liability_id: string;
  covenant_type: CovenantType;
  title: string;
  description?: string | null;
  metric?: string | null;
  threshold_operator?: '<' | '<=' | '>' | '>=' | '=' | null;
  threshold_value?: number | null;
  check_frequency: CovenantFrequency;
  next_check_due?: string | null;
  reminder_days_before: number;
  is_active: boolean;
  notes?: string | null;
  document_url?: string | null;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

export interface LiabilityCovenantEnriched extends LiabilityCovenant {
  liability_code: string;
  liability_name: string;
  lender_name?: string | null;
  latest_status?: CovenantCheckStatus | null;
  latest_check_date?: string | null;
}

export interface LiabilityCovenantCheck {
  id: string;
  user_id: string;
  covenant_id: string;
  check_date: string;
  period_label?: string | null;
  status: CovenantCheckStatus;
  observed_value?: number | null;
  evidence_url?: string | null;
  remarks?: string | null;
  acknowledged_by?: string | null;
  acknowledged_on?: string | null;
  created_at: string;
}

export interface CreateCovenantInput {
  liability_id: string;
  covenant_type: CovenantType;
  title: string;
  description?: string;
  metric?: string;
  threshold_operator?: '<' | '<=' | '>' | '>=' | '=';
  threshold_value?: number;
  check_frequency?: CovenantFrequency;
  next_check_due?: string;
  reminder_days_before?: number;
  notes?: string;
  document_url?: string;
}

export interface RecordCovenantCheckInput {
  covenant_id: string;
  check_date: string;
  period_label?: string;
  status: CovenantCheckStatus;
  observed_value?: number;
  evidence_url?: string;
  remarks?: string;
}

export interface CovenantDeadlineAlert {
  covenant: LiabilityCovenantEnriched;
  days_until_due: number;
  is_overdue: boolean;
}

// ── Module 14: net worth ────────────────────────────────────────────────────
export interface NetWorthSnapshot {
  user_id: string;
  fixed_assets_value: number;
  total_debt: number;
  secured_debt: number;
  unsecured_debt: number;
  statutory_debt: number;
  current_liabilities: number;
  non_current_liabilities: number;
  book_net_worth: number;
  // Computed in service
  current_assets?: number;
  total_assets?: number;
  debt_to_equity?: number | null;
  current_ratio?: number | null;
  leverage_ratio?: number | null;
}

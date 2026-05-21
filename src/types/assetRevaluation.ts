// TypeScript shapes for Asset Revaluation (Module 7).
// Mirrors 20260527000001_asset_revaluation.sql.

export type RevaluationDirection = 'upward' | 'downward';
export type RevaluationMethod = 'market' | 'income' | 'cost' | 'dcf' | 'independent' | 'internal';

export interface AssetRevaluation {
  id: string;
  user_id: string;
  asset_id: string;
  revaluation_date: string;
  direction: RevaluationDirection;
  prev_gross_value: number;
  prev_accumulated_depreciation: number;
  prev_book_value: number;
  new_fair_value: number;
  revaluation_amount: number;
  reserve_impact: number;
  pl_impact: number;
  remaining_useful_life_years?: number | null;
  valuer_name?: string | null;
  valuer_contact?: string | null;
  method?: RevaluationMethod | null;
  reason?: string | null;
  document_url?: string | null;
  notes?: string | null;
  journal_id?: string | null;
  reverts_revaluation_id?: string | null;
  created_at: string;
  created_by?: string | null;
}

export interface RevalueAssetInput {
  asset_id: string;
  revaluation_date: string;
  new_fair_value: number;
  /** New useful life from revaluation date. Defaults to remaining useful life on asset. */
  remaining_useful_life_years?: number;
  valuer_name?: string;
  valuer_contact?: string;
  method?: RevaluationMethod;
  reason?: string;
  document_url?: string;
  notes?: string;
}

export interface RevaluationPreview {
  prev_book_value: number;
  new_fair_value: number;
  delta: number;                    // signed; +ve = upward, -ve = downward
  direction: RevaluationDirection;
  reserve_impact: number;            // +ve = credit reserve, -ve = debit reserve
  pl_impact: number;                 // +ve = income (reversal of prior loss), -ve = expense (loss)
  current_reserve_balance: number;
  current_cumulative_loss: number;
}

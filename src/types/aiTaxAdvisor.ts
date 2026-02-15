export interface FinancialSummary {
  financial_year: string;
  gross_turnover: number;
  net_profit: number;
  expenses: {
    salaries: number;
    rent: number;
    utilities: number;
    marketing: number;
    loan_interest: number;
    professional_fees: number;
    office_expenses: number;
    travel_expenses: number;
    repairs_maintenance: number;
    insurance: number;
    depreciation: number;
    other_expenses: number;
  };
  assets: {
    plant_machinery: number;
    computers: number;
    vehicles: number;
    furniture_fixtures: number;
    land_building: number;
    other_assets: number;
  };
  other_info: {
    gst_paid: number;
    foreign_transactions: number;
    research_development: number;
    donations: number;
    provident_fund: number;
    esi_contribution: number;
  };
}

export interface TaxDeduction {
  section: string;
  title: string;
  description: string;
  eligible_amount: number;
  max_limit?: number;
  percentage?: number;
  applicable: boolean;
  recommendation: string;
  documentation_required: string[];
}

export interface TaxOptimizationSuggestion {
  category: string;
  title: string;
  description: string;
  potential_savings: number;
  implementation_steps: string[];
  priority: 'high' | 'medium' | 'low';
  deadline?: string;
}

export interface TaxCalculation {
  gross_income: number;
  total_deductions: number;
  taxable_income: number;
  tax_liability: number;
  effective_tax_rate: number;
  tax_breakdown: {
    income_tax: number;
    surcharge: number;
    cess: number;
    total: number;
  };
}

export interface AITaxAnalysisResult {
  id: string;
  user_id: string;
  financial_year: string;
  analysis_date: string;
  financial_summary: FinancialSummary;
  eligible_deductions: TaxDeduction[];
  optimization_suggestions: TaxOptimizationSuggestion[];
  tax_calculation: TaxCalculation;
  ai_insights: string;
  compliance_notes: string[];
  disclaimer: string;
  created_at: string;
  updated_at: string;
}

export interface AITaxRequest {
  financial_summary: FinancialSummary;
  specific_questions?: string[];
}

export interface AITaxResponse {
  deductions: TaxDeduction[];
  suggestions: TaxOptimizationSuggestion[];
  tax_calculation: TaxCalculation;
  insights: string;
  compliance_notes: string[];
}

export interface ExportOptions {
  format: 'pdf' | 'excel';
  sections: {
    summary: boolean;
    deductions: boolean;
    suggestions: boolean;
    tax_calculation: boolean;
    compliance_notes: boolean;
  };
}
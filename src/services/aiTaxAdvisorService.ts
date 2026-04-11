import { supabase } from '@/lib/supabase';
import type {
  FinancialSummary,
  AITaxAnalysisResult,
  AITaxRequest,
  AITaxResponse,
  TaxDeduction,
  TaxOptimizationSuggestion,
  TaxCalculation
} from '@/types/aiTaxAdvisor';

// Mistral API configuration
const MISTRAL_API_KEY = import.meta.env.VITE_MISTRAL_API_KEY || '';
const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const MISTRAL_MODEL = 'mistral-medium';

const TAX_ANALYSIS_PROMPT = `
You are a senior tax consultant expert in Indian Income Tax Act, 1961. Analyze the provided business financial data and provide comprehensive tax deduction recommendations.

IMPORTANT: Respond ONLY with valid JSON format. No markdown, no explanations outside JSON.

Based on the financial data provided, analyze and recommend:

1. **Eligible Business Deductions** under various sections of Income Tax Act 1961
2. **Tax Optimization Strategies** for the current and upcoming financial years
3. **Accurate Tax Calculations** based on current tax slabs and rates
4. **Compliance Notes** for proper documentation and filing

Consider these key sections:
- Section 80C (Employee Contribution to PF)
- Section 80CCD (NPS)
- Section 80D (Medical Insurance)
- Section 80G (Donations)
- Section 35 (R&D Expenses)
- Section 43B (Statutory Payments)
- Section 36 (Business Expenses)
- Section 32 (Depreciation)

For tax calculations, use FY 2024-25 tax rates:
- Up to ₹3L: 0%
- ₹3L-₹7L: 5% 
- ₹7L-₹10L: 10%
- ₹10L-₹12L: 15%
- ₹12L-₹15L: 20%
- Above ₹15L: 30%
- Surcharge: 10% if income > ₹50L, 15% if > ₹1Cr
- Cess: 4%

Respond in this exact JSON structure:
{
  "deductions": [
    {
      "section": "Section 80C",
      "title": "Employee Provident Fund",
      "description": "Contribution to EPF is deductible",
      "eligible_amount": 150000,
      "max_limit": 150000,
      "percentage": 100,
      "applicable": true,
      "recommendation": "Maximize EPF contribution",
      "documentation_required": ["EPF Certificate", "Form 12BA"]
    }
  ],
  "suggestions": [
    {
      "category": "Expense Restructuring",
      "title": "Optimize Travel Expenses",
      "description": "Restructure travel expenses for better deductions",
      "potential_savings": 25000,
      "implementation_steps": ["Maintain proper bills", "Separate business travel"],
      "priority": "medium",
      "deadline": "Before March 31st"
    }
  ],
  "tax_calculation": {
    "gross_income": 1200000,
    "total_deductions": 200000,
    "taxable_income": 1000000,
    "tax_liability": 112500,
    "effective_tax_rate": 9.375,
    "tax_breakdown": {
      "income_tax": 100000,
      "surcharge": 0,
      "cess": 4000,
      "total": 104000
    }
  },
  "insights": "Key insights about tax planning opportunities",
  "compliance_notes": ["Ensure all deductions are properly documented", "File returns before due date"]
}
`;

export class AITaxAdvisorService {
  static async generateTaxAnalysis(
    userId: string,
    financialSummary: FinancialSummary
  ): Promise<AITaxResponse> {
    try {
      if (!MISTRAL_API_KEY) {
        console.warn('Mistral API key not configured. Using fallback response.');
        return this.generateFallbackResponse(financialSummary);
      }

      const prompt = `${TAX_ANALYSIS_PROMPT}

Financial Data:
${JSON.stringify(financialSummary, null, 2)}

Please analyze this financial data and provide tax deduction recommendations in the exact JSON format specified above.`;

      const response = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MISTRAL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          messages: [
            { role: 'system', content: 'You are a senior tax consultant expert in Indian Income Tax Act, 1961.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      if (!response.ok) {
        console.error('Mistral API error:', response.status);
        return this.generateFallbackResponse(financialSummary);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      // Clean and parse the response
      let cleanedResponse = text.trim();
      
      // Remove markdown code blocks if present
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace('```json', '').replace('```', '');
      }
      
      // Remove any leading/trailing whitespace
      cleanedResponse = cleanedResponse.trim();

      try {
        return JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        console.error('Raw response:', text);
        
        // Fallback response if parsing fails
        return this.generateFallbackResponse(financialSummary);
      }
    } catch (error) {
      console.error('Error generating tax analysis:', error);
      return this.generateFallbackResponse(financialSummary);
    }
  }

  private static generateFallbackResponse(financialSummary: FinancialSummary): AITaxResponse {
    const { gross_turnover, net_profit, expenses } = financialSummary;
    
    // Basic tax calculation
    const grossIncome = net_profit;
    const totalDeductions = Math.min(
      expenses.salaries * 0.1 + // EPF portion
      expenses.rent + 
      expenses.professional_fees +
      expenses.depreciation,
      1500000 // Max reasonable deduction
    );
    
    const taxableIncome = Math.max(0, grossIncome - totalDeductions);
    const taxLiability = this.calculateTax(taxableIncome);
    
    return {
      deductions: [
        {
          section: "Section 36",
          title: "Business Expenses",
          description: "Rent, utilities, and operational expenses are fully deductible",
          eligible_amount: expenses.rent + expenses.utilities + expenses.office_expenses,
          applicable: true,
          recommendation: "Ensure all business expenses are properly documented",
          documentation_required: ["Bills & Receipts", "Rent Agreement", "Utility Bills"]
        },
        {
          section: "Section 32",
          title: "Depreciation on Assets",
          description: "Depreciation on business assets is deductible",
          eligible_amount: expenses.depreciation,
          applicable: true,
          recommendation: "Claim maximum depreciation allowed as per IT rules",
          documentation_required: ["Asset Purchase Bills", "Depreciation Schedule"]
        }
      ],
      suggestions: [
        {
          category: "Expense Optimization",
          title: "Maximize Business Expense Claims",
          description: "Ensure all legitimate business expenses are claimed",
          potential_savings: taxableIncome * 0.3 * 0.1, // Rough estimate
          implementation_steps: [
            "Maintain proper books of accounts",
            "Keep all bills and receipts",
            "Separate personal and business expenses"
          ],
          priority: "high" as const
        }
      ],
      tax_calculation: {
        gross_income: grossIncome,
        total_deductions: totalDeductions,
        taxable_income: taxableIncome,
        tax_liability: taxLiability.total,
        effective_tax_rate: grossIncome > 0 ? (taxLiability.total / grossIncome) * 100 : 0,
        tax_breakdown: taxLiability
      },
      insights: "Consider consulting a CA for detailed tax planning based on your business structure.",
      compliance_notes: [
        "Maintain proper books of accounts",
        "File GST returns timely",
        "Keep all supporting documents for 8 years"
      ]
    };
  }

  private static calculateTax(income: number) {
    let tax = 0;
    
    // Tax slabs for FY 2024-25
    if (income <= 300000) tax = 0;
    else if (income <= 700000) tax = (income - 300000) * 0.05;
    else if (income <= 1000000) tax = 400000 * 0.05 + (income - 700000) * 0.10;
    else if (income <= 1200000) tax = 400000 * 0.05 + 300000 * 0.10 + (income - 1000000) * 0.15;
    else if (income <= 1500000) tax = 400000 * 0.05 + 300000 * 0.10 + 200000 * 0.15 + (income - 1200000) * 0.20;
    else tax = 400000 * 0.05 + 300000 * 0.10 + 200000 * 0.15 + 300000 * 0.20 + (income - 1500000) * 0.30;

    // Surcharge
    let surcharge = 0;
    if (income > 5000000) surcharge = tax * 0.10;
    if (income > 10000000) surcharge = tax * 0.15;

    // Cess
    const cess = (tax + surcharge) * 0.04;

    return {
      income_tax: Math.round(tax),
      surcharge: Math.round(surcharge),
      cess: Math.round(cess),
      total: Math.round(tax + surcharge + cess)
    };
  }

  static async saveAnalysisResult(
    userId: string,
    financialYear: string,
    analysisResult: AITaxResponse,
    financialSummary: FinancialSummary
  ): Promise<string> {
    const analysisData: Omit<AITaxAnalysisResult, 'id' | 'created_at' | 'updated_at'> = {
      user_id: userId,
      financial_year: financialYear,
      analysis_date: new Date().toISOString().split('T')[0],
      financial_summary: financialSummary,
      eligible_deductions: analysisResult.deductions,
      optimization_suggestions: analysisResult.suggestions,
      tax_calculation: analysisResult.tax_calculation,
      ai_insights: analysisResult.insights,
      compliance_notes: analysisResult.compliance_notes,
      disclaimer: "This is AI-generated tax advice for business deductions under the Indian Income Tax Act. Please consult a Chartered Accountant before filing returns."
    };

    const { data, error } = await supabase
      .from('ai_tax_analysis')
      .insert([analysisData])
      .select()
      .single();

    if (error) {
      console.error('Error saving analysis:', error);
      throw new Error('Failed to save tax analysis');
    }

    return data.id;
  }

  static async getAnalysisHistory(userId: string): Promise<AITaxAnalysisResult[]> {
    const { data, error } = await supabase
      .from('ai_tax_analysis')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching analysis history:', error);
      throw new Error('Failed to fetch analysis history');
    }

    return data || [];
  }

  static async getAnalysisById(userId: string, analysisId: string): Promise<AITaxAnalysisResult> {
    const { data, error } = await supabase
      .from('ai_tax_analysis')
      .select('*')
      .eq('user_id', userId)
      .eq('id', analysisId)
      .single();

    if (error) {
      console.error('Error fetching analysis:', error);
      throw new Error('Failed to fetch analysis');
    }

    return data;
  }
}
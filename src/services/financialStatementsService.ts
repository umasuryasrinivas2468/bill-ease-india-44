import { supabase } from '@/lib/supabase';

export interface CompanyDetails {
  companyName: string;
  cin: string;
  pan: string;
  address: string;
  place: string;
  dateOfIncorporation: string;
  ownerName: string;
  directorDIN: string;
  secondDirectorName?: string;
  secondDirectorDIN?: string;
}

export interface FinancialData {
  revenueFromOperations: number;
  otherIncome: number;
  totalRevenue: number;
  costOfMaterialsConsumed: number;
  employeeBenefitExpense: number;
  financialCosts: number;
  depreciationExpense: number;
  otherExpenses: number;
  totalExpenses: number;
  profitBeforeTax: number;
  taxExpense: number;
  profitAfterTax: number;
  shareCapital: number;
  reservesAndSurplus: number;
  longTermBorrowings: number;
  shortTermBorrowings: number;
  tradePayables: number;
  otherCurrentLiabilities: number;
  totalEquityAndLiabilities: number;
  fixedAssets: number;
  nonCurrentInvestments: number;
  tradeReceivables: number;
  cashAndBank: number;
  otherCurrentAssets: number;
  totalAssets: number;
  expenseDetails: Array<{ description: string; amount: number }>;
  incomeDetails: Array<{ description: string; amount: number }>;
}

export const fetchFinancialData = async (
  userId: string,
  financialYear: string
): Promise<FinancialData> => {
  // Parse financial year (e.g., "2024-25" -> startDate: 2024-04-01, endDate: 2025-03-31)
  const [startYear] = financialYear.split('-').map(y => parseInt(y.length === 2 ? `20${y}` : y));
  const startDate = `${startYear}-04-01`;
  const endDate = `${startYear + 1}-03-31`;

  // Fetch invoices for revenue
  const { data: invoices } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', userId)
    .gte('invoice_date', startDate)
    .lte('invoice_date', endDate);

  // Fetch expenses
  const { data: expenses } = await supabase
    .from('expenses')
    .select('*')
    .eq('user_id', userId)
    .gte('expense_date', startDate)
    .lte('expense_date', endDate);

  // Fetch journals with lines for detailed accounting
  const { data: journals } = await supabase
    .from('journals')
    .select('*')
    .eq('user_id', userId)
    .gte('journal_date', startDate)
    .lte('journal_date', endDate);

  // Fetch accounts for categorization
  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId);

  // Fetch receivables
  const { data: receivables } = await supabase
    .from('receivables')
    .select('*')
    .eq('user_id', userId);

  // Fetch payables
  const { data: payables } = await supabase
    .from('payables')
    .select('*')
    .eq('user_id', userId);

  // Calculate revenue from invoices
  const revenueFromOperations = (invoices || [])
    .filter(inv => inv.status === 'paid' || inv.status === 'pending')
    .reduce((sum, inv) => sum + (inv.amount || 0), 0);

  // Calculate other income from journals (income accounts)
  const incomeAccounts = (accounts || []).filter(acc => acc.account_type === 'Income');
  const otherIncome = (journals || [])
    .filter(j => j.status === 'posted')
    .reduce((sum, j) => sum + (j.total_credit || 0), 0) * 0.1; // Simplified calculation

  // Group expenses by category
  const expensesByCategory = (expenses || []).reduce((acc, exp) => {
    const category = exp.category_name || 'Other Expenses';
    acc[category] = (acc[category] || 0) + Number(exp.total_amount || exp.amount || 0);
    return acc;
  }, {} as Record<string, number>);

  // Calculate expense categories
  const employeeBenefitExpense = expensesByCategory['Salary'] || expensesByCategory['Payroll'] || 0;
  const financialCosts = expensesByCategory['Bank Charges'] || expensesByCategory['Interest'] || 0;
  const depreciationExpense = expensesByCategory['Depreciation'] || 0;
  
  // Other expenses (everything else)
  const categorizedExpenses = ['Salary', 'Payroll', 'Bank Charges', 'Interest', 'Depreciation'];
  const otherExpenses = Object.entries(expensesByCategory)
    .filter(([cat]) => !categorizedExpenses.includes(cat))
    .reduce((sum, [, amount]) => sum + Number(amount), 0);

  const totalExpenses = employeeBenefitExpense + financialCosts + depreciationExpense + otherExpenses;
  const totalRevenue = revenueFromOperations + otherIncome;
  const profitBeforeTax = totalRevenue - totalExpenses;
  const taxExpense = profitBeforeTax > 0 ? profitBeforeTax * 0.25 : 0;
  const profitAfterTax = profitBeforeTax - taxExpense;

  // Balance sheet calculations
  const tradeReceivables = (receivables || [])
    .filter(r => r.status !== 'paid')
    .reduce((sum, r) => sum + (r.amount_remaining || 0), 0);

  const tradePayables = (payables || [])
    .filter(p => p.status !== 'paid')
    .reduce((sum, p) => sum + (p.amount_remaining || 0), 0);

  // Get cash/bank balance from accounts
  const cashAccounts = (accounts || []).filter(acc => 
    acc.account_type === 'Asset' && 
    (acc.account_name.toLowerCase().includes('cash') || acc.account_name.toLowerCase().includes('bank'))
  );
  const cashAndBank = cashAccounts.reduce((sum, acc) => sum + (acc.opening_balance || 0), 0);

  // Create expense details for notes
  const expenseDetails = Object.entries(expensesByCategory).map(([description, amount]) => ({
    description,
    amount: Number(amount)
  }));

  // Create income details for notes
  const incomeDetails = [
    { description: 'Gross Receipts', amount: revenueFromOperations }
  ];
  if (otherIncome > 0) {
    incomeDetails.push({ description: 'Other Income', amount: otherIncome });
  }

  return {
    revenueFromOperations,
    otherIncome,
    totalRevenue,
    costOfMaterialsConsumed: 0,
    employeeBenefitExpense,
    financialCosts,
    depreciationExpense,
    otherExpenses,
    totalExpenses,
    profitBeforeTax,
    taxExpense,
    profitAfterTax,
    shareCapital: 10000, // Default share capital
    reservesAndSurplus: profitAfterTax,
    longTermBorrowings: 0,
    shortTermBorrowings: 0,
    tradePayables,
    otherCurrentLiabilities: tradePayables,
    totalEquityAndLiabilities: 10000 + profitAfterTax + tradePayables,
    fixedAssets: 0,
    nonCurrentInvestments: 0,
    tradeReceivables,
    cashAndBank,
    otherCurrentAssets: tradeReceivables,
    totalAssets: tradeReceivables + cashAndBank,
    expenseDetails,
    incomeDetails
  };
};

export const getFinancialYearOptions = (): string[] => {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const fyStart = currentMonth >= 3 ? currentYear : currentYear - 1;
  
  return Array.from({ length: 5 }, (_, i) => {
    const start = fyStart - i;
    const end = (start + 1).toString().slice(-2);
    return `${start}-${end}`;
  });
};

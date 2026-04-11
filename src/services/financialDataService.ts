import { supabase } from '@/lib/supabase';
import type { FinancialSummary } from '@/types/aiTaxAdvisor';

export class FinancialDataService {
  static async aggregateFinancialData(userId: string, financialYear: string): Promise<FinancialSummary> {
    try {
      // Get date range for financial year
      const { startDate, endDate } = this.getFinancialYearDates(financialYear);

      // Fetch revenue data
      const revenueData = await this.getRevenueData(userId, startDate, endDate);
      
      // Fetch expense data from journals
      const expenseData = await this.getExpenseData(userId, startDate, endDate);
      
      // Fetch asset data
      const assetData = await this.getAssetData(userId);
      
      // Fetch additional business data
      const additionalData = await this.getAdditionalData(userId, startDate, endDate);

      const financialSummary: FinancialSummary = {
        financial_year: financialYear,
        gross_turnover: revenueData.grossTurnover,
        net_profit: revenueData.grossTurnover - expenseData.totalExpenses,
        expenses: {
          salaries: expenseData.salaries,
          rent: expenseData.rent,
          utilities: expenseData.utilities,
          marketing: expenseData.marketing,
          loan_interest: expenseData.loanInterest,
          professional_fees: expenseData.professionalFees,
          office_expenses: expenseData.officeExpenses,
          travel_expenses: expenseData.travelExpenses,
          repairs_maintenance: expenseData.repairsMaintenance,
          insurance: expenseData.insurance,
          depreciation: expenseData.depreciation,
          other_expenses: expenseData.otherExpenses
        },
        assets: {
          plant_machinery: assetData.plantMachinery,
          computers: assetData.computers,
          vehicles: assetData.vehicles,
          furniture_fixtures: assetData.furnitureFixtures,
          land_building: assetData.landBuilding,
          other_assets: assetData.otherAssets
        },
        other_info: {
          gst_paid: additionalData.gstPaid,
          foreign_transactions: additionalData.foreignTransactions,
          research_development: additionalData.researchDevelopment,
          donations: additionalData.donations,
          provident_fund: additionalData.providentFund,
          esi_contribution: additionalData.esiContribution
        }
      };

      return financialSummary;
    } catch (error) {
      console.error('Error aggregating financial data:', error);
      throw new Error('Failed to aggregate financial data');
    }
  }

  private static getFinancialYearDates(financialYear: string) {
    // Financial year format: "2024-25"
    const [startYear] = financialYear.split('-');
    const startDate = `${startYear}-04-01`;
    const endYear = parseInt(startYear) + 1;
    const endDate = `${endYear}-03-31`;
    
    return { startDate, endDate };
  }

  private static async getRevenueData(userId: string, startDate: string, endDate: string) {
    // Get revenue from invoices
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('total_amount')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .eq('status', 'sent'); // Only count paid/sent invoices

    // Get revenue from income accounts in journals
    const { data: journalData } = await supabase
      .from('journal_lines')
      .select(`
        credit,
        journals!inner(user_id, journal_date, status),
        accounts!inner(account_type)
      `)
      .eq('journals.user_id', userId)
      .eq('journals.status', 'posted')
      .eq('accounts.account_type', 'Income')
      .gte('journals.journal_date', startDate)
      .lte('journals.journal_date', endDate);

    const invoiceRevenue = invoiceData?.reduce((sum, inv) => sum + (inv.total_amount || 0), 0) || 0;
    const journalRevenue = journalData?.reduce((sum, line) => sum + (line.credit || 0), 0) || 0;

    return {
      grossTurnover: Math.max(invoiceRevenue, journalRevenue) // Use the higher amount to avoid double counting
    };
  }

  private static async getExpenseData(userId: string, startDate: string, endDate: string) {
    // Get expense data from journal lines
    const { data: expenseLines } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        line_narration,
        journals!inner(user_id, journal_date, status),
        accounts!inner(account_type, account_name)
      `)
      .eq('journals.user_id', userId)
      .eq('journals.status', 'posted')
      .eq('accounts.account_type', 'Expense')
      .gte('journals.journal_date', startDate)
      .lte('journals.journal_date', endDate);

    const expenseData = {
      salaries: 0,
      rent: 0,
      utilities: 0,
      marketing: 0,
      loanInterest: 0,
      professionalFees: 0,
      officeExpenses: 0,
      travelExpenses: 0,
      repairsMaintenance: 0,
      insurance: 0,
      depreciation: 0,
      otherExpenses: 0,
      totalExpenses: 0
    };

    expenseLines?.forEach(line => {
      const amount = line.debit || 0;
      const accountName = (line.accounts as any)?.account_name?.toLowerCase() || '';
      const narration = line.line_narration?.toLowerCase() || '';

      // Categorize expenses based on account names and narrations
      if (accountName.includes('salary') || accountName.includes('wages') || narration.includes('salary')) {
        expenseData.salaries += amount;
      } else if (accountName.includes('rent') || narration.includes('rent')) {
        expenseData.rent += amount;
      } else if (accountName.includes('electricity') || accountName.includes('utility') || narration.includes('electricity')) {
        expenseData.utilities += amount;
      } else if (accountName.includes('marketing') || accountName.includes('advertising') || narration.includes('marketing')) {
        expenseData.marketing += amount;
      } else if (accountName.includes('interest') || narration.includes('interest')) {
        expenseData.loanInterest += amount;
      } else if (accountName.includes('professional') || accountName.includes('legal') || narration.includes('professional')) {
        expenseData.professionalFees += amount;
      } else if (accountName.includes('office') || narration.includes('office')) {
        expenseData.officeExpenses += amount;
      } else if (accountName.includes('travel') || narration.includes('travel')) {
        expenseData.travelExpenses += amount;
      } else if (accountName.includes('repair') || accountName.includes('maintenance') || narration.includes('repair')) {
        expenseData.repairsMaintenance += amount;
      } else if (accountName.includes('insurance') || narration.includes('insurance')) {
        expenseData.insurance += amount;
      } else if (accountName.includes('depreciation') || narration.includes('depreciation')) {
        expenseData.depreciation += amount;
      } else {
        expenseData.otherExpenses += amount;
      }

      expenseData.totalExpenses += amount;
    });

    return expenseData;
  }

  private static async getAssetData(userId: string) {
    // Get asset data from accounts with asset type
    const { data: assetAccounts } = await supabase
      .from('accounts')
      .select('account_name, opening_balance')
      .eq('user_id', userId)
      .eq('account_type', 'Asset');

    const assetData = {
      plantMachinery: 0,
      computers: 0,
      vehicles: 0,
      furnitureFixtures: 0,
      landBuilding: 0,
      otherAssets: 0
    };

    assetAccounts?.forEach(account => {
      const accountName = account.account_name?.toLowerCase() || '';
      const balance = account.opening_balance || 0;

      if (accountName.includes('plant') || accountName.includes('machinery') || accountName.includes('equipment')) {
        assetData.plantMachinery += balance;
      } else if (accountName.includes('computer') || accountName.includes('laptop') || accountName.includes('software')) {
        assetData.computers += balance;
      } else if (accountName.includes('vehicle') || accountName.includes('car') || accountName.includes('truck')) {
        assetData.vehicles += balance;
      } else if (accountName.includes('furniture') || accountName.includes('fixture')) {
        assetData.furnitureFixtures += balance;
      } else if (accountName.includes('land') || accountName.includes('building') || accountName.includes('property')) {
        assetData.landBuilding += balance;
      } else if (!accountName.includes('bank') && !accountName.includes('cash') && !accountName.includes('receivable')) {
        assetData.otherAssets += balance;
      }
    });

    return assetData;
  }

  private static async getAdditionalData(userId: string, startDate: string, endDate: string) {
    // This would typically come from GST records, payroll data, etc.
    // For now, we'll provide estimates based on available data

    const { data: expenseLines } = await supabase
      .from('journal_lines')
      .select(`
        debit,
        line_narration,
        journals!inner(user_id, journal_date, status)
      `)
      .eq('journals.user_id', userId)
      .eq('journals.status', 'posted')
      .gte('journals.journal_date', startDate)
      .lte('journals.journal_date', endDate);

    let gstPaid = 0;
    let foreignTransactions = 0;
    let researchDevelopment = 0;
    let donations = 0;
    let providentFund = 0;
    let esiContribution = 0;

    expenseLines?.forEach(line => {
      const amount = line.debit || 0;
      const narration = line.line_narration?.toLowerCase() || '';

      if (narration.includes('gst') || narration.includes('tax')) {
        gstPaid += amount;
      } else if (narration.includes('foreign') || narration.includes('export')) {
        foreignTransactions += amount;
      } else if (narration.includes('research') || narration.includes('development') || narration.includes('r&d')) {
        researchDevelopment += amount;
      } else if (narration.includes('donation') || narration.includes('charity')) {
        donations += amount;
      } else if (narration.includes('pf') || narration.includes('provident fund')) {
        providentFund += amount;
      } else if (narration.includes('esi') || narration.includes('employee state insurance')) {
        esiContribution += amount;
      }
    });

    return {
      gstPaid,
      foreignTransactions,
      researchDevelopment,
      donations,
      providentFund,
      esiContribution
    };
  }

  static generateFinancialYearOptions(): string[] {
    const currentYear = new Date().getFullYear();
    const options = [];
    
    // Generate options for current and previous 5 years
    for (let i = 0; i < 6; i++) {
      const startYear = currentYear - i;
      const endYear = startYear + 1;
      options.push(`${startYear}-${endYear.toString().slice(-2)}`);
    }
    
    return options;
  }
}
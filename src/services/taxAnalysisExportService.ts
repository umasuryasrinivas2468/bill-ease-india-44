import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { AITaxAnalysisResult, ExportOptions } from '@/types/aiTaxAdvisor';

export class TaxAnalysisExportService {
  static async exportToPDF(
    analysis: AITaxAnalysisResult,
    options: ExportOptions
  ): Promise<void> {
    const doc = new jsPDF();
    let yPosition = 20;
    
    // Header
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('AI Business Tax Advisor Report', 20, yPosition);
    
    yPosition += 10;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Financial Year: ${analysis.financial_year}`, 20, yPosition);
    doc.text(`Analysis Date: ${new Date(analysis.analysis_date).toLocaleDateString('en-IN')}`, 120, yPosition);
    
    yPosition += 20;

    // Financial Summary
    if (options.sections.summary) {
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Financial Summary', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      const summaryData = [
        ['Gross Turnover', this.formatCurrency(analysis.financial_summary.gross_turnover)],
        ['Net Profit', this.formatCurrency(analysis.financial_summary.net_profit)],
        ['Total Expenses', this.formatCurrency(
          Object.values(analysis.financial_summary.expenses).reduce((sum, val) => sum + val, 0)
        )],
      ];

      autoTable(doc, {
        startY: yPosition,
        head: [['Item', 'Amount (₹)']],
        body: summaryData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Tax Calculation
    if (options.sections.tax_calculation) {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Tax Calculation', 20, yPosition);
      yPosition += 10;

      const taxData = [
        ['Gross Income', this.formatCurrency(analysis.tax_calculation.gross_income)],
        ['Total Deductions', this.formatCurrency(analysis.tax_calculation.total_deductions)],
        ['Taxable Income', this.formatCurrency(analysis.tax_calculation.taxable_income)],
        ['Income Tax', this.formatCurrency(analysis.tax_calculation.tax_breakdown.income_tax)],
        ['Surcharge', this.formatCurrency(analysis.tax_calculation.tax_breakdown.surcharge)],
        ['Cess', this.formatCurrency(analysis.tax_calculation.tax_breakdown.cess)],
        ['Total Tax Liability', this.formatCurrency(analysis.tax_calculation.tax_liability)],
        ['Effective Tax Rate', `${analysis.tax_calculation.effective_tax_rate.toFixed(2)}%`],
      ];

      autoTable(doc, {
        startY: yPosition,
        head: [['Tax Component', 'Amount']],
        body: taxData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Deductions
    if (options.sections.deductions) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Eligible Tax Deductions', 20, yPosition);
      yPosition += 10;

      const deductionData = analysis.eligible_deductions.map(deduction => [
        deduction.section,
        deduction.title,
        this.formatCurrency(deduction.eligible_amount),
        deduction.applicable ? 'Yes' : 'No'
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['Section', 'Title', 'Amount (₹)', 'Applicable']],
        body: deductionData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Optimization Suggestions
    if (options.sections.suggestions) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Tax Optimization Suggestions', 20, yPosition);
      yPosition += 10;

      const suggestionData = analysis.optimization_suggestions.map(suggestion => [
        suggestion.title,
        suggestion.category,
        this.formatCurrency(suggestion.potential_savings),
        suggestion.priority.toUpperCase()
      ]);

      autoTable(doc, {
        startY: yPosition,
        head: [['Suggestion', 'Category', 'Potential Savings (₹)', 'Priority']],
        body: suggestionData,
        theme: 'grid',
        styles: { fontSize: 9 },
        headStyles: { fillColor: [66, 139, 202] },
      });

      yPosition = (doc as any).lastAutoTable.finalY + 15;
    }

    // Compliance Notes
    if (options.sections.compliance_notes && analysis.compliance_notes.length > 0) {
      if (yPosition > 220) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('Compliance Notes', 20, yPosition);
      yPosition += 10;

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      
      analysis.compliance_notes.forEach((note, index) => {
        if (yPosition > 270) {
          doc.addPage();
          yPosition = 20;
        }
        doc.text(`${index + 1}. ${note}`, 20, yPosition);
        yPosition += 6;
      });
    }

    // Disclaimer
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('DISCLAIMER', 20, 30);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const disclaimerLines = doc.splitTextToSize(analysis.disclaimer, 170);
    doc.text(disclaimerLines, 20, 45);

    // Save the PDF
    doc.save(`tax-analysis-${analysis.financial_year}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  static async exportToExcel(
    analysis: AITaxAnalysisResult,
    options: ExportOptions
  ): Promise<void> {
    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    if (options.sections.summary) {
      const summaryData = [
        ['Financial Year', analysis.financial_year],
        ['Analysis Date', analysis.analysis_date],
        ['', ''],
        ['FINANCIAL SUMMARY', ''],
        ['Gross Turnover', analysis.financial_summary.gross_turnover],
        ['Net Profit', analysis.financial_summary.net_profit],
        ['', ''],
        ['EXPENSES BREAKDOWN', ''],
        ['Salaries', analysis.financial_summary.expenses.salaries],
        ['Rent', analysis.financial_summary.expenses.rent],
        ['Utilities', analysis.financial_summary.expenses.utilities],
        ['Marketing', analysis.financial_summary.expenses.marketing],
        ['Loan Interest', analysis.financial_summary.expenses.loan_interest],
        ['Professional Fees', analysis.financial_summary.expenses.professional_fees],
        ['Office Expenses', analysis.financial_summary.expenses.office_expenses],
        ['Travel Expenses', analysis.financial_summary.expenses.travel_expenses],
        ['Repairs & Maintenance', analysis.financial_summary.expenses.repairs_maintenance],
        ['Insurance', analysis.financial_summary.expenses.insurance],
        ['Depreciation', analysis.financial_summary.expenses.depreciation],
        ['Other Expenses', analysis.financial_summary.expenses.other_expenses],
        ['', ''],
        ['ASSETS', ''],
        ['Plant & Machinery', analysis.financial_summary.assets.plant_machinery],
        ['Computers', analysis.financial_summary.assets.computers],
        ['Vehicles', analysis.financial_summary.assets.vehicles],
        ['Furniture & Fixtures', analysis.financial_summary.assets.furniture_fixtures],
        ['Land & Building', analysis.financial_summary.assets.land_building],
        ['Other Assets', analysis.financial_summary.assets.other_assets],
      ];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Financial Summary');
    }

    // Tax Calculation Sheet
    if (options.sections.tax_calculation) {
      const taxData = [
        ['TAX CALCULATION', ''],
        ['Gross Income', analysis.tax_calculation.gross_income],
        ['Total Deductions', analysis.tax_calculation.total_deductions],
        ['Taxable Income', analysis.tax_calculation.taxable_income],
        ['', ''],
        ['TAX BREAKDOWN', ''],
        ['Income Tax', analysis.tax_calculation.tax_breakdown.income_tax],
        ['Surcharge', analysis.tax_calculation.tax_breakdown.surcharge],
        ['Cess', analysis.tax_calculation.tax_breakdown.cess],
        ['Total Tax Liability', analysis.tax_calculation.tax_breakdown.total],
        ['', ''],
        ['Effective Tax Rate (%)', analysis.tax_calculation.effective_tax_rate],
      ];

      const taxSheet = XLSX.utils.aoa_to_sheet(taxData);
      XLSX.utils.book_append_sheet(workbook, taxSheet, 'Tax Calculation');
    }

    // Deductions Sheet
    if (options.sections.deductions) {
      const deductionData = [
        ['Section', 'Title', 'Description', 'Eligible Amount', 'Max Limit', 'Applicable', 'Recommendation']
      ];

      analysis.eligible_deductions.forEach(deduction => {
        deductionData.push([
          deduction.section,
          deduction.title,
          deduction.description,
          String(deduction.eligible_amount || ''),
          String(deduction.max_limit || ''),
          deduction.applicable ? 'Yes' : 'No',
          deduction.recommendation
        ]);
      });

      const deductionSheet = XLSX.utils.aoa_to_sheet(deductionData);
      XLSX.utils.book_append_sheet(workbook, deductionSheet, 'Deductions');
    }

    // Suggestions Sheet
    if (options.sections.suggestions) {
      const suggestionData = [
        ['Title', 'Category', 'Description', 'Potential Savings', 'Priority', 'Implementation Steps']
      ];

      analysis.optimization_suggestions.forEach(suggestion => {
        suggestionData.push([
          suggestion.title,
          suggestion.category,
          suggestion.description,
          String(suggestion.potential_savings || ''),
          suggestion.priority,
          suggestion.implementation_steps.join('; ')
        ]);
      });

      const suggestionSheet = XLSX.utils.aoa_to_sheet(suggestionData);
      XLSX.utils.book_append_sheet(workbook, suggestionSheet, 'Optimization');
    }

    // Compliance Notes Sheet
    if (options.sections.compliance_notes) {
      const complianceData = [
        ['Compliance Notes'],
        [''],
        ...analysis.compliance_notes.map((note, index) => [`${index + 1}. ${note}`]),
        [''],
        ['DISCLAIMER'],
        [analysis.disclaimer]
      ];

      const complianceSheet = XLSX.utils.aoa_to_sheet(complianceData);
      XLSX.utils.book_append_sheet(workbook, complianceSheet, 'Compliance');
    }

    // Save the Excel file
    XLSX.writeFile(workbook, `tax-analysis-${analysis.financial_year}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  private static formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(amount);
  }
}
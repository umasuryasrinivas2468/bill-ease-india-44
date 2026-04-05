import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, BookOpen } from 'lucide-react';
import { FinancialData, CompanyDetails } from '@/services/financialStatementsService';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ScheduleIIIBalanceSheetProps {
  financialData: FinancialData | null;
  companyDetails: CompanyDetails;
  financialYear: string;
  formatCurrency: (amount: number) => string;
}

interface BSRow {
  label: string;
  noteNo?: string;
  currentPeriod: number | null;
  previousPeriod: number | null;
  indent?: number;
  bold?: boolean;
  section?: boolean;
}

const ScheduleIIIBalanceSheet: React.FC<ScheduleIIIBalanceSheetProps> = ({
  financialData,
  companyDetails,
  financialYear,
  formatCurrency,
}) => {
  if (!financialData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Schedule III Balance Sheet</CardTitle>
          <CardDescription>As per Companies Act, 2013</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data available. Please fetch financial data first.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const equityRows: BSRow[] = [
    { label: 'I. EQUITY AND LIABILITIES', currentPeriod: null, previousPeriod: null, bold: true, section: true },
    { label: '(1) Shareholder\'s funds', currentPeriod: null, previousPeriod: null, bold: true },
    { label: '(a) Share capital', currentPeriod: financialData.shareCapital, previousPeriod: null, indent: 2 },
    { label: '(b) Reserves and surplus', currentPeriod: financialData.reservesAndSurplus, previousPeriod: null, indent: 2 },
    { label: '(c) Money received against share warrants', currentPeriod: 0, previousPeriod: null, indent: 2 },
    { label: '(2) Share application money pending allotment', currentPeriod: 0, previousPeriod: null, bold: true },
    { label: '(3) Non-current liabilities', currentPeriod: null, previousPeriod: null, bold: true },
    { label: '(a) Long-term borrowings', currentPeriod: financialData.longTermBorrowings, previousPeriod: null, indent: 2 },
    { label: '(b) Deferred tax liabilities (Net)', currentPeriod: 0, previousPeriod: null, indent: 2 },
    { label: '(c) Other long term liabilities', currentPeriod: 0, previousPeriod: null, indent: 2 },
    { label: '(d) Long-term provisions', currentPeriod: 0, previousPeriod: null, indent: 2 },
    { label: '(4) Current liabilities', currentPeriod: null, previousPeriod: null, bold: true },
    { label: '(a) Short-term borrowings', currentPeriod: financialData.shortTermBorrowings, previousPeriod: null, indent: 2 },
    { label: '(b) Trade payables', currentPeriod: financialData.tradePayables, previousPeriod: null, indent: 2 },
    { label: '(c) Other current liabilities', currentPeriod: financialData.otherCurrentLiabilities, previousPeriod: null, indent: 2 },
    { label: '(d) Short-term provisions', currentPeriod: 0, previousPeriod: null, indent: 2 },
    { label: 'Total', currentPeriod: financialData.totalEquityAndLiabilities, previousPeriod: null, bold: true, section: true },
  ];

  const assetRows: BSRow[] = [
    { label: 'II. ASSETS', currentPeriod: null, previousPeriod: null, bold: true, section: true },
    { label: 'Non-current assets', currentPeriod: null, previousPeriod: null, bold: true },
    { label: '(1) (a) Fixed assets', currentPeriod: null, previousPeriod: null, indent: 1 },
    { label: '(i) Tangible assets', currentPeriod: financialData.fixedAssets, previousPeriod: null, indent: 3 },
    { label: '(ii) Intangible assets', currentPeriod: 0, previousPeriod: null, indent: 3 },
    { label: '(iii) Capital work-in progress', currentPeriod: 0, previousPeriod: null, indent: 3 },
    { label: '(iv) Intangible assets under development', currentPeriod: 0, previousPeriod: null, indent: 3 },
    { label: '(b) Non-current investments', currentPeriod: financialData.nonCurrentInvestments, previousPeriod: null, indent: 1 },
    { label: '(c) Deferred tax assets (Net)', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: '(d) Long-term loans and advances', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: '(e) Other non-current assets', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: 'Current assets', currentPeriod: null, previousPeriod: null, bold: true },
    { label: '(a) Current investments', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: '(b) Inventories', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: '(c) Trade receivables', currentPeriod: financialData.tradeReceivables, previousPeriod: null, indent: 1 },
    { label: '(d) Cash and cash equivalents', currentPeriod: financialData.cashAndBank, previousPeriod: null, indent: 1 },
    { label: '(e) Short-term loans and advances', currentPeriod: 0, previousPeriod: null, indent: 1 },
    { label: '(f) Other current assets', currentPeriod: financialData.otherCurrentAssets, previousPeriod: null, indent: 1 },
    { label: 'Total', currentPeriod: financialData.totalAssets, previousPeriod: null, bold: true, section: true },
  ];

  const allRows = [...equityRows, { label: '', currentPeriod: null, previousPeriod: null }, ...assetRows];

  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text('SCHEDULE III BALANCE SHEET', pageWidth / 2, 15, { align: 'center' });

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Name of the company: ${companyDetails.companyName}`, 14, 25);
      doc.text(`Balance sheet as at: ${financialYear}`, 14, 31);
      if (companyDetails.cin) doc.text(`CIN: ${companyDetails.cin}`, 14, 37);

      const tableData = allRows.map(row => {
        const indent = '    '.repeat(row.indent || 0);
        return [
          `${indent}${row.label}`,
          row.noteNo || '',
          row.currentPeriod !== null ? formatCurrency(row.currentPeriod) : '',
          row.previousPeriod !== null ? formatCurrency(row.previousPeriod) : '',
        ];
      });

      autoTable(doc, {
        startY: companyDetails.cin ? 42 : 36,
        head: [['Particulars', 'Note No.', `Current Period (${financialYear})`, 'Previous Period']],
        body: tableData,
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [60, 60, 60], textColor: 255, fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 20, halign: 'center' },
          2: { cellWidth: 40, halign: 'right' },
          3: { cellWidth: 40, halign: 'right' },
        },
        didParseCell: (data) => {
          const row = allRows[data.row.index];
          if (row && data.section === 'body') {
            if (row.bold || row.section) {
              data.cell.styles.fontStyle = 'bold';
            }
            if (row.section) {
              data.cell.styles.fillColor = [240, 240, 240];
            }
          }
        },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 15;
      doc.setFontSize(8);
      doc.text('As per our report of even date attached', 14, finalY);
      doc.text(`For ${companyDetails.companyName}`, pageWidth - 14, finalY, { align: 'right' });
      doc.text(`Director: ${companyDetails.ownerName}`, pageWidth - 14, finalY + 6, { align: 'right' });
      if (companyDetails.directorDIN) {
        doc.text(`DIN: ${companyDetails.directorDIN}`, pageWidth - 14, finalY + 12, { align: 'right' });
      }

      doc.save(`Schedule_III_Balance_Sheet_${companyDetails.companyName.replace(/\s+/g, '_')}_${financialYear}.pdf`);
      toast.success('Schedule III Balance Sheet PDF downloaded');
    } catch (error) {
      console.error('Error generating PDF:', error);
      toast.error('Failed to generate PDF');
    }
  };

  const renderRow = (row: BSRow, index: number) => {
    if (!row.label) return <tr key={index}><td colSpan={4} className="py-2" /></tr>;

    return (
      <tr
        key={index}
        className={`border-b ${row.section ? 'bg-muted/50' : ''} ${row.bold ? 'font-semibold' : ''}`}
      >
        <td className={`py-1.5 px-3 text-sm`} style={{ paddingLeft: `${12 + (row.indent || 0) * 16}px` }}>
          {row.label}
        </td>
        <td className="py-1.5 px-3 text-center text-sm text-muted-foreground">{row.noteNo || ''}</td>
        <td className="py-1.5 px-3 text-right text-sm">
          {row.currentPeriod !== null ? formatCurrency(row.currentPeriod) : ''}
        </td>
        <td className="py-1.5 px-3 text-right text-sm text-muted-foreground">
          {row.previousPeriod !== null ? formatCurrency(row.previousPeriod) : ''}
        </td>
      </tr>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Schedule III Balance Sheet</CardTitle>
          <CardDescription>As per Companies Act, 2013 — {companyDetails.companyName}</CardDescription>
        </div>
        <Button size="sm" onClick={handleDownloadPDF} variant="outline">
          <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
        </Button>
      </CardHeader>
      <CardContent>
        <div className="mb-4 text-sm space-y-1">
          <p><span className="text-muted-foreground">Name of the company:</span> <strong>{companyDetails.companyName}</strong></p>
          <p><span className="text-muted-foreground">Balance sheet as at:</span> <strong>{financialYear || 'N/A'}</strong></p>
          {companyDetails.cin && <p><span className="text-muted-foreground">CIN:</span> {companyDetails.cin}</p>}
        </div>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted">
                <th className="text-left py-2 px-3 text-xs font-semibold">Particulars</th>
                <th className="text-center py-2 px-3 text-xs font-semibold w-20">Note No.</th>
                <th className="text-right py-2 px-3 text-xs font-semibold w-36">Current Period</th>
                <th className="text-right py-2 px-3 text-xs font-semibold w-36">Previous Period</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, i) => renderRow(row, i))}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-between text-xs text-muted-foreground">
          <p>As per our report of even date attached</p>
          <div className="text-right">
            <p className="font-medium text-foreground">For {companyDetails.companyName}</p>
            <p className="mt-1">Director: {companyDetails.ownerName}</p>
            {companyDetails.directorDIN && <p>DIN: {companyDetails.directorDIN}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ScheduleIIIBalanceSheet;

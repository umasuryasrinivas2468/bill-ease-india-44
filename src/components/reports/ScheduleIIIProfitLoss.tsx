import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Calculator } from 'lucide-react';
import { FinancialData, CompanyDetails } from '@/services/financialStatementsService';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Props {
  financialData: FinancialData | null;
  companyDetails: CompanyDetails;
  financialYear: string;
  formatCurrency: (amount: number) => string;
}

interface PLRow {
  label: string;
  noteNo?: string;
  currentPeriod: number | null;
  previousPeriod: number | null;
  indent?: number;
  bold?: boolean;
  section?: boolean;
  borderTop?: boolean;
  isNegative?: boolean;
}

const ScheduleIIIProfitLoss: React.FC<Props> = ({
  financialData,
  companyDetails,
  financialYear,
  formatCurrency,
}) => {
  if (!financialData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Statement of Profit &amp; Loss</CardTitle>
          <CardDescription>As per Schedule III — Companies Act, 2013</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data available. Please fetch financial data first from the Setup tab.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalRevenue      = financialData.totalRevenue;
  const costOfMaterials   = financialData.costOfMaterialsConsumed;
  // Changes in inventories (placeholder — 0 unless inventory module feeds this)
  const inventoryChanges  = 0;
  const employeeBenefit   = financialData.employeeBenefitExpense;
  const financeCosts      = financialData.financialCosts;
  const depreciation      = financialData.depreciationExpense;
  const otherExpenses     = financialData.otherExpenses;
  const totalExpenses     = financialData.totalExpenses;

  const profitBeforeExc   = totalRevenue - totalExpenses;
  const exceptionalItems  = 0;
  const profitBeforeTax   = profitBeforeExc - exceptionalItems;
  const currentTax        = financialData.taxExpense * 0.9;
  const deferredTax       = financialData.taxExpense * 0.1;
  const totalTax          = financialData.taxExpense;
  const profitAfterTax    = financialData.profitAfterTax;

  // EPS (basic — assuming ₹10 face value share capital / 10 = shares)
  const shares            = (financialData.shareCapital || 10000) / 10;
  const eps               = shares > 0 ? profitAfterTax / shares : 0;

  const plRows: PLRow[] = [
    // ── Revenue ──────────────────────────────────────────────────────────────
    { label: 'I.   Revenue from Operations',          noteNo: '1', currentPeriod: financialData.revenueFromOperations,  previousPeriod: null, bold: true },
    { label: 'II.  Other Income',                     noteNo: '2', currentPeriod: financialData.otherIncome,            previousPeriod: null, bold: true },
    { label: 'III. Total Revenue (I + II)',                         currentPeriod: totalRevenue,                         previousPeriod: null, bold: true, borderTop: true },

    // ── Expenses ─────────────────────────────────────────────────────────────
    { label: 'IV.  Expenses',                                       currentPeriod: null,      previousPeriod: null, bold: true, section: true },
    { label: '(a)  Cost of Materials Consumed',        noteNo: '3', currentPeriod: costOfMaterials,   previousPeriod: null, indent: 1 },
    { label: '(b)  Purchases of Stock-in-Trade',       noteNo: '4', currentPeriod: 0,                 previousPeriod: null, indent: 1 },
    { label: '(c)  Changes in Inventories of FG / WIP / Stock-in-Trade', noteNo: '5', currentPeriod: inventoryChanges, previousPeriod: null, indent: 1 },
    { label: '(d)  Employee Benefit Expense',          noteNo: '6', currentPeriod: employeeBenefit,   previousPeriod: null, indent: 1 },
    { label: '(e)  Finance Costs',                     noteNo: '7', currentPeriod: financeCosts,      previousPeriod: null, indent: 1 },
    { label: '(f)  Depreciation and Amortization Expense', noteNo: '8', currentPeriod: depreciation, previousPeriod: null, indent: 1 },
    { label: '(g)  Other Expenses',                    noteNo: '9', currentPeriod: otherExpenses,     previousPeriod: null, indent: 1 },
    { label: '     Total Expenses (IV)',                             currentPeriod: totalExpenses,     previousPeriod: null, bold: true, borderTop: true },

    // ── Profit ───────────────────────────────────────────────────────────────
    { label: 'V.   Profit / (Loss) before Exceptional Items & Tax (III - IV)', currentPeriod: profitBeforeExc, previousPeriod: null, bold: true, borderTop: true },
    { label: 'VI.  Exceptional Items',                              currentPeriod: exceptionalItems,  previousPeriod: null },
    { label: 'VII. Profit / (Loss) before Tax (V - VI)',            currentPeriod: profitBeforeTax,   previousPeriod: null, bold: true, borderTop: true },

    // ── Tax ──────────────────────────────────────────────────────────────────
    { label: 'VIII. Tax Expense',                                   currentPeriod: null,              previousPeriod: null, bold: true, section: true },
    { label: '(1)  Current Tax',                                    currentPeriod: currentTax,        previousPeriod: null, indent: 1 },
    { label: '(2)  Deferred Tax',                                   currentPeriod: deferredTax,       previousPeriod: null, indent: 1 },

    // ── PAT ──────────────────────────────────────────────────────────────────
    { label: 'IX.  Profit / (Loss) for the period (VII - VIII)',    currentPeriod: profitAfterTax,    previousPeriod: null, bold: true, borderTop: true },

    // ── EPS ──────────────────────────────────────────────────────────────────
    { label: 'X.   Earnings per Equity Share',                      currentPeriod: null,              previousPeriod: null, bold: true, section: true },
    { label: '(1)  Basic (₹)',                                      currentPeriod: eps,               previousPeriod: null, indent: 1 },
    { label: '(2)  Diluted (₹)',                                    currentPeriod: eps,               previousPeriod: null, indent: 1 },
  ];

  // ── Notes to Accounts ────────────────────────────────────────────────────
  const notes: { no: string; title: string; items: { label: string; amount: number }[] }[] = [
    {
      no: '1', title: 'Revenue from Operations',
      items: financialData.incomeDetails.length > 0
        ? financialData.incomeDetails
        : [{ label: 'Gross Receipts from Services / Sales', amount: financialData.revenueFromOperations }],
    },
    {
      no: '9', title: 'Other Expenses',
      items: financialData.expenseDetails.filter(e =>
        !['Salary', 'Payroll', 'Bank Charges', 'Interest', 'Depreciation'].includes(e.description)
      ),
    },
  ];

  // ── PDF Generator ────────────────────────────────────────────────────────
  const handleDownloadPDF = () => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      let y = 15;

      // Header
      doc.setFontSize(12).setFont('helvetica', 'bold');
      doc.text(companyDetails.companyName || 'Company Name', pageW / 2, y, { align: 'center' });
      y += 6;
      if (companyDetails.cin) {
        doc.setFontSize(8).setFont('helvetica', 'normal');
        doc.text(`CIN: ${companyDetails.cin}`, pageW / 2, y, { align: 'center' });
        y += 5;
      }
      doc.setFontSize(8).setFont('helvetica', 'normal');
      doc.text(companyDetails.address || '', pageW / 2, y, { align: 'center' });
      y += 8;
      doc.setFontSize(10).setFont('helvetica', 'bold');
      doc.text('STATEMENT OF PROFIT AND LOSS', pageW / 2, y, { align: 'center' });
      y += 5;
      doc.setFontSize(8).setFont('helvetica', 'normal');
      doc.text(`For the year ended 31st March ${financialYear.split('-')[0].substring(2) > '90' ? '19' : '20'}${financialYear.split('-')[1] || ''}`, pageW / 2, y, { align: 'center' });
      y += 3;
      doc.text('(All amounts in ₹ unless stated otherwise)', pageW / 2, y, { align: 'center' });
      y += 6;

      // Table
      const tableBody: string[][] = plRows.map(row => [
        row.noteNo || '',
        (row.indent ? '  '.repeat(row.indent) : '') + row.label,
        row.currentPeriod !== null ? formatCurrency(row.currentPeriod) : '',
        row.previousPeriod !== null ? formatCurrency(row.previousPeriod) : '',
      ]);

      autoTable(doc, {
        startY: y,
        head: [['Note', 'Particulars', `Current Year\n${financialYear}`, 'Previous Year']],
        body: tableBody,
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 110 },
          2: { cellWidth: 35, halign: 'right' },
          3: { cellWidth: 35, halign: 'right' },
        },
        didParseCell: (data) => {
          const row = plRows[data.row.index];
          if (!row) return;
          if (row.bold || row.section) data.cell.styles.fontStyle = 'bold';
          if (row.section)             data.cell.styles.fillColor = [243, 244, 246];
          if (row.borderTop)           data.cell.styles.lineWidth = { top: 0.5 };
        },
      });

      y = (doc as any).lastAutoTable.finalY + 10;

      // Notes
      notes.forEach(note => {
        if (!note.items.length) return;
        doc.setFontSize(9).setFont('helvetica', 'bold');
        doc.text(`Note ${note.no} — ${note.title}`, 14, y);
        y += 5;
        autoTable(doc, {
          startY: y,
          head: [['Particulars', 'Amount (₹)']],
          body: [
            ...note.items.map(i => [i.label, formatCurrency(i.amount)]),
            ['Total', formatCurrency(note.items.reduce((s, i) => s + i.amount, 0))],
          ],
          styles: { fontSize: 7 },
          headStyles: { fillColor: [107, 114, 128], textColor: 255 },
          columnStyles: { 1: { halign: 'right', cellWidth: 40 } },
        });
        y = (doc as any).lastAutoTable.finalY + 8;
      });

      // Signatories
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(8).setFont('helvetica', 'normal');
      doc.text('As per our report of even date attached', 14, y); y += 10;
      doc.text('For ' + (companyDetails.companyName || ''), 14, y); y += 14;
      doc.text('_______________________', 14, y);
      doc.text('_______________________', 100, y); y += 5;
      doc.text(companyDetails.ownerName || 'Director', 14, y);
      if (companyDetails.secondDirectorName) doc.text(companyDetails.secondDirectorName, 100, y);
      y += 4;
      if (companyDetails.directorDIN) doc.text(`DIN: ${companyDetails.directorDIN}`, 14, y);
      y += 8;
      doc.text(`Place: ${companyDetails.place || ''}`, 14, y); y += 4;
      doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 14, y);

      doc.save(`ProfitLoss_ScheduleIII_${(companyDetails.companyName || 'Company').replace(/\s+/g, '_')}_${financialYear}.pdf`);
      toast.success('Schedule III P&L PDF downloaded successfully');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Statement of Profit &amp; Loss</CardTitle>
              <CardDescription>As per Schedule III — Part II, Companies Act 2013 · FY {financialYear}</CardDescription>
            </div>
            <Button onClick={handleDownloadPDF} size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Company Header */}
          <div className="text-center mb-6 border-b pb-4">
            <h2 className="text-lg font-bold">{companyDetails.companyName}</h2>
            {companyDetails.cin && <p className="text-xs text-muted-foreground">CIN: {companyDetails.cin}</p>}
            {companyDetails.address && <p className="text-xs text-muted-foreground">{companyDetails.address}</p>}
            <p className="text-sm font-semibold mt-2">STATEMENT OF PROFIT AND LOSS</p>
            <p className="text-xs text-muted-foreground">For the Financial Year {financialYear}</p>
            <p className="text-xs text-muted-foreground">(All amounts in ₹ unless stated otherwise)</p>
          </div>

          {/* P&L Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="border px-2 py-2 text-center w-10">Note</th>
                  <th className="border px-3 py-2 text-left">Particulars</th>
                  <th className="border px-3 py-2 text-right w-36">Current Year (₹)<br /><span className="font-normal text-xs">{financialYear}</span></th>
                  <th className="border px-3 py-2 text-right w-36">Previous Year (₹)</th>
                </tr>
              </thead>
              <tbody>
                {plRows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      row.section
                        ? 'bg-muted font-semibold'
                        : row.bold
                          ? 'font-semibold bg-muted/30'
                          : 'hover:bg-muted/20'
                    }
                  >
                    <td className="border px-2 py-1.5 text-center text-muted-foreground text-xs">{row.noteNo}</td>
                    <td
                      className="border px-3 py-1.5"
                      style={{ paddingLeft: `${(row.indent || 0) * 16 + 12}px` }}
                    >
                      {row.label}
                    </td>
                    <td className={`border px-3 py-1.5 text-right ${row.borderTop ? 'border-t-2 border-t-gray-800' : ''} ${row.currentPeriod !== null && row.currentPeriod < 0 ? 'text-red-600' : ''}`}>
                      {row.currentPeriod !== null ? formatCurrency(Math.abs(row.currentPeriod)) + (row.currentPeriod < 0 ? ' (Dr)' : '') : ''}
                    </td>
                    <td className="border px-3 py-1.5 text-right text-muted-foreground">
                      {row.previousPeriod !== null ? formatCurrency(row.previousPeriod) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <Card className={`border-2 ${profitBeforeTax >= 0 ? 'border-green-400' : 'border-red-400'}`}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Profit Before Tax</p>
                <p className={`text-xl font-bold ${profitBeforeTax >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatCurrency(Math.abs(profitBeforeTax))}
                  {profitBeforeTax < 0 ? ' (Loss)' : ''}
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 border-blue-300">
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Tax Expense</p>
                <p className="text-xl font-bold text-blue-700">{formatCurrency(totalTax)}</p>
              </CardContent>
            </Card>
            <Card className={`border-2 ${profitAfterTax >= 0 ? 'border-green-500' : 'border-red-500'}`}>
              <CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">Profit After Tax (PAT)</p>
                <p className={`text-xl font-bold ${profitAfterTax >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {formatCurrency(Math.abs(profitAfterTax))}
                  {profitAfterTax < 0 ? ' (Loss)' : ''}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Notes */}
          {notes.filter(n => n.items.length > 0).map(note => (
            <div key={note.no} className="mt-6">
              <h4 className="font-semibold text-sm mb-2 border-b pb-1">Note {note.no} — {note.title}</h4>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-muted">
                    <th className="border px-3 py-1.5 text-left">Particulars</th>
                    <th className="border px-3 py-1.5 text-right w-40">Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {note.items.map((item, j) => (
                    <tr key={j} className="hover:bg-muted/20">
                      <td className="border px-3 py-1.5">{item.label}</td>
                      <td className="border px-3 py-1.5 text-right">{formatCurrency(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold bg-muted/40">
                    <td className="border px-3 py-1.5">Total</td>
                    <td className="border px-3 py-1.5 text-right">
                      {formatCurrency(note.items.reduce((s, i) => s + i.amount, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ))}

          {/* Signatories */}
          <div className="mt-8 pt-6 border-t grid grid-cols-2 gap-8 text-sm">
            <div>
              <p className="font-semibold mb-6">For {companyDetails.companyName}</p>
              <p className="font-medium">{companyDetails.ownerName}</p>
              {companyDetails.directorDIN && <p className="text-xs text-muted-foreground">DIN: {companyDetails.directorDIN}</p>}
              <p className="text-xs text-muted-foreground">Director</p>
            </div>
            {companyDetails.secondDirectorName && (
              <div className="pt-8">
                <p className="font-medium">{companyDetails.secondDirectorName}</p>
                {companyDetails.secondDirectorDIN && <p className="text-xs text-muted-foreground">DIN: {companyDetails.secondDirectorDIN}</p>}
                <p className="text-xs text-muted-foreground">Director</p>
              </div>
            )}
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            <p>Place: {companyDetails.place}</p>
            <p>Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ScheduleIIIProfitLoss;

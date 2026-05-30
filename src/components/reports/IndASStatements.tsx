import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Loader2, RefreshCw, ArrowDownToLine, BookOpen, Calculator, AlertCircle,
} from 'lucide-react';
import {
  fetchIndASBalanceSheet, fetchIndASPLandOCI,
  getReportingDivision, setReportingDivision,
  IndASBalanceSheet, IndASProfitLossAndOCI,
} from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface Props {
  financialYear: string;
  companyName?: string;
}

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const IndASStatements: React.FC<Props> = ({ financialYear, companyName }) => {
  const { user } = useUser();
  const [division, setDivision] = useState<'Division_I' | 'Division_II'>('Division_I');
  const [comparative, setComparative] = useState(true);
  const [bs, setBs] = useState<IndASBalanceSheet | null>(null);
  const [pl, setPl] = useState<IndASProfitLossAndOCI | null>(null);
  const [loading, setLoading] = useState(false);
  const [switching, setSwitching] = useState(false);

  const loadDivision = async () => {
    if (!user?.id) return;
    setDivision(await getReportingDivision(user.id));
  };

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [bsR, plR] = await Promise.all([
      fetchIndASBalanceSheet(user.id, financialYear, comparative),
      fetchIndASPLandOCI(user.id, financialYear, comparative),
    ]);
    setBs(bsR); setPl(plR);
    setLoading(false);
  };

  useEffect(() => { loadDivision(); /* eslint-disable-next-line */ }, [user?.id]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear, comparative]);

  const handleDivisionToggle = async (checked: boolean) => {
    if (!user?.id) return;
    const next = checked ? 'Division_II' : 'Division_I';
    setSwitching(true);
    try {
      await setReportingDivision(user.id, next);
      setDivision(next);
      toast.success(`Reporting division switched to ${next.replace('_', ' ')}`);
    } catch {
      toast.error('Failed to switch division');
    } finally { setSwitching(false); }
  };

  const handlePDF = () => {
    if (!bs || !pl) return;
    const doc = new jsPDF('p', 'mm', 'a4');
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Ind AS DIVISION II — BALANCE SHEET', w / 2, 15, { align: 'center' });
    if (companyName) { doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.text(companyName, w / 2, 22, { align: 'center' }); }
    doc.text(`As at ${bs.as_of}`, w / 2, 28, { align: 'center' });

    const bsBody: any[][] = [];
    for (const sec of bs.sections) {
      bsBody.push([sec.section.replace(/_/g, ' '), '', formatINR(sec.total), bs.comparative ? formatINR(sec.prev_total) : '']);
      for (const sub of sec.subsections) {
        bsBody.push([`  ${sub.subsection}`, '', formatINR(sub.total), bs.comparative ? formatINR(sub.prev_total) : '']);
        for (const l of sub.lines) {
          bsBody.push([`    ${l.label}`, l.note_no ?? '', formatINR(l.amount), bs.comparative ? formatINR(l.prev_amount) : '']);
        }
      }
    }
    autoTable(doc, {
      startY: 36, head: [['Particulars', 'Note', 'Current (₹)', 'Previous (₹)']],
      body: bsBody, styles: { fontSize: 8, cellPadding: 1.3 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      columnStyles: { 0: { cellWidth: 95 }, 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    doc.addPage();
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Ind AS DIVISION II — P&L + OCI', w / 2, 15, { align: 'center' });
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.text(`For the period ${pl.period_start} to ${pl.period_end}`, w / 2, 22, { align: 'center' });

    const plBody: any[][] = [
      ['I.   Revenue from Operations', '23', formatINR(pl.profit_loss_lines.find(l => l.line_code === 'PL.R.1')?.amount ?? 0)],
      ['II.  Other Income',            '24', formatINR(pl.profit_loss_lines.find(l => l.line_code === 'PL.R.2')?.amount ?? 0)],
      ['III. Total Income (I+II)',     '',   formatINR(pl.total_revenue)],
      ['IV.  Expenses',                '',   ''],
      ...pl.profit_loss_lines.filter(l => l.section === 'EXPENSES' && l.line_code !== 'PL.E.8').map(l =>
        [`     ${l.label}`, l.note_no ?? '', formatINR(l.amount)]),
      ['     Total Expenses (IV)',     '',   formatINR(pl.total_expenses)],
      ['V.   Profit / (Loss) Before Tax (III - IV)', '', formatINR(pl.profit_before_tax)],
      ['VI.  Tax Expense',             '31', formatINR(pl.tax_expense)],
      ['VII. Profit / (Loss) for the Period (V - VI)','', formatINR(pl.profit_after_tax)],
      ['', '', ''],
      ['VIII. Other Comprehensive Income', '35', ''],
      ['(A) Items that will not be reclassified to P&L', '', ''],
      ...pl.oci_lines.filter(l => l.classification === 'OCI_NON_RECLASSIFIABLE' && !l.label.includes('Items that will not')).map(l =>
        [`     ${l.label}`, '', formatINR(l.amount)]),
      ['(B) Items that may be reclassified to P&L', '', ''],
      ...pl.oci_lines.filter(l => l.classification === 'OCI_RECLASSIFIABLE' && !l.label.includes('Items that may')).map(l =>
        [`     ${l.label}`, '', formatINR(l.amount)]),
      ['Total Other Comprehensive Income (VIII)', '', formatINR(pl.total_oci)],
      ['', '', ''],
      ['IX.  Total Comprehensive Income for the Period (VII + VIII)', '', formatINR(pl.total_comprehensive_income)],
    ];
    autoTable(doc, {
      startY: 32, head: [['Particulars', 'Note', 'Amount (₹)']], body: plBody,
      styles: { fontSize: 8, cellPadding: 1.3 },
      headStyles: { fillColor: [40, 40, 40], textColor: 255 },
      columnStyles: { 0: { cellWidth: 130 }, 1: { halign: 'center', cellWidth: 15 }, 2: { halign: 'right' } },
    });

    doc.save(`Ind_AS_Statements_${financialYear}.pdf`);
    toast.success('Ind AS PDF downloaded');
  };

  return (
    <div className="space-y-4">
      {/* Division toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Ind AS Division II
          </CardTitle>
          <CardDescription>
            Alternative presentation for listed companies and Ind AS reporters per Companies Act 2013, Schedule III Division II.
            Includes P&amp;L + OCI and Total Comprehensive Income.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Switch checked={division === 'Division_II'} onCheckedChange={handleDivisionToggle} disabled={switching} />
              <Label className="text-sm">
                Reporting Division — <strong>{division === 'Division_II' ? 'Division II (Ind AS)' : 'Division I (Indian GAAP)'}</strong>
              </Label>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch checked={comparative} onCheckedChange={setComparative} />
                <Label className="text-sm">Show comparative</Label>
              </div>
              <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1.5 hidden sm:inline">Refresh</span>
              </Button>
              <Button size="sm" variant="outline" onClick={handlePDF} disabled={!bs || !pl}>
                <ArrowDownToLine className="h-4 w-4" />
                <span className="ml-1.5 hidden sm:inline">PDF</span>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ind AS Statements · FY {financialYear}</CardTitle>
          <CardDescription>
            Grouped by financial vs non-financial assets/liabilities · OCI section included
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && !bs ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Computing Ind AS statements…
            </div>
          ) : !bs || !pl ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No data — ensure accounts have Schedule III tagging.
            </div>
          ) : (
            <Tabs defaultValue="bs">
              <TabsList>
                <TabsTrigger value="bs"><BookOpen className="h-3.5 w-3.5 mr-1.5" /> Balance Sheet</TabsTrigger>
                <TabsTrigger value="pl"><Calculator className="h-3.5 w-3.5 mr-1.5" /> P&amp;L + OCI</TabsTrigger>
              </TabsList>

              <TabsContent value="bs" className="pt-3">
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Particulars</th>
                        <th className="px-3 py-2 text-center font-medium w-14">Note</th>
                        <th className="px-3 py-2 text-right font-medium">Current (₹)</th>
                        {comparative && <th className="px-3 py-2 text-right font-medium">Previous (₹)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {bs.sections.map(sec => (
                        <React.Fragment key={sec.section}>
                          <tr className="border-t bg-muted/30 font-semibold">
                            <td className="px-3 py-1.5">{sec.section.replace(/_/g, ' ')}</td>
                            <td />
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(sec.total)}</td>
                            {comparative && <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(sec.prev_total)}</td>}
                          </tr>
                          {sec.subsections.map(sub => (
                            <React.Fragment key={sub.subsection}>
                              <tr className="border-t">
                                <td className="px-3 py-1.5 pl-6 font-medium text-xs uppercase text-muted-foreground">
                                  {sub.subsection}
                                </td>
                                <td />
                                <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatINR(sub.total)}</td>
                                {comparative && <td className="px-3 py-1.5 text-right text-xs tabular-nums text-muted-foreground">{formatINR(sub.prev_total)}</td>}
                              </tr>
                              {sub.lines.map(l => (
                                <tr key={l.line_code} className="border-t hover:bg-muted/20">
                                  <td className="px-3 py-1.5 pl-10">{l.label}</td>
                                  <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{l.note_no ?? ''}</td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.amount)}</td>
                                  {comparative && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatINR(l.prev_amount)}</td>}
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="pl" className="pt-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">PAT</div>
                    <div className={cn('text-base font-semibold tabular-nums',
                      pl.profit_after_tax >= 0 ? 'text-emerald-600' : 'text-red-600')}>₹ {formatINR(pl.profit_after_tax)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">OCI</div>
                    <div className={cn('text-base font-semibold tabular-nums',
                      pl.total_oci >= 0 ? 'text-emerald-600' : 'text-red-600')}>₹ {formatINR(pl.total_oci)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Total Comp. Income</div>
                    <div className={cn('text-base font-semibold tabular-nums',
                      pl.total_comprehensive_income >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      ₹ {formatINR(pl.total_comprehensive_income)}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Tax Expense</div>
                    <div className="text-base font-semibold tabular-nums">₹ {formatINR(pl.tax_expense)}</div>
                  </div>
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Particulars</th>
                        <th className="px-3 py-2 text-center font-medium w-14">Note</th>
                        <th className="px-3 py-2 text-right font-medium">Amount (₹)</th>
                        {comparative && <th className="px-3 py-2 text-right font-medium">Previous (₹)</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pl.profit_loss_lines.map(l => (
                        <tr key={l.line_code} className={cn('border-t', l.section === 'EXPENSES' && 'bg-muted/10')}>
                          <td className="px-3 py-1.5">{l.label}</td>
                          <td className="px-3 py-1.5 text-center text-xs text-muted-foreground">{l.note_no ?? ''}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(l.amount)}</td>
                          {comparative && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{formatINR(l.prev_amount)}</td>}
                        </tr>
                      ))}
                      <tr className="border-t bg-primary/5 font-semibold">
                        <td className="px-3 py-2">VII. Profit / (Loss) for the Period</td>
                        <td />
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(pl.profit_after_tax)}</td>
                        {comparative && <td />}
                      </tr>

                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="px-3 py-2">VIII. Other Comprehensive Income</td>
                        <td className="px-3 py-2 text-center text-xs">35</td>
                        <td />
                        {comparative && <td />}
                      </tr>
                      {pl.oci_lines.map(l => (
                        <tr key={l.line_code} className="border-t">
                          <td className={cn('px-3 py-1.5', !l.label.startsWith('Items') && 'pl-8')}>{l.label}</td>
                          <td />
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.label.startsWith('Items') ? '' : formatINR(l.amount)}</td>
                          {comparative && <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{l.label.startsWith('Items') ? '' : formatINR(l.prev_amount)}</td>}
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/30 font-semibold">
                        <td className="px-3 py-2">Total Other Comprehensive Income (VIII)</td>
                        <td />
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(pl.total_oci)}</td>
                        {comparative && <td />}
                      </tr>

                      <tr className="border-t bg-primary/10 font-bold">
                        <td className="px-3 py-2">IX. Total Comprehensive Income (VII + VIII)</td>
                        <td />
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(pl.total_comprehensive_income)}</td>
                        {comparative && <td />}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {pl.oci_lines.length === 0 && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs dark:bg-amber-950/20 dark:border-amber-800">
                    <strong>Note:</strong> No OCI postings detected. To populate this section, create accounts under
                    "Other Comprehensive Income" and tag with <code>schedule_iii_line_code</code> matching
                    <code>PL.OCI.NR.*</code> (non-reclassifiable) or <code>PL.OCI.R.*</code> (reclassifiable),
                    then post journals such as actuarial revaluation, FVOCI fair-value changes, or FCTR movements.
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default IndASStatements;

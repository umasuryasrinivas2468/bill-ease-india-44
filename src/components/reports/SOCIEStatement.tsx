import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, ArrowDownToLine, ArrowUp, ArrowDown, Wallet } from 'lucide-react';
import { fetchSOCIE, SOCIE } from '@/services/financialStatementsService';
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

const SOCIEStatement: React.FC<Props> = ({ financialYear, companyName }) => {
  const { user } = useUser();
  const [socie, setSocie] = useState<SOCIE | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setSocie(await fetchSOCIE(user.id, financialYear));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const handlePDF = () => {
    if (!socie) return;
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('STATEMENT OF CHANGES IN EQUITY', w / 2, 15, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      if (companyName) doc.text(companyName, w / 2, 22, { align: 'center' });
      doc.text(`For the period ${socie.period_start} to ${socie.period_end}`, w / 2, 28, { align: 'center' });

      const body = socie.components.map(c => [
        c.account_name,
        c.line_label ?? '',
        formatINR(c.opening_balance),
        formatINR(c.profit_for_period),
        formatINR(c.other_movements),
        formatINR(c.closing_balance),
      ]);
      body.push([
        'TOTAL', '',
        formatINR(socie.totals.opening_balance),
        formatINR(socie.totals.profit_for_period),
        formatINR(socie.totals.other_movements),
        formatINR(socie.totals.closing_balance),
      ]);

      autoTable(doc, {
        startY: 36,
        head: [['Account', 'Schedule III Line', 'Opening', 'Profit for Period', 'Other Movements', 'Closing']],
        body,
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [40, 40, 40], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 35 },
          2: { halign: 'right' },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
        didParseCell: (d) => {
          if (d.section === 'body' && d.row.index === body.length - 1) {
            d.cell.styles.fontStyle = 'bold';
            d.cell.styles.fillColor = [240, 240, 240];
          }
        },
      });

      doc.save(`Statement_of_Changes_in_Equity_${financialYear}.pdf`);
      toast.success('SOCIE PDF downloaded');
    } catch (e) {
      console.error('SOCIE PDF error', e);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4" /> Statement of Changes in Equity
          </CardTitle>
          <CardDescription>Equity movement schedule · Required under Schedule III for Division II reporters</CardDescription>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handlePDF} disabled={!socie}>
            <ArrowDownToLine className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !socie ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing equity movement…
          </div>
        ) : !socie || socie.components.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No equity accounts found. Ensure share capital & reserves accounts exist in your COA.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Opening Equity</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(socie.totals.opening_balance)}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Profit for Period</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  socie.pat_for_period >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  ₹ {formatINR(socie.pat_for_period)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Other Movements</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(socie.totals.other_movements)}</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Closing Equity</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(socie.totals.closing_balance)}</div>
              </div>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Equity Component</th>
                    <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Schedule III Line</th>
                    <th className="px-3 py-2 text-right font-medium">Opening</th>
                    <th className="px-3 py-2 text-right font-medium">Profit for Period</th>
                    <th className="px-3 py-2 text-right font-medium">Other Movements</th>
                    <th className="px-3 py-2 text-right font-medium">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {socie.components.map(c => (
                    <tr key={c.account_id} className="border-t hover:bg-muted/30">
                      <td className="px-3 py-1.5">
                        <div className="font-medium">{c.account_name}</div>
                        <div className="text-[10px] font-mono text-muted-foreground">{c.account_code}</div>
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground hidden md:table-cell">
                        {c.line_label ?? '—'}
                        {c.line_code && <Badge variant="outline" className="ml-2 text-[10px] font-mono">{c.line_code}</Badge>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(c.opening_balance)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">
                        {c.profit_for_period !== 0 && (
                          <span className={cn('inline-flex items-center gap-0.5', c.profit_for_period >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            {c.profit_for_period >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                            {formatINR(c.profit_for_period)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(c.other_movements)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatINR(c.closing_balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/40 font-semibold">
                  <tr className="border-t">
                    <td colSpan={2} className="px-3 py-2 text-right">TOTAL</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(socie.totals.opening_balance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(socie.totals.profit_for_period)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(socie.totals.other_movements)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatINR(socie.totals.closing_balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SOCIEStatement;

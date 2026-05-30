import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowDownToLine, Loader2, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchCashFlowStatement, CashFlowStatement as CFS, CashFlowSection } from '@/services/financialStatementsService';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface Props {
  financialYear: string;
  companyName?: string;
}

const formatINR = (n: number | null) => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const SectionTable: React.FC<{
  title: string;
  badge: string;
  section: CashFlowSection;
}> = ({ title, badge, section }) => (
  <div className="rounded-lg border bg-card">
    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      <Badge variant="secondary" className="text-[11px]">{badge}</Badge>
    </div>
    <table className="w-full text-sm">
      <tbody>
        {section.lines.map((row, idx) => {
          const isHeader = row.group === 'adjustments_header' || row.group === 'wc_header';
          const isSubtotal = row.group === 'subtotal';
          const isTotal = row.group === 'total';
          const isIndented = row.group === 'adjustments' || row.group === 'wc';
          return (
            <tr
              key={idx}
              className={cn(
                'border-b last:border-b-0',
                isHeader && 'bg-muted/20 font-medium',
                isSubtotal && 'font-semibold border-t-2 border-foreground/20',
                isTotal && 'bg-primary/5 font-bold border-t-2 border-primary/30',
              )}
            >
              <td className={cn('px-3 py-1.5', isIndented && 'pl-8')}>
                {row.label}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                {row.amount === null ? '' : formatINR(row.amount)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

const CashFlowStatementComponent: React.FC<Props> = ({ financialYear, companyName }) => {
  const { user } = useUser();
  const [cfs, setCfs] = useState<CFS | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const data = await fetchCashFlowStatement(user.id, financialYear);
    setCfs(data);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id, financialYear]);

  const handlePDF = () => {
    if (!cfs) return;
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const w = doc.internal.pageSize.getWidth();
      doc.setFontSize(14); doc.setFont('helvetica', 'bold');
      doc.text('CASH FLOW STATEMENT', w / 2, 15, { align: 'center' });
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      if (companyName) doc.text(companyName, w / 2, 22, { align: 'center' });
      doc.text(`For the period ${cfs.period_start} to ${cfs.period_end} (Indirect Method)`, w / 2, 28, { align: 'center' });

      let y = 36;
      const writeSection = (title: string, sec: CashFlowSection) => {
        autoTable(doc, {
          startY: y,
          head: [[title, 'Amount (₹)']],
          body: sec.lines.map(l => [l.label, l.amount === null ? '' : formatINR(l.amount)]),
          styles: { fontSize: 9, cellPadding: 1.5 },
          headStyles: { fillColor: [60, 60, 60], textColor: 255 },
          columnStyles: { 0: { cellWidth: 130 }, 1: { halign: 'right' } },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
      };

      writeSection('A. Cash from Operating Activities', cfs.operating);
      writeSection('B. Cash from Investing Activities', cfs.investing);
      writeSection('C. Cash from Financing Activities', cfs.financing);

      autoTable(doc, {
        startY: y,
        body: [
          ['Net Change in Cash & Cash Equivalents (A + B + C)', formatINR(cfs.net_change)],
          ['Opening Cash & Cash Equivalents',                   formatINR(cfs.opening_cash)],
          ['Closing Cash & Cash Equivalents',                   formatINR(cfs.closing_cash)],
          ['Reconciliation Difference',                         formatINR(cfs.reconciliation_diff)],
        ],
        styles: { fontSize: 9, cellPadding: 1.5, fontStyle: 'bold' },
        columnStyles: { 0: { cellWidth: 130 }, 1: { halign: 'right' } },
      });

      doc.save(`Cash_Flow_Statement_${financialYear}.pdf`);
      toast.success('Cash Flow Statement PDF downloaded');
    } catch (e) {
      console.error('CFS PDF error', e);
      toast.error('Failed to generate PDF');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Cash Flow Statement</CardTitle>
          <CardDescription>Indirect method · Schedule III / Ind AS 7</CardDescription>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" variant="outline" onClick={handlePDF} disabled={!cfs}>
            <ArrowDownToLine className="h-4 w-4" />
            <span className="ml-1.5 hidden sm:inline">PDF</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !cfs ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Computing cash flow from journals…
          </div>
        ) : !cfs ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No data available for this period.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Opening Cash</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(cfs.opening_cash)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Net Change</div>
                <div className={cn('flex items-center gap-1 text-base font-semibold tabular-nums',
                  cfs.net_change >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                  {cfs.net_change >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  ₹ {formatINR(cfs.net_change)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Closing Cash</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(cfs.closing_cash)}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-[11px] uppercase text-muted-foreground">Reconcile Diff</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  Math.abs(cfs.reconciliation_diff) < 1 ? 'text-emerald-600' : 'text-amber-600')}>
                  ₹ {formatINR(cfs.reconciliation_diff)}
                </div>
              </div>
            </div>

            <SectionTable title="A. Cash from Operating Activities" badge={`Net ₹ ${formatINR(cfs.operating.total)}`} section={cfs.operating} />
            <SectionTable title="B. Cash from Investing Activities" badge={`Net ₹ ${formatINR(cfs.investing.total)}`} section={cfs.investing} />
            <SectionTable title="C. Cash from Financing Activities" badge={`Net ₹ ${formatINR(cfs.financing.total)}`} section={cfs.financing} />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default CashFlowStatementComponent;

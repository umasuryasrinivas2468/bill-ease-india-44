import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowDownToLine, ArrowUpFromLine, Clock } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';

// #23 Cash Conversion Cycle Dashboard — invoice date → payment received,
// expense incurred → vendor paid. Tells the founder how long cash is
// trapped in operations.
const CashConversionCycleDashboard: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();

  const dso = useMemo(() => {
    const paid = invoices.filter((i: any) => i.status === 'paid' && i.invoice_date);
    if (paid.length === 0) return 0;
    const days = paid.map((i: any) => {
      const inv = new Date(i.invoice_date);
      const upd = new Date(i.updated_at || i.created_at);
      return Math.max(0, Math.ceil((upd.getTime() - inv.getTime()) / 86400000));
    });
    return days.reduce((a, b) => a + b, 0) / days.length;
  }, [invoices]);

  const dpo = useMemo(() => {
    const posted = expenses.filter((e: any) => e.status === 'posted' && e.expense_date);
    if (posted.length === 0) return 0;
    const days = posted.map((e: any) => {
      const ed = new Date(e.expense_date);
      const upd = new Date(e.updated_at || e.created_at);
      return Math.max(0, Math.ceil((upd.getTime() - ed.getTime()) / 86400000));
    });
    return days.reduce((a, b) => a + b, 0) / days.length;
  }, [expenses]);

  const ccc = dso - dpo;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" /> Cash Conversion Cycle Dashboard
        </CardTitle>
        <CardDescription>
          Invoice → payment received vs Expense → vendor paid. Lower CCC = cash works harder.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowDownToLine className="h-3 w-3" /> Days Sales Outstanding
              </div>
              <div className="text-3xl font-semibold mt-2">{dso.toFixed(1)}d</div>
              <div className="text-xs text-muted-foreground mt-1">Avg time from invoice to payment</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <ArrowUpFromLine className="h-3 w-3" /> Days Payables Outstanding
              </div>
              <div className="text-3xl font-semibold mt-2">{dpo.toFixed(1)}d</div>
              <div className="text-xs text-muted-foreground mt-1">Avg time from expense to vendor paid</div>
            </CardContent>
          </Card>
          <Card className={ccc < 30 ? 'bg-green-50 border-green-200' : ccc < 60 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">Cash Conversion Cycle</div>
              <div className="text-3xl font-semibold mt-2">{ccc.toFixed(1)}d</div>
              <div className="text-xs text-muted-foreground mt-1">DSO − DPO. Lower is better.</div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-3 text-sm text-muted-foreground">
          {ccc > 60 && 'Cash is trapped in operations longer than 2 months. Tighten collections or stretch payables.'}
          {ccc <= 60 && ccc > 30 && 'Healthy cycle, with room to improve.'}
          {ccc <= 30 && ccc > 0 && 'Excellent — cash flows fast.'}
          {ccc <= 0 && 'Negative cycle — you collect from customers before paying vendors. Top tier.'}
        </div>
      </CardContent>
    </Card>
  );
};

export default CashConversionCycleDashboard;

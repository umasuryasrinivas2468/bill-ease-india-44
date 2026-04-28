import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { useGSTLiability } from '@/hooks/useGSTLiability';
import { useInvoices } from '@/hooks/useInvoices';
import { formatINR, shiftMonth, round2 } from '@/lib/gst';

// Return Period Comparison (Feature #24)
// Shows: current month vs prior month vs same month last year, for:
//   - Output GST
//   - ITC
//   - Net payable
//   - Sales volume (invoice count + taxable value)
// With variance % vs the prior period.
const PeriodComparison: React.FC = () => {
  const nowMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const [current, setCurrent] = useState<string>(nowMonth);
  const prior = shiftMonth(current, -1);
  const yoy = shiftMonth(current, -12);

  const cur = useGSTLiability(current);
  const pri = useGSTLiability(prior);
  const yr = useGSTLiability(yoy);

  const { data: invoices = [] } = useInvoices();

  const salesVolume = (period: string) => {
    const rows = invoices.filter((inv) => {
      const m = (inv.invoice_date || '').slice(0, 7);
      return m === period;
    });
    const taxable = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return { count: rows.length, taxable: round2(taxable) };
  };

  const vCur = salesVolume(current);
  const vPrior = salesVolume(prior);
  const vYoy = salesVolume(yoy);

  const pct = (cur: number, base: number) => {
    if (base === 0) return cur === 0 ? 0 : 100;
    return round2(((cur - base) / base) * 100);
  };

  const rows = [
    {
      label: 'Output GST',
      cur: cur.data?.output.total ?? 0,
      pri: pri.data?.output.total ?? 0,
      yr: yr.data?.output.total ?? 0,
    },
    {
      label: 'ITC',
      cur: cur.data?.itc.total ?? 0,
      pri: pri.data?.itc.total ?? 0,
      yr: yr.data?.itc.total ?? 0,
    },
    {
      label: 'Net Cash Payable',
      cur: cur.data?.net_payable.total_cash ?? 0,
      pri: pri.data?.net_payable.total_cash ?? 0,
      yr: yr.data?.net_payable.total_cash ?? 0,
    },
    {
      label: 'Sales (Taxable)',
      cur: vCur.taxable,
      pri: vPrior.taxable,
      yr: vYoy.taxable,
    },
    {
      label: 'Invoice Count',
      cur: vCur.count,
      pri: vPrior.count,
      yr: vYoy.count,
      isCount: true,
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Return Period Comparison
          </CardTitle>
          <CardDescription>
            Month-on-month and year-on-year GST trend
          </CardDescription>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Return Period</Label>
            <Input
              type="month"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Metric</th>
                <th className="text-right py-2">{current}</th>
                <th className="text-right py-2">{prior}</th>
                <th className="text-right py-2">vs prior</th>
                <th className="text-right py-2">{yoy}</th>
                <th className="text-right py-2">vs YoY</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const pctPrior = pct(r.cur, r.pri);
                const pctYoy = pct(r.cur, r.yr);
                return (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-medium">{r.label}</td>
                    <td className="text-right">
                      {r.isCount ? r.cur : formatINR(r.cur)}
                    </td>
                    <td className="text-right text-muted-foreground">
                      {r.isCount ? r.pri : formatINR(r.pri)}
                    </td>
                    <td className="text-right">
                      <Delta pct={pctPrior} />
                    </td>
                    <td className="text-right text-muted-foreground">
                      {r.isCount ? r.yr : formatINR(r.yr)}
                    </td>
                    <td className="text-right">
                      <Delta pct={pctYoy} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Net Cash Payable reflects output − ITC (both heads pooled). For head-wise
          (CGST/SGST/IGST) breakdown see the Liability dashboard.
        </p>
      </CardContent>
    </Card>
  );
};

const Delta: React.FC<{ pct: number }> = ({ pct }) => {
  if (!isFinite(pct)) return <span className="text-muted-foreground">—</span>;
  if (pct === 0) return <span className="text-muted-foreground">0%</span>;
  const up = pct > 0;
  return (
    <span
      className={`inline-flex items-center gap-1 ${
        up ? 'text-emerald-700' : 'text-red-700'
      }`}
    >
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {up ? '+' : ''}
      {pct}%
    </span>
  );
};

export default PeriodComparison;

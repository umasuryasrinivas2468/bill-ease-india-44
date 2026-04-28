import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TrendingUp } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

const DIRECT_CATEGORIES = [
  'Raw Materials','Packing Materials','Purchase of Goods',
  'Direct Labour','Freight & Cartage',
];

// #21 Real Profit Engine — Revenue – direct cost – indirect expenses = real
// profit. Monthly view of last 6 months.
const RealProfitEngine: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();

  const months = useMemo(() => {
    const map = new Map<string, { revenue: number; direct: number; indirect: number }>();
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      map.set(d.toISOString().slice(0, 7), { revenue: 0, direct: 0, indirect: 0 });
    }

    invoices.forEach((inv: any) => {
      const ym = (inv.invoice_date || '').slice(0, 7);
      if (!map.has(ym)) return;
      map.get(ym)!.revenue += Number(inv.amount || (inv.total_amount - inv.gst_amount) || 0);
    });

    expenses.forEach((e: any) => {
      const ym = (e.expense_date || '').slice(0, 7);
      if (!map.has(ym)) return;
      const amt = Number(e.amount || 0);
      const isDirect = DIRECT_CATEGORIES.includes(e.category_name);
      if (isDirect) map.get(ym)!.direct += amt;
      else map.get(ym)!.indirect += amt;
    });

    return Array.from(map.entries()).map(([ym, m]) => ({
      month: ym,
      revenue: m.revenue,
      direct: m.direct,
      indirect: m.indirect,
      profit: m.revenue - m.direct - m.indirect,
      margin: m.revenue > 0 ? ((m.revenue - m.direct - m.indirect) / m.revenue) * 100 : 0,
    }));
  }, [invoices, expenses]);

  const ttm = months.reduce(
    (acc, m) => ({
      revenue: acc.revenue + m.revenue,
      direct: acc.direct + m.direct,
      indirect: acc.indirect + m.indirect,
      profit: acc.profit + m.profit,
    }),
    { revenue: 0, direct: 0, indirect: 0, profit: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Real Profit Engine
        </CardTitle>
        <CardDescription>
          Revenue – direct cost – indirect expenses. Not just sales.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">6-mo revenue</div>
            <div className="text-lg font-semibold">{formatINR(ttm.revenue)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Direct cost</div>
            <div className="text-lg font-semibold">{formatINR(ttm.direct)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Indirect expenses</div>
            <div className="text-lg font-semibold">{formatINR(ttm.indirect)}</div>
          </CardContent></Card>
          <Card className={ttm.profit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">Real profit</div>
              <div className={`text-lg font-semibold ${ttm.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {formatINR(ttm.profit)}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Direct cost</TableHead>
                <TableHead className="text-right">Indirect</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Margin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell>{m.month}</TableCell>
                  <TableCell className="text-right">{formatINR(m.revenue)}</TableCell>
                  <TableCell className="text-right">{formatINR(m.direct)}</TableCell>
                  <TableCell className="text-right">{formatINR(m.indirect)}</TableCell>
                  <TableCell className={`text-right font-semibold ${m.profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatINR(m.profit)}
                  </TableCell>
                  <TableCell className="text-right">{m.margin.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default RealProfitEngine;

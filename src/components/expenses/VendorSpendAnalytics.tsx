import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

// #15 Vendor Spend Analytics — top vendors by spend, vendors trending up,
// and average payment cycle (proxy: time between expense_date and now).
const VendorSpendAnalytics: React.FC = () => {
  const { data: expenses = [] } = useExpenses();

  const rows = useMemo(() => {
    const today = new Date();
    const thirtyAgo = new Date(today); thirtyAgo.setDate(today.getDate() - 30);
    const sixtyAgo = new Date(today); sixtyAgo.setDate(today.getDate() - 60);

    const byVendor = new Map<string, any>();
    expenses.forEach((e: any) => {
      const v = e.vendor_name || 'Unknown';
      const ed = new Date(e.expense_date);
      const row = byVendor.get(v) || {
        vendor: v, total: 0, count: 0,
        last30: 0, prev30: 0, modes: new Set<string>(),
        oldestDate: ed, newestDate: ed,
      };
      row.total += Number(e.total_amount || 0);
      row.count += 1;
      if (ed >= thirtyAgo) row.last30 += Number(e.total_amount || 0);
      else if (ed >= sixtyAgo) row.prev30 += Number(e.total_amount || 0);
      if (ed < row.oldestDate) row.oldestDate = ed;
      if (ed > row.newestDate) row.newestDate = ed;
      row.modes.add(e.payment_mode);
      byVendor.set(v, row);
    });

    return Array.from(byVendor.values())
      .map((r) => ({
        ...r,
        avgBill: r.count > 0 ? r.total / r.count : 0,
        change: r.prev30 > 0 ? ((r.last30 - r.prev30) / r.prev30) * 100 : (r.last30 > 0 ? 100 : 0),
        modesText: Array.from(r.modes).join(', '),
      }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const top10 = rows.slice(0, 10);
  const rising = rows.filter(r => r.prev30 > 0 && r.change > 25).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Vendor Spend Analytics</CardTitle>
        <CardDescription>
          Top vendors by spend, rising costs, and average bill size.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <h3 className="text-sm font-semibold mb-2">Top vendors</h3>
        <div className="border rounded-md overflow-x-auto mb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead className="text-right">Total spend</TableHead>
                <TableHead className="text-right">Bills</TableHead>
                <TableHead className="text-right">Avg bill</TableHead>
                <TableHead className="text-right">Last 30d</TableHead>
                <TableHead className="text-right">Δ vs prev 30d</TableHead>
                <TableHead>Modes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top10.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No vendors yet.</TableCell></TableRow>
              )}
              {top10.map((r, idx) => (
                <TableRow key={r.vendor}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{r.vendor}</TableCell>
                  <TableCell className="text-right">{formatINR(r.total)}</TableCell>
                  <TableCell className="text-right">{r.count}</TableCell>
                  <TableCell className="text-right">{formatINR(r.avgBill)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.last30)}</TableCell>
                  <TableCell className="text-right">
                    {r.prev30 > 0 ? (
                      <span className={r.change > 0 ? 'text-red-600' : 'text-green-600'}>
                        {r.change > 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
                        {' '}{Math.abs(r.change).toFixed(0)}%
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.modesText}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {rising.length > 0 && (
          <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
            <h3 className="text-sm font-semibold mb-2">Rising vendor costs (Δ {'>'}25%)</h3>
            <ul className="text-sm space-y-1">
              {rising.map((r) => (
                <li key={r.vendor}>
                  <Badge variant="secondary" className="mr-2">{r.vendor}</Badge>
                  {formatINR(r.last30)} this month vs {formatINR(r.prev30)} last — <b>+{r.change.toFixed(0)}%</b>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VendorSpendAnalytics;

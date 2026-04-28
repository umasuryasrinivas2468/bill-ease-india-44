import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useExpenses } from '@/hooks/useExpenses';
import { useClients } from '@/hooks/useClients';
import { formatINR } from '@/lib/gst';

// #22 Client Profitability Analyzer — match expenses (linked via client_id
// or project) to revenue per client. Surfaces clients with thin margins
// even when billing is high.
const ClientProfitabilityAnalyzer: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: expenses = [] } = useExpenses();
  const { data: clients = [] } = useClients();

  const rows = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; clientId?: string }>();

    invoices.forEach((i: any) => {
      const k = i.client_name;
      const cur = map.get(k) || { revenue: 0, cost: 0 };
      cur.revenue += Number(i.amount || (i.total_amount - i.gst_amount) || 0);
      const c = clients.find((c: any) => c.name === k);
      if (c) cur.clientId = c.id;
      map.set(k, cur);
    });

    expenses.forEach((e: any) => {
      if (!e.client_id) return;
      const c = clients.find((c: any) => c.id === e.client_id);
      if (!c) return;
      const cur = map.get(c.name) || { revenue: 0, cost: 0, clientId: c.id };
      cur.cost += Number(e.total_amount || 0);
      map.set(c.name, cur);
    });

    return Array.from(map.entries())
      .map(([client, m]) => ({
        client,
        revenue: m.revenue,
        cost: m.cost,
        margin: m.revenue - m.cost,
        marginPct: m.revenue > 0 ? ((m.revenue - m.cost) / m.revenue) * 100 : 0,
      }))
      .filter(r => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [invoices, expenses, clients]);

  const totals = rows.reduce(
    (acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost }),
    { revenue: 0, cost: 0 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" /> Client Profitability Analyzer
        </CardTitle>
        <CardDescription>
          Map expenses (linked by client_id) to revenue. Surfaces clients with thin real margins.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Revenue</div>
            <div className="text-lg font-semibold">{formatINR(totals.revenue)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Attributed cost</div>
            <div className="text-lg font-semibold">{formatINR(totals.cost)}</div>
          </CardContent></Card>
          <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Real margin</div>
            <div className="text-lg font-semibold text-green-700">{formatINR(totals.revenue - totals.cost)}</div>
          </CardContent></Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Attributed cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No invoiced clients yet.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.client}>
                  <TableCell>{r.client}</TableCell>
                  <TableCell className="text-right">{formatINR(r.revenue)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.cost)}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.margin < 0 ? 'text-red-700' : ''}`}>
                    {formatINR(r.margin)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.marginPct < 10 ? 'destructive' : r.marginPct < 25 ? 'secondary' : 'default'}>
                      {r.marginPct.toFixed(1)}%
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Tip: link expenses to a client via the client_id field to attribute servicing cost. Unlinked expenses are treated as overhead.
        </p>
      </CardContent>
    </Card>
  );
};

export default ClientProfitabilityAnalyzer;

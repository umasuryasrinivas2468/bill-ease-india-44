import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Flame } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import { formatINR } from '@/lib/gst';

// #3 Collection Priority Engine — rank unpaid invoices needing immediate
// follow-up. Score = amount_weight + overdue_weight + customer_history_weight.
// Top 10 are the "collect now" list.
const CollectionPriorityEngine: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();

  const scored = useMemo(() => {
    const today = new Date();
    return invoices
      .filter((i: any) => i.status !== 'paid' && Number(i.total_amount || 0) > Number(i.paid_amount || 0))
      .map((i: any) => {
        const balance = Number(i.total_amount || 0) - Number(i.paid_amount || 0);
        const dueDate = i.due_date ? new Date(i.due_date) : null;
        const overdueDays = dueDate ? Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / 86400000)) : 0;
        const client = clients.find((c: any) => c.name === i.client_name);
        const risk = client?.risk_score ?? 50;

        // amount: log-scaled to 0..40
        const amountScore = Math.min(40, Math.log10(Math.max(1, balance)) * 7);
        // overdue: capped at 40 at 60 days
        const overdueScore = Math.min(40, overdueDays * (40 / 60));
        // risk: 0..20
        const riskScore = (risk / 100) * 20;

        const total = amountScore + overdueScore + riskScore;
        return {
          ...i,
          balance,
          overdueDays,
          risk,
          score: Math.round(total),
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [invoices, clients]);

  const top10 = scored.slice(0, 10);
  const totalCollectible = scored.reduce((s, r) => s + r.balance, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-orange-500" /> Collection Priority Engine
        </CardTitle>
        <CardDescription>
          Top 10 invoices to collect now — ranked by amount, overdue days and customer risk.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Open invoices</div>
            <div className="text-lg font-semibold">{scored.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Collectible total</div>
            <div className="text-lg font-semibold">{formatINR(totalCollectible)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Top 10 value</div>
            <div className="text-lg font-semibold text-orange-600">
              {formatINR(top10.reduce((s, r) => s + r.balance, 0))}
            </div>
          </CardContent></Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Overdue</TableHead>
                <TableHead className="text-right">Risk</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {top10.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No collectibles. Nice.</TableCell></TableRow>
              )}
              {top10.map((r, idx) => (
                <TableRow key={r.id}>
                  <TableCell className="font-semibold">{idx + 1}</TableCell>
                  <TableCell className="font-mono text-xs">{r.invoice_number}</TableCell>
                  <TableCell>{r.client_name}</TableCell>
                  <TableCell className="text-right">{formatINR(r.balance)}</TableCell>
                  <TableCell className="text-right">
                    {r.overdueDays > 0
                      ? <Badge variant="destructive">{r.overdueDays}d</Badge>
                      : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-right">{r.risk}</TableCell>
                  <TableCell className="text-right font-semibold text-orange-600">{r.score}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CollectionPriorityEngine;

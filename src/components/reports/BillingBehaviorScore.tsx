import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { formatINR } from '@/lib/gst';

// #10 Customer Billing Behavior Score — average payment delay, dispute
// frequency (proxy: invoices with edit_count > 0), and acceptance speed
// (proxy: time between sent_at → accepted_at). Output is a 0..100 score.
const BillingBehaviorScore: React.FC = () => {
  const { data: invoices = [] } = useInvoices();

  const rows = useMemo(() => {
    const today = new Date();
    const grouped = new Map<string, any[]>();
    invoices.forEach((i: any) => {
      const arr = grouped.get(i.client_name) || [];
      arr.push(i);
      grouped.set(i.client_name, arr);
    });

    return Array.from(grouped.entries()).map(([client, list]) => {
      const billed = list.reduce((s, i: any) => s + Number(i.total_amount || 0), 0);
      const paidInvoices = list.filter((i: any) => i.status === 'paid');

      const delays: number[] = [];
      paidInvoices.forEach((i: any) => {
        if (!i.due_date) return;
        const due = new Date(i.due_date);
        const updated = i.updated_at ? new Date(i.updated_at) : new Date(i.created_at);
        delays.push(Math.max(0, Math.ceil((updated.getTime() - due.getTime()) / 86400000)));
      });
      const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 0;

      const disputes = list.filter((i: any) => (i.edit_count || 0) > 0).length;
      const disputeRate = list.length ? disputes / list.length : 0;

      const accepts: number[] = [];
      list.forEach((i: any) => {
        if (i.sent_at && i.accepted_at) {
          accepts.push((new Date(i.accepted_at).getTime() - new Date(i.sent_at).getTime()) / 86400000);
        }
      });
      const acceptSpeed = accepts.length ? accepts.reduce((a, b) => a + b, 0) / accepts.length : null;

      // Score: 100 = perfect. Subtract penalties.
      let score = 100;
      score -= Math.min(40, avgDelay * 1.5);              // up to -40 for delays
      score -= Math.min(30, disputeRate * 100);           // up to -30 for disputes
      if (acceptSpeed !== null) score -= Math.min(15, Math.max(0, acceptSpeed - 1) * 2);

      return {
        client,
        invoiceCount: list.length,
        billed,
        avgDelay,
        disputeRate,
        acceptSpeed,
        score: Math.max(0, Math.round(score)),
      };
    }).sort((a, b) => b.score - a.score);
  }, [invoices]);

  const grade = (s: number) => s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : s >= 40 ? 'D' : 'E';
  const gradeVariant = (s: number): 'default' | 'secondary' | 'destructive' | 'outline' =>
    s >= 70 ? 'default' : s >= 55 ? 'secondary' : 'destructive';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" /> Customer Billing Behavior Score
        </CardTitle>
        <CardDescription>
          Avg payment delay + dispute frequency + invoice acceptance speed → 0–100 score per customer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Invoices</TableHead>
                <TableHead className="text-right">Billed</TableHead>
                <TableHead className="text-right">Avg delay</TableHead>
                <TableHead className="text-right">Dispute %</TableHead>
                <TableHead className="text-right">Accept speed</TableHead>
                <TableHead className="text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No invoice history yet.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.client}>
                  <TableCell>{r.client}</TableCell>
                  <TableCell className="text-right">{r.invoiceCount}</TableCell>
                  <TableCell className="text-right">{formatINR(r.billed)}</TableCell>
                  <TableCell className="text-right">{r.avgDelay.toFixed(1)}d</TableCell>
                  <TableCell className="text-right">{(r.disputeRate * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right">{r.acceptSpeed !== null ? `${r.acceptSpeed.toFixed(1)}d` : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={gradeVariant(r.score)}>
                      {r.score} · {grade(r.score)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default BillingBehaviorScore;

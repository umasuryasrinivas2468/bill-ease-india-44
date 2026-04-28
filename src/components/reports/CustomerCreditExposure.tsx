import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Gauge } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useClients } from '@/hooks/useClients';
import { formatINR } from '@/lib/gst';

// #8 Customer Credit Exposure Meter — outstanding + open orders + pending
// invoices vs credit_limit. Lets the user stop over-selling to risky
// customers.
const CustomerCreditExposure: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();

  const rows = useMemo(() => {
    return clients.map((c: any) => {
      const clientInvoices = invoices.filter((i: any) => i.client_name === c.name);
      const outstanding = clientInvoices
        .filter((i: any) => i.status !== 'paid')
        .reduce((s: number, i: any) =>
          s + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0);
      const pending = clientInvoices
        .filter((i: any) => i.lifecycle_stage && ['draft','approved','sent'].includes(i.lifecycle_stage))
        .reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const limit = Number(c.credit_limit || 0);
      const exposure = outstanding + pending;
      const usage = limit > 0 ? (exposure / limit) * 100 : 0;
      return {
        id: c.id,
        name: c.name,
        limit,
        outstanding,
        pending,
        exposure,
        usage,
        risk: c.risk_score ?? 50,
      };
    })
    .filter(r => r.limit > 0 || r.exposure > 0)
    .sort((a, b) => b.usage - a.usage);
  }, [invoices, clients]);

  const overlimit = rows.filter(r => r.limit > 0 && r.usage > 100).length;
  const near = rows.filter(r => r.limit > 0 && r.usage >= 80 && r.usage <= 100).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Gauge className="h-5 w-5" /> Customer Credit Exposure Meter
        </CardTitle>
        <CardDescription>
          Outstanding + open orders + pending invoices vs each customer's credit limit.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Customers tracked</div>
            <div className="text-lg font-semibold">{rows.length}</div>
          </CardContent></Card>
          <Card className={near > 0 ? 'bg-amber-50 border-amber-200' : ''}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Near limit (80–100%)</div>
            <div className="text-lg font-semibold text-amber-600">{near}</div>
          </CardContent></Card>
          <Card className={overlimit > 0 ? 'bg-red-50 border-red-200' : ''}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Over limit</div>
            <div className="text-lg font-semibold text-red-600">{overlimit}</div>
          </CardContent></Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Exposure</TableHead>
                <TableHead className="text-right">Limit</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Risk</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No customers with exposure or limits set.</TableCell></TableRow>
              )}
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.name}</TableCell>
                  <TableCell className="text-right">{formatINR(r.outstanding)}</TableCell>
                  <TableCell className="text-right">{formatINR(r.pending)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatINR(r.exposure)}</TableCell>
                  <TableCell className="text-right">{r.limit > 0 ? formatINR(r.limit) : <span className="text-muted-foreground">not set</span>}</TableCell>
                  <TableCell className="min-w-[160px]">
                    {r.limit > 0 ? (
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, r.usage)} className="h-2" />
                        <span className={`text-xs ${r.usage > 100 ? 'text-red-600' : r.usage >= 80 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {r.usage.toFixed(0)}%
                        </span>
                      </div>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.risk >= 70 ? 'destructive' : r.risk >= 40 ? 'secondary' : 'outline'}>
                      {r.risk}
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

export default CustomerCreditExposure;

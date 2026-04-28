import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Siren } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

interface FraudSignal {
  type: 'round_number' | 'weekend' | 'reused_bill' | 'split_bills';
  severity: 'low' | 'medium' | 'high';
  detail: string;
  amount: number;
  refs: string[];
}

// #20 Expense Fraud Signals — round-number abuse, weekend unusual spend,
// same bill reused, same vendor split bills (just under approval thresholds).
const THRESHOLDS = [5000, 50000];

const ExpenseFraudSignals: React.FC = () => {
  const { data: expenses = [] } = useExpenses();

  const signals = useMemo<FraudSignal[]>(() => {
    const out: FraudSignal[] = [];

    // Round-number abuse: amount % 1000 == 0 AND amount >= 5000
    expenses.forEach((e: any) => {
      const amt = Number(e.total_amount || 0);
      if (amt >= 5000 && amt % 1000 === 0) {
        out.push({
          type: 'round_number',
          severity: amt >= 50000 ? 'medium' : 'low',
          detail: `Suspiciously round amount ${formatINR(amt)} on ${e.expense_number} (${e.vendor_name})`,
          amount: amt,
          refs: [e.expense_number],
        });
      }
    });

    // Weekend unusual spend: payment on Sat/Sun
    expenses.forEach((e: any) => {
      const day = new Date(e.expense_date).getDay();
      if ((day === 0 || day === 6) && Number(e.total_amount || 0) >= 10000) {
        out.push({
          type: 'weekend',
          severity: 'low',
          detail: `Weekend spend on ${e.expense_date} — ${e.vendor_name} ${formatINR(e.total_amount)}`,
          amount: Number(e.total_amount || 0),
          refs: [e.expense_number],
        });
      }
    });

    // Reused bill numbers
    const billMap = new Map<string, any[]>();
    expenses.forEach((e: any) => {
      if (!e.bill_number) return;
      const k = `${e.vendor_name}|${e.bill_number}`;
      const arr = billMap.get(k) || [];
      arr.push(e);
      billMap.set(k, arr);
    });
    billMap.forEach((arr, k) => {
      if (arr.length > 1) {
        out.push({
          type: 'reused_bill',
          severity: 'high',
          detail: `Bill #${arr[0].bill_number} from ${arr[0].vendor_name} used on ${arr.length} expenses`,
          amount: arr.reduce((s, e: any) => s + Number(e.total_amount || 0), 0),
          refs: arr.map((e: any) => e.expense_number),
        });
      }
    });

    // Split bills: same vendor + same date, multiple amounts each just below a threshold
    const dateVendor = new Map<string, any[]>();
    expenses.forEach((e: any) => {
      const k = `${e.vendor_name}|${e.expense_date}`;
      const arr = dateVendor.get(k) || [];
      arr.push(e);
      dateVendor.set(k, arr);
    });
    dateVendor.forEach((arr) => {
      if (arr.length < 2) return;
      THRESHOLDS.forEach((t) => {
        const justUnder = arr.filter((e: any) => {
          const a = Number(e.total_amount || 0);
          return a >= t * 0.7 && a < t;
        });
        if (justUnder.length >= 2) {
          out.push({
            type: 'split_bills',
            severity: 'high',
            detail: `${justUnder.length} bills from ${justUnder[0].vendor_name} on ${justUnder[0].expense_date}, each just under ${formatINR(t)}`,
            amount: justUnder.reduce((s, e: any) => s + Number(e.total_amount || 0), 0),
            refs: justUnder.map((e: any) => e.expense_number),
          });
        }
      });
    });

    return out;
  }, [expenses]);

  const labels: Record<string, string> = {
    round_number: 'Round-number abuse',
    weekend: 'Weekend spend',
    reused_bill: 'Same bill reused',
    split_bills: 'Same vendor split bills',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Siren className="h-5 w-5 text-red-500" /> Expense Fraud Signals
        </CardTitle>
        <CardDescription>
          Round-number abuse, weekend spend, reused bill numbers, split bills under approval thresholds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signals.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No fraud signals detected.</div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Refs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signals.map((s, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant={s.severity === 'high' ? 'destructive' : s.severity === 'medium' ? 'secondary' : 'outline'}>
                        {s.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>{labels[s.type]}</TableCell>
                    <TableCell className="text-xs">{s.detail}</TableCell>
                    <TableCell className="text-right">{formatINR(s.amount)}</TableCell>
                    <TableCell className="text-xs font-mono">{s.refs.slice(0, 3).join(', ')}{s.refs.length > 3 ? '…' : ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExpenseFraudSignals;

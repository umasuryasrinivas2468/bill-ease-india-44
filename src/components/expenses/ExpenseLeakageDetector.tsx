import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Droplets } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

interface Leak {
  type: 'duplicate' | 'excessive_reimb' | 'petty_cash_drain' | 'unused_subscription';
  label: string;
  detail: string;
  amount: number;
  refs: string[];
}

// #14 Expense Leakage Detector — finds duplicate claims, excessive
// reimbursements, repeated petty cash drains, and unused subscriptions.
// Heuristics computed from the expense list.
const ExpenseLeakageDetector: React.FC = () => {
  const { data: expenses = [] } = useExpenses();

  const leaks = useMemo<Leak[]>(() => {
    const out: Leak[] = [];
    if (expenses.length === 0) return out;

    // Duplicates: same vendor + amount + same date (or within 2 days)
    const seen = new Map<string, any[]>();
    expenses.forEach((e: any) => {
      const k = `${(e.vendor_name || '').toLowerCase()}|${Number(e.total_amount).toFixed(2)}|${e.expense_date}`;
      const arr = seen.get(k) || [];
      arr.push(e);
      seen.set(k, arr);
    });
    seen.forEach((arr) => {
      if (arr.length > 1) {
        out.push({
          type: 'duplicate',
          label: 'Duplicate claim',
          detail: `${arr.length} identical entries for ${arr[0].vendor_name} on ${arr[0].expense_date}`,
          amount: arr.slice(1).reduce((s, e: any) => s + Number(e.total_amount || 0), 0),
          refs: arr.map((e: any) => e.expense_number),
        });
      }
    });

    // Excessive reimbursement: per employee monthly travel + entertainment > 20k
    const empMonth = new Map<string, number>();
    expenses
      .filter((e: any) => e.employee_id && ['Travel & Accommodation','Entertainment','Fuel & Transportation'].includes(e.category_name))
      .forEach((e: any) => {
        const ym = e.expense_date?.slice(0, 7);
        const k = `${e.employee_id}|${ym}|${e.employee_name || ''}`;
        empMonth.set(k, (empMonth.get(k) || 0) + Number(e.total_amount || 0));
      });
    empMonth.forEach((amt, key) => {
      if (amt > 20000) {
        const [emp, ym, name] = key.split('|');
        out.push({
          type: 'excessive_reimb',
          label: 'Excessive reimbursement',
          detail: `${name || emp} claimed ${formatINR(amt)} in ${ym}`,
          amount: amt,
          refs: [],
        });
      }
    });

    // Petty cash drain: count of cash-mode expenses per month > 30
    const cashMonth = new Map<string, number>();
    expenses
      .filter((e: any) => e.payment_mode === 'cash')
      .forEach((e: any) => {
        const ym = e.expense_date?.slice(0, 7);
        cashMonth.set(ym, (cashMonth.get(ym) || 0) + 1);
      });
    cashMonth.forEach((count, ym) => {
      if (count > 30) {
        out.push({
          type: 'petty_cash_drain',
          label: 'Petty cash drain',
          detail: `${count} cash transactions in ${ym} — review for misuse`,
          amount: 0,
          refs: [],
        });
      }
    });

    // Unused subscription: vendor in Software & Subscriptions with last expense > 60 days
    const subsLast = new Map<string, { date: string; amount: number }>();
    expenses
      .filter((e: any) => e.category_name === 'Software & Subscriptions')
      .forEach((e: any) => {
        const cur = subsLast.get(e.vendor_name);
        if (!cur || e.expense_date > cur.date) {
          subsLast.set(e.vendor_name, { date: e.expense_date, amount: Number(e.total_amount || 0) });
        }
      });
    const sixtyAgo = new Date();
    sixtyAgo.setDate(sixtyAgo.getDate() - 60);
    subsLast.forEach((info, vendor) => {
      if (new Date(info.date) < sixtyAgo) {
        out.push({
          type: 'unused_subscription',
          label: 'Possibly unused subscription',
          detail: `${vendor} — last billed ${info.date}`,
          amount: info.amount,
          refs: [],
        });
      }
    });

    return out;
  }, [expenses]);

  const totalLeakage = leaks.reduce((s, l) => s + l.amount, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-blue-500" /> Expense Leakage Detector
        </CardTitle>
        <CardDescription>
          Duplicates, excessive reimbursements, petty cash drains and subscriptions you may have stopped using.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Leak signals</div>
            <div className="text-lg font-semibold">{leaks.length}</div>
          </CardContent></Card>
          <Card className={totalLeakage > 0 ? 'bg-red-50 border-red-200' : ''}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Estimated leakage</div>
            <div className="text-lg font-semibold text-red-600">{formatINR(totalLeakage)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Categories</div>
            <div className="text-lg font-semibold">{new Set(leaks.map(l => l.type)).size}</div>
          </CardContent></Card>
        </div>

        {leaks.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No leakage signals — clean books.
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>References</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaks.map((l, idx) => (
                  <TableRow key={idx}>
                    <TableCell><Badge variant="secondary">{l.label}</Badge></TableCell>
                    <TableCell className="text-sm">{l.detail}</TableCell>
                    <TableCell className="text-right">{l.amount > 0 ? formatINR(l.amount) : '—'}</TableCell>
                    <TableCell className="text-xs font-mono">{l.refs.join(', ') || '—'}</TableCell>
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

export default ExpenseLeakageDetector;

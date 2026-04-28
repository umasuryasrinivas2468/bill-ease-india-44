import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Wallet } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

// #17 Employee Expense Wallet — travel, fuel, out-of-pocket spends per
// employee, with a total wallet balance roll-up (claims minus what's
// been posted/reimbursed).
const TRAVEL_CATEGORIES = ['Travel & Accommodation','Fuel & Transportation'];
const REIMB_CATEGORIES = ['Staff Welfare','Entertainment','Office Supplies','Communication','Miscellaneous'];

const EmployeeExpenseWallet: React.FC = () => {
  const { data: expenses = [] } = useExpenses();

  const wallets = useMemo(() => {
    const byEmp = new Map<string, any>();
    expenses
      .filter((e: any) => e.employee_id || e.employee_name)
      .forEach((e: any) => {
        const k = e.employee_id || e.employee_name;
        const w = byEmp.get(k) || {
          employee: e.employee_name || e.employee_id,
          travel: 0, fuel: 0, reimb: 0, total: 0,
          pending: 0, posted: 0, count: 0,
        };
        const amt = Number(e.total_amount || 0);
        w.total += amt;
        w.count += 1;
        if (e.category_name === 'Travel & Accommodation') w.travel += amt;
        else if (e.category_name === 'Fuel & Transportation') w.fuel += amt;
        else if (REIMB_CATEGORIES.includes(e.category_name)) w.reimb += amt;
        if (e.status === 'pending') w.pending += amt;
        if (e.status === 'posted' || e.status === 'approved') w.posted += amt;
        byEmp.set(k, w);
      });
    return Array.from(byEmp.values()).sort((a, b) => b.total - a.total);
  }, [expenses]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" /> Employee Expense Wallet
        </CardTitle>
        <CardDescription>
          Travel claims, fuel reimbursements and out-of-pocket spends — per employee.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Travel</TableHead>
                <TableHead className="text-right">Fuel</TableHead>
                <TableHead className="text-right">Other reimb</TableHead>
                <TableHead className="text-right">Total claims</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Posted</TableHead>
                <TableHead className="text-right">Wallet balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">No employee-tagged expenses yet. Add employee_id when recording reimbursements.</TableCell></TableRow>
              )}
              {wallets.map((w: any) => {
                const balance = w.total - w.posted;
                return (
                  <TableRow key={w.employee}>
                    <TableCell>{w.employee}</TableCell>
                    <TableCell className="text-right">{formatINR(w.travel)}</TableCell>
                    <TableCell className="text-right">{formatINR(w.fuel)}</TableCell>
                    <TableCell className="text-right">{formatINR(w.reimb)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatINR(w.total)}</TableCell>
                    <TableCell className="text-right">
                      {w.pending > 0 ? <Badge variant="secondary">{formatINR(w.pending)}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-right">{formatINR(w.posted)}</TableCell>
                    <TableCell className={`text-right font-semibold ${balance > 0 ? 'text-amber-600' : ''}`}>
                      {formatINR(balance)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmployeeExpenseWallet;

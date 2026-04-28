import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Receipt, AlertTriangle } from 'lucide-react';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

// #16 GST Input Credit Layer — eligible ITC, blocked credit, pending 2B
// mismatch (deferred — surfaced from existing ITCMismatchCenter), missed
// claims (expense > 30 days old, ITC eligible, but no claim yet).
const GSTInputCreditLayer: React.FC = () => {
  const { data: expenses = [] } = useExpenses();

  const stats = useMemo(() => {
    const today = new Date();
    const thirtyAgo = new Date(today); thirtyAgo.setDate(today.getDate() - 30);

    let eligibleITC = 0;
    let blockedITC = 0;
    let missedClaims = 0;
    const blockedCategories = ['Entertainment','Staff Welfare','Donations','CSR Expenses'];
    const missedRows: any[] = [];
    const blockedRows: any[] = [];
    const eligibleRows: any[] = [];

    expenses.forEach((e: any) => {
      const tax = Number(e.gst_amount || e.tax_amount || 0);
      if (tax === 0) return;
      const isBlocked = blockedCategories.includes(e.category_name);
      if (isBlocked) {
        blockedITC += tax;
        blockedRows.push(e);
      } else if (e.itc_eligible !== false) {
        eligibleITC += tax;
        eligibleRows.push(e);
        if (new Date(e.expense_date) < thirtyAgo && e.status !== 'posted') {
          missedClaims += tax;
          missedRows.push(e);
        }
      }
    });

    return { eligibleITC, blockedITC, missedClaims, missedRows, blockedRows, eligibleRows };
  }, [expenses]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" /> GST Input Credit Layer
        </CardTitle>
        <CardDescription>
          Eligible ITC, blocked credit, missed claims. (2B mismatch lives in the dedicated ITC Mismatch Center.)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <Card className="bg-green-50 border-green-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Eligible ITC</div>
            <div className="text-xl font-semibold text-green-700">{formatINR(stats.eligibleITC)}</div>
            <div className="text-xs text-muted-foreground">{stats.eligibleRows.length} bills</div>
          </CardContent></Card>
          <Card className="bg-red-50 border-red-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Blocked credit (Sec 17(5))</div>
            <div className="text-xl font-semibold text-red-700">{formatINR(stats.blockedITC)}</div>
            <div className="text-xs text-muted-foreground">{stats.blockedRows.length} bills</div>
          </CardContent></Card>
          <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Missed claims ({'>'}30d, unposted)
            </div>
            <div className="text-xl font-semibold text-amber-700">{formatINR(stats.missedClaims)}</div>
            <div className="text-xs text-muted-foreground">{stats.missedRows.length} bills</div>
          </CardContent></Card>
        </div>

        {stats.missedRows.length > 0 && (
          <>
            <h3 className="text-sm font-semibold mb-2">Bills with missed ITC claims</h3>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Expense</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">GST</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.missedRows.slice(0, 20).map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.expense_number}</TableCell>
                      <TableCell>{e.expense_date}</TableCell>
                      <TableCell>{e.vendor_name}</TableCell>
                      <TableCell>{e.category_name}</TableCell>
                      <TableCell><Badge variant="secondary">{e.status}</Badge></TableCell>
                      <TableCell className="text-right">{formatINR(e.gst_amount || e.tax_amount || 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default GSTInputCreditLayer;

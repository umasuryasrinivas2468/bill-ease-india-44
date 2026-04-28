import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExpenses } from '@/hooks/useExpenses';
import { formatINR } from '@/lib/gst';

// #11 Central Expense Intelligence Register — master view of every expense
// with all the dimensions the brief asked for: vendor / category / dept /
// employee / GST / ITC eligibility / payment mode / approval / cost center
// / branch.
const ExpenseIntelligenceRegister: React.FC = () => {
  const { data: expenses = [], isLoading } = useExpenses();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [department, setDepartment] = useState<string>('all');
  const [branch, setBranch] = useState<string>('all');
  const [costCenter, setCostCenter] = useState<string>('all');
  const [itcOnly, setItcOnly] = useState(false);

  const departments = useMemo(() =>
    Array.from(new Set(expenses.map((e: any) => e.department).filter(Boolean))) as string[],
    [expenses]);
  const branches = useMemo(() =>
    Array.from(new Set(expenses.map((e: any) => e.branch).filter(Boolean))) as string[],
    [expenses]);
  const costCenters = useMemo(() =>
    Array.from(new Set(expenses.map((e: any) => e.cost_center).filter(Boolean))) as string[],
    [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(e.expense_number?.toLowerCase().includes(s)
              || e.vendor_name?.toLowerCase().includes(s)
              || e.description?.toLowerCase().includes(s))) return false;
      }
      if (status !== 'all' && e.status !== status) return false;
      if (department !== 'all' && e.department !== department) return false;
      if (branch !== 'all' && e.branch !== branch) return false;
      if (costCenter !== 'all' && e.cost_center !== costCenter) return false;
      if (itcOnly && !e.itc_eligible) return false;
      return true;
    });
  }, [expenses, search, status, department, branch, costCenter, itcOnly]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc: any, e: any) => {
        acc.amount += Number(e.amount || 0);
        acc.tax += Number(e.tax_amount || e.gst_amount || 0);
        acc.total += Number(e.total_amount || 0);
        if (e.itc_eligible) acc.itc += Number(e.tax_amount || e.gst_amount || 0);
        return acc;
      },
      { amount: 0, tax: 0, total: 0, itc: 0 },
    );
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      'Expense ID','Date','Vendor','Category','Department','Employee',
      'Amount','GST','ITC Eligible','Payment Mode','Approval Status',
      'Cost Center','Branch','Total',
    ];
    const rows = filtered.map((e: any) => [
      e.expense_number, e.expense_date, e.vendor_name, e.category_name,
      e.department || '', e.employee_name || '',
      e.amount, e.tax_amount || e.gst_amount || 0,
      e.itc_eligible ? 'yes' : 'no',
      e.payment_mode, e.status, e.cost_center || '',
      e.branch || '', e.total_amount,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expense_register_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" /> Central Expense Intelligence Register
            </CardTitle>
            <CardDescription>
              Every expense — across vendors, departments, employees, branches.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <div className="md:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Expense / Vendor / Description"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Approval</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Cost center</Label>
            <Select value={costCenter} onValueChange={setCostCenter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {costCenters.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={itcOnly}
                onChange={(e) => setItcOnly(e.target.checked)}
              />
              ITC eligible only
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Expenses</div>
            <div className="text-lg font-semibold">{filtered.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Net amount</div>
            <div className="text-lg font-semibold">{formatINR(totals.amount)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">GST paid</div>
            <div className="text-lg font-semibold">{formatINR(totals.tax)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Eligible ITC</div>
            <div className="text-lg font-semibold text-green-600">{formatINR(totals.itc)}</div>
          </CardContent></Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead>ITC</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Approval</TableHead>
                <TableHead>Cost Center</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={13} className="text-center py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={13} className="text-center py-6 text-muted-foreground">No expenses match filters.</TableCell></TableRow>
              )}
              {filtered.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.expense_number}</TableCell>
                  <TableCell>{e.expense_date}</TableCell>
                  <TableCell>{e.vendor_name}</TableCell>
                  <TableCell>{e.category_name}</TableCell>
                  <TableCell>{e.department || '—'}</TableCell>
                  <TableCell>{e.employee_name || '—'}</TableCell>
                  <TableCell className="text-right">{formatINR(e.tax_amount || e.gst_amount || 0)}</TableCell>
                  <TableCell>
                    {e.itc_eligible
                      ? <Badge variant="default">Yes</Badge>
                      : <Badge variant="outline">No</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline">{e.payment_mode}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={
                      e.status === 'approved' || e.status === 'posted' ? 'default' :
                      e.status === 'rejected' ? 'destructive' : 'secondary'
                    }>{e.status}</Badge>
                  </TableCell>
                  <TableCell>{e.cost_center || '—'}</TableCell>
                  <TableCell>{e.branch || '—'}</TableCell>
                  <TableCell className="text-right">{formatINR(e.total_amount || 0)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExpenseIntelligenceRegister;

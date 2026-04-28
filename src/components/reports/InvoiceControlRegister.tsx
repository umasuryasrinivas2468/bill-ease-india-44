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
import { useInvoices } from '@/hooks/useInvoices';
import { formatINR } from '@/lib/gst';

type PaidFilter = 'all' | 'paid' | 'unpaid' | 'overdue';
type PeriodFilter = 'all' | 'month' | 'quarter' | 'fy';

// #1 Central Invoice Control Register — single master view of every sales
// invoice across branches, users, clients with the deep filters the brief
// asked for: paid/unpaid/overdue, branch-wise, user-wise, GST type,
// high-value, period.
const InvoiceControlRegister: React.FC = () => {
  const { data: invoices = [], isLoading } = useInvoices();

  const [search, setSearch] = useState('');
  const [paid, setPaid] = useState<PaidFilter>('all');
  const [branch, setBranch] = useState<string>('all');
  const [creator, setCreator] = useState<string>('all');
  const [gstType, setGstType] = useState<string>('all');
  const [highValueOnly, setHighValueOnly] = useState(false);
  const [period, setPeriod] = useState<PeriodFilter>('all');

  const branches = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i: any) => i.branch && set.add(i.branch));
    return Array.from(set);
  }, [invoices]);

  const creators = useMemo(() => {
    const set = new Set<string>();
    invoices.forEach((i: any) => i.created_by_name && set.add(i.created_by_name));
    return Array.from(set);
  }, [invoices]);

  const filtered = useMemo(() => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
    const fyStart = today.getMonth() < 3
      ? new Date(today.getFullYear() - 1, 3, 1)
      : new Date(today.getFullYear(), 3, 1);

    return invoices.filter((i: any) => {
      if (search) {
        const s = search.toLowerCase();
        if (!(i.invoice_number?.toLowerCase().includes(s)
              || i.client_name?.toLowerCase().includes(s)
              || i.client_gst_number?.toLowerCase().includes(s))) return false;
      }
      if (paid !== 'all') {
        if (paid === 'paid' && i.status !== 'paid') return false;
        if (paid === 'unpaid' && (i.status === 'paid')) return false;
        if (paid === 'overdue' && i.status !== 'overdue') return false;
      }
      if (branch !== 'all' && i.branch !== branch) return false;
      if (creator !== 'all' && i.created_by_name !== creator) return false;
      if (gstType !== 'all') {
        const isIntra = i.intra_state === true;
        if (gstType === 'intra' && !isIntra) return false;
        if (gstType === 'inter' && isIntra) return false;
        if (gstType === 'igst' && (Number(i.igst_amount) || 0) <= 0) return false;
      }
      if (highValueOnly && Number(i.total_amount || 0) < 100000) return false;
      if (period !== 'all' && i.invoice_date) {
        const d = new Date(i.invoice_date);
        const start = period === 'month' ? monthStart
                    : period === 'quarter' ? quarterStart : fyStart;
        if (d < start) return false;
      }
      return true;
    });
  }, [invoices, search, paid, branch, creator, gstType, highValueOnly, period]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc: any, i: any) => {
        acc.taxable += Number(i.taxable_value || i.amount || 0);
        acc.gst += Number(i.gst_amount || 0);
        acc.total += Number(i.total_amount || 0);
        acc.balance += Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0));
        return acc;
      },
      { taxable: 0, gst: 0, total: 0, balance: 0 },
    );
  }, [filtered]);

  const exportCsv = () => {
    const header = [
      'Invoice No','Customer','GSTIN','Invoice Date','Due Date','Currency',
      'Taxable','CGST','SGST','IGST','Total','Balance','Payment Terms',
      'Branch','Created By','Last Updated By','Lifecycle','Status',
    ];
    const rows = filtered.map((i: any) => [
      i.invoice_number, i.client_name, i.client_gst_number || '',
      i.invoice_date, i.due_date, i.currency || 'INR',
      i.taxable_value || i.amount, i.cgst_amount || 0, i.sgst_amount || 0,
      i.igst_amount || 0, i.total_amount,
      Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)),
      i.payment_terms_days ?? '', i.branch || '',
      i.created_by_name || '', i.last_updated_by || '',
      i.lifecycle_stage || '', i.status,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `invoice_register_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" /> Central Invoice Control Register
            </CardTitle>
            <CardDescription>
              Every sales invoice across branches, users, clients — with deep filters.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
          <div className="md:col-span-2">
            <Label className="text-xs">Search</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Invoice / Customer / GSTIN"
                className="pl-8"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Paid status</Label>
            <Select value={paid} onValueChange={(v) => setPaid(v as PaidFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Created by</Label>
            <Select value={creator} onValueChange={setCreator}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All users</SelectItem>
                {creators.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">GST type</Label>
            <Select value={gstType} onValueChange={setGstType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="intra">Intra-state (CGST+SGST)</SelectItem>
                <SelectItem value="inter">Inter-state</SelectItem>
                <SelectItem value="igst">IGST only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="quarter">This quarter</SelectItem>
                <SelectItem value="fy">This FY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={highValueOnly}
                onChange={(e) => setHighValueOnly(e.target.checked)}
              />
              High value (≥ ₹1L)
            </label>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Invoices</div>
            <div className="text-lg font-semibold">{filtered.length}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Taxable</div>
            <div className="text-lg font-semibold">{formatINR(totals.taxable)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total</div>
            <div className="text-lg font-semibold">{formatINR(totals.total)}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Balance Due</div>
            <div className="text-lg font-semibold text-red-600">{formatINR(totals.balance)}</div>
          </CardContent></Card>
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>GSTIN</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Cur</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead>Terms</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>By</TableHead>
                <TableHead>Updated By</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={15} className="text-center py-6">Loading…</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={15} className="text-center py-6 text-muted-foreground">No invoices match filters.</TableCell></TableRow>
              )}
              {filtered.map((i: any) => {
                const balance = Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0));
                const gst = Number(i.gst_amount || (i.cgst_amount || 0) + (i.sgst_amount || 0) + (i.igst_amount || 0));
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                    <TableCell>{i.client_name}</TableCell>
                    <TableCell className="font-mono text-xs">{i.client_gst_number || '—'}</TableCell>
                    <TableCell>{i.invoice_date}</TableCell>
                    <TableCell>{i.due_date}</TableCell>
                    <TableCell>{i.currency || 'INR'}</TableCell>
                    <TableCell className="text-right">{formatINR(i.taxable_value || i.amount || 0)}</TableCell>
                    <TableCell className="text-right">{formatINR(gst)}</TableCell>
                    <TableCell className="text-right">{formatINR(i.total_amount || 0)}</TableCell>
                    <TableCell className="text-right">{balance > 0 ? <span className="text-red-600">{formatINR(balance)}</span> : '—'}</TableCell>
                    <TableCell>{i.payment_terms_days ? `${i.payment_terms_days}d` : '—'}</TableCell>
                    <TableCell>{i.branch || '—'}</TableCell>
                    <TableCell className="text-xs">{i.created_by_name || '—'}</TableCell>
                    <TableCell className="text-xs">{i.last_updated_by || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={
                        i.status === 'paid' ? 'default' :
                        i.status === 'overdue' ? 'destructive' :
                        i.status === 'partial' ? 'secondary' : 'outline'
                      }>{i.status}</Badge>
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

export default InvoiceControlRegister;

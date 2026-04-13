
import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus, Search, Filter, CreditCard, IndianRupee, ArrowRightLeft,
  FileText, CheckCircle2, Clock, AlertCircle, Banknote, Paperclip,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useVendors } from '@/hooks/useVendors';
import { usePurchaseBills, PurchaseBill } from '@/hooks/usePurchaseBills';
import { useVendorBillPayments, useRecordBillPayment, useAdjustAdvance } from '@/hooks/useVendorBillPayments';
import { useVendorAdvances } from '@/hooks/useVendorAdvances';
import { PAYMENT_MODES } from '@/types/vendorPayments';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

const billStatusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  paid: { label: 'Paid', variant: 'default', icon: CheckCircle2 },
  partially_paid: { label: 'Partial', variant: 'secondary', icon: Clock },
  pending: { label: 'Pending', variant: 'outline', icon: AlertCircle },
  overdue: { label: 'Overdue', variant: 'destructive', icon: AlertCircle },
};

export default function VendorBillPayments() {
  const [showPay, setShowPay] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedBill, setSelectedBill] = useState<PurchaseBill | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [tab, setTab] = useState('bills');

  // Pay form
  const [payDate, setPayDate] = useState<Date>(new Date());
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState('bank');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');

  // Adjust form
  const [adjustAdvanceId, setAdjustAdvanceId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDate, setAdjustDate] = useState<Date>(new Date());
  const [adjustNotes, setAdjustNotes] = useState('');

  const { data: bills = [], isLoading } = usePurchaseBills();
  const { data: payments = [] } = useVendorBillPayments();
  const { data: advances = [] } = useVendorAdvances();
  const recordPayment = useRecordBillPayment();
  const adjustAdvance = useAdjustAdvance();

  // Filtered bills
  const filteredBills = useMemo(() => {
    let result = bills;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(b =>
        b.vendor_name.toLowerCase().includes(q) ||
        b.bill_number.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') result = result.filter(b => b.status === filterStatus);
    return result;
  }, [bills, search, filterStatus]);

  // Summary
  const summary = useMemo(() => {
    const total = bills.reduce((s, b) => s + b.total_amount, 0);
    const paid = bills.reduce((s, b) => s + (b.paid_amount || 0), 0);
    const pending = total - paid;
    const overdueCount = bills.filter(b => b.status === 'overdue').length;
    return { total, paid, pending, overdueCount, billCount: bills.length };
  }, [bills]);

  // Available advances for selected bill's vendor
  const vendorAdvances = useMemo(() => {
    if (!selectedBill) return [];
    return advances.filter(
      a => a.vendor_id === selectedBill.vendor_id && a.status !== 'fully_adjusted' && a.unadjusted_amount > 0
    );
  }, [advances, selectedBill]);

  const billRemaining = (bill: PurchaseBill) => bill.total_amount - (bill.paid_amount || 0);
  const billProgress = (bill: PurchaseBill) => bill.total_amount > 0 ? ((bill.paid_amount || 0) / bill.total_amount) * 100 : 0;

  const openPay = (bill: PurchaseBill) => {
    setSelectedBill(bill);
    setPayAmount(String(billRemaining(bill)));
    setShowPay(true);
  };

  const openAdjust = (bill: PurchaseBill) => {
    setSelectedBill(bill);
    setAdjustAmount(String(billRemaining(bill)));
    setShowAdjust(true);
  };

  const handlePay = () => {
    if (!selectedBill || !payAmount || Number(payAmount) <= 0) return;
    recordPayment.mutate(
      {
        bill_id: selectedBill.id,
        bill_number: selectedBill.bill_number,
        vendor_id: selectedBill.vendor_id || '',
        vendor_name: selectedBill.vendor_name,
        payment_date: format(payDate, 'yyyy-MM-dd'),
        amount: Number(payAmount),
        payment_mode: payMode,
        reference_number: payReference || undefined,
        notes: payNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowPay(false);
          setSelectedBill(null);
          resetPayForm();
        },
      }
    );
  };

  const handleAdjust = () => {
    if (!selectedBill || !adjustAdvanceId || !adjustAmount || Number(adjustAmount) <= 0) return;
    const adv = advances.find(a => a.id === adjustAdvanceId);
    if (!adv) return;

    adjustAdvance.mutate(
      {
        advance_id: adjustAdvanceId,
        advance_number: adv.advance_number,
        bill_id: selectedBill.id,
        bill_number: selectedBill.bill_number,
        vendor_id: selectedBill.vendor_id || '',
        vendor_name: selectedBill.vendor_name,
        adjustment_date: format(adjustDate, 'yyyy-MM-dd'),
        amount: Number(adjustAmount),
        notes: adjustNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowAdjust(false);
          setSelectedBill(null);
          resetAdjustForm();
        },
      }
    );
  };

  const resetPayForm = () => {
    setPayDate(new Date());
    setPayAmount('');
    setPayMode('bank');
    setPayReference('');
    setPayNotes('');
  };

  const resetAdjustForm = () => {
    setAdjustAdvanceId('');
    setAdjustAmount('');
    setAdjustDate(new Date());
    setAdjustNotes('');
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bill Payments</h1>
          <p className="text-sm text-muted-foreground">Pay vendor bills & adjust advances</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
              <FileText className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Billed</p>
              <p className="text-xl font-bold">{fmt(summary.total)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Paid</p>
              <p className="text-xl font-bold">{fmt(summary.paid)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Outstanding</p>
              <p className="text-xl font-bold">{fmt(summary.pending)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-500/10">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue Bills</p>
              <p className="text-xl font-bold">{summary.overdueCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="payments">Payment History</TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, bill #..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Bills Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Bill Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="min-w-[120px]">Progress</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : filteredBills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        No bills found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBills.map(bill => {
                      const remaining = billRemaining(bill);
                      const progress = billProgress(bill);
                      const cfg = billStatusConfig[bill.status] || billStatusConfig.pending;
                      const StatusIcon = cfg.icon;
                      const isPaid = bill.status === 'paid';
                      return (
                        <TableRow key={bill.id}>
                          <TableCell className="font-medium">{bill.bill_number}</TableCell>
                          <TableCell>{bill.vendor_name}</TableCell>
                          <TableCell>{format(new Date(bill.bill_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{format(new Date(bill.due_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(bill.total_amount)}</TableCell>
                          <TableCell className="text-right text-green-600">{fmt(bill.paid_amount || 0)}</TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <Progress value={progress} className="h-2" />
                              <p className="text-[10px] text-muted-foreground text-right">{Math.round(progress)}%</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" /> {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {!isPaid && (
                              <div className="flex items-center justify-end gap-1.5">
                                <Button size="sm" className="gap-1" onClick={() => openPay(bill)}>
                                  <CreditCard className="h-3.5 w-3.5" /> Pay
                                </Button>
                                {vendorAdvances.length > 0 || true ? (
                                  <Button size="sm" variant="outline" className="gap-1" onClick={() => openAdjust(bill)}>
                                    <ArrowRightLeft className="h-3.5 w-3.5" /> Adjust
                                  </Button>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No payments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    payments.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>{format(new Date(p.payment_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-medium">{p.bill_number}</TableCell>
                        <TableCell>{p.vendor_name}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(p.amount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{p.payment_mode}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={p.payment_type === 'advance_adjustment' ? 'secondary' : 'default'}>
                            {p.payment_type === 'advance_adjustment' ? 'Advance Adj.' : 'Direct'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{p.reference_number || p.advance_number || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Direct Payment Dialog */}
      <Dialog open={showPay} onOpenChange={v => { setShowPay(v); if (!v) { setSelectedBill(null); resetPayForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" /> Record Bill Payment
            </DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bill</span>
                  <span className="font-medium">{selectedBill.bill_number}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Vendor</span>
                  <span>{selectedBill.vendor_name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Total / Paid / Due</span>
                  <span className="font-medium">
                    {fmt(selectedBill.total_amount)} / <span className="text-green-600">{fmt(selectedBill.paid_amount || 0)}</span> / <span className="text-amber-600">{fmt(billRemaining(selectedBill))}</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        {format(payDate, 'dd MMM yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={payDate} onSelect={d => d && setPayDate(d)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={payAmount}
                      onChange={e => setPayAmount(e.target.value)}
                      className="pl-10"
                      min="0"
                      max={billRemaining(selectedBill)}
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <Select value={payMode} onValueChange={setPayMode}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_MODES.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Reference #</Label>
                  <Input
                    placeholder="UTR / Cheque no."
                    value={payReference}
                    onChange={e => setPayReference(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional notes..."
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary">Auto Journal Entry</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Dr. Accounts Payable</span>
                  <span className="text-right font-medium">{payAmount ? fmt(Number(payAmount)) : '—'}</span>
                  <span>Cr. {payMode === 'cash' ? 'Cash Account' : 'Bank Account'}</span>
                  <span className="text-right font-medium">{payAmount ? fmt(Number(payAmount)) : '—'}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPay(false); setSelectedBill(null); resetPayForm(); }}>Cancel</Button>
            <Button
              onClick={handlePay}
              disabled={!payAmount || Number(payAmount) <= 0 || recordPayment.isPending}
            >
              {recordPayment.isPending ? 'Processing...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Advance Adjustment Dialog */}
      <Dialog open={showAdjust} onOpenChange={v => { setShowAdjust(v); if (!v) { setSelectedBill(null); resetAdjustForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" /> Adjust Advance Against Bill
            </DialogTitle>
          </DialogHeader>
          {selectedBill && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bill</span>
                  <span className="font-medium">{selectedBill.bill_number}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Vendor</span>
                  <span>{selectedBill.vendor_name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span className="font-bold text-amber-600">{fmt(billRemaining(selectedBill))}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Advance *</Label>
                <Select value={adjustAdvanceId} onValueChange={v => {
                  setAdjustAdvanceId(v);
                  const adv = vendorAdvances.find(a => a.id === v);
                  if (adv) {
                    setAdjustAmount(String(Math.min(adv.unadjusted_amount, billRemaining(selectedBill))));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select available advance" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorAdvances.length === 0 ? (
                      <SelectItem value="none" disabled>No advances available for this vendor</SelectItem>
                    ) : (
                      vendorAdvances.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.advance_number} — Balance: {fmt(a.unadjusted_amount)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Adjustment Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal">
                        {format(adjustDate, 'dd MMM yyyy')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={adjustDate} onSelect={d => d && setAdjustDate(d)} initialFocus />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="number"
                      value={adjustAmount}
                      onChange={e => setAdjustAmount(e.target.value)}
                      className="pl-10"
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Optional notes..."
                  value={adjustNotes}
                  onChange={e => setAdjustNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
                <p className="text-xs font-medium text-primary">Auto Journal Entry</p>
                <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <span>Dr. Accounts Payable</span>
                  <span className="text-right font-medium">{adjustAmount ? fmt(Number(adjustAmount)) : '—'}</span>
                  <span>Cr. Vendor Advances</span>
                  <span className="text-right font-medium">{adjustAmount ? fmt(Number(adjustAmount)) : '—'}</span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAdjust(false); setSelectedBill(null); resetAdjustForm(); }}>Cancel</Button>
            <Button
              onClick={handleAdjust}
              disabled={!adjustAdvanceId || !adjustAmount || Number(adjustAmount) <= 0 || adjustAdvance.isPending}
            >
              {adjustAdvance.isPending ? 'Adjusting...' : 'Adjust Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

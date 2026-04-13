
import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import {
  Plus, Search, Filter, Banknote, ArrowUpDown, ArrowRightLeft,
  FileText, Download, ChevronDown, Paperclip, IndianRupee,
  CircleDot, CheckCircle2, Clock,
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
import { cn } from '@/lib/utils';
import { useVendors } from '@/hooks/useVendors';
import { useVendorAdvances, useCreateVendorAdvance, useVendorAdvanceSummary } from '@/hooks/useVendorAdvances';
import { useAdvanceAdjustments, useAdjustAdvance } from '@/hooks/useVendorBillPayments';
import { usePurchaseBills } from '@/hooks/usePurchaseBills';
import { PAYMENT_MODES } from '@/types/vendorPayments';
import type { VendorAdvance } from '@/types/vendorPayments';

const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  active: { label: 'Active', variant: 'default', icon: CircleDot },
  partially_adjusted: { label: 'Partial', variant: 'secondary', icon: Clock },
  fully_adjusted: { label: 'Adjusted', variant: 'outline', icon: CheckCircle2 },
};

export default function VendorAdvances() {
  const [showForm, setShowForm] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<VendorAdvance | null>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [tab, setTab] = useState('advances');

  // Form state
  const [formVendorId, setFormVendorId] = useState('');
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formAmount, setFormAmount] = useState('');
  const [formPaymentMode, setFormPaymentMode] = useState('bank');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Adjust state
  const [adjustBillId, setAdjustBillId] = useState('');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustDate, setAdjustDate] = useState<Date>(new Date());
  const [adjustNotes, setAdjustNotes] = useState('');

  const { data: vendors = [] } = useVendors();
  const { data: advances = [], isLoading } = useVendorAdvances();
  const { data: summary } = useVendorAdvanceSummary();
  const { data: adjustments = [] } = useAdvanceAdjustments();
  const { data: bills = [] } = usePurchaseBills();
  const createAdvance = useCreateVendorAdvance();
  const adjustAdvance = useAdjustAdvance();

  const selectedVendor = vendors.find(v => v.id === formVendorId);

  // Filter advances
  const filteredAdvances = useMemo(() => {
    let result = advances;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.vendor_name.toLowerCase().includes(q) ||
        a.advance_number.toLowerCase().includes(q) ||
        a.reference_number?.toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') result = result.filter(a => a.status === filterStatus);
    return result;
  }, [advances, search, filterStatus]);

  // Vendor's unpaid bills for adjustment
  const vendorUnpaidBills = useMemo(() => {
    if (!selectedAdvance) return [];
    return bills.filter(
      b => b.vendor_id === selectedAdvance.vendor_id && b.status !== 'paid'
    );
  }, [bills, selectedAdvance]);

  const handleCreateAdvance = () => {
    if (!formVendorId || !formAmount || Number(formAmount) <= 0) return;
    createAdvance.mutate(
      {
        vendor_id: formVendorId,
        vendor_name: selectedVendor?.name || '',
        advance_date: format(formDate, 'yyyy-MM-dd'),
        amount: Number(formAmount),
        payment_mode: formPaymentMode,
        reference_number: formReference || undefined,
        notes: formNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          resetForm();
        },
      }
    );
  };

  const handleAdjust = () => {
    if (!selectedAdvance || !adjustBillId || !adjustAmount || Number(adjustAmount) <= 0) return;
    const bill = bills.find(b => b.id === adjustBillId);
    if (!bill) return;

    adjustAdvance.mutate(
      {
        advance_id: selectedAdvance.id,
        advance_number: selectedAdvance.advance_number,
        bill_id: adjustBillId,
        bill_number: bill.bill_number,
        vendor_id: selectedAdvance.vendor_id,
        vendor_name: selectedAdvance.vendor_name,
        adjustment_date: format(adjustDate, 'yyyy-MM-dd'),
        amount: Number(adjustAmount),
        notes: adjustNotes || undefined,
      },
      {
        onSuccess: () => {
          setShowAdjust(false);
          setSelectedAdvance(null);
          resetAdjustForm();
        },
      }
    );
  };

  const resetForm = () => {
    setFormVendorId('');
    setFormDate(new Date());
    setFormAmount('');
    setFormPaymentMode('bank');
    setFormReference('');
    setFormNotes('');
  };

  const resetAdjustForm = () => {
    setAdjustBillId('');
    setAdjustAmount('');
    setAdjustDate(new Date());
    setAdjustNotes('');
  };

  const openAdjust = (adv: VendorAdvance) => {
    setSelectedAdvance(adv);
    setAdjustAmount(String(adv.unadjusted_amount));
    setShowAdjust(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Advances</h1>
          <p className="text-sm text-muted-foreground">Record prepayments & adjust against bills</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Record Advance
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/10">
              <Banknote className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Advances</p>
              <p className="text-xl font-bold">{fmt(summary?.totalAdvances || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Adjusted</p>
              <p className="text-xl font-bold">{fmt(summary?.totalAdjusted || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unadjusted Balance</p>
              <p className="text-xl font-bold">{fmt(summary?.totalUnadjusted || 0)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10">
              <ArrowRightLeft className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Active / Partial</p>
              <p className="text-xl font-bold">{summary?.activeCount || 0} / {summary?.partialCount || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
        </TabsList>

        <TabsContent value="advances" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by vendor, advance #, reference..."
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
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="partially_adjusted">Partially Adjusted</SelectItem>
                <SelectItem value="fully_adjusted">Fully Adjusted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Advance #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Adjusted</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">Loading...</TableCell>
                    </TableRow>
                  ) : filteredAdvances.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        No advances found. Record your first vendor advance.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAdvances.map(adv => {
                      const cfg = statusConfig[adv.status] || statusConfig.active;
                      const Icon = cfg.icon;
                      return (
                        <TableRow key={adv.id}>
                          <TableCell className="font-medium">{adv.advance_number}</TableCell>
                          <TableCell>{format(new Date(adv.advance_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{adv.vendor_name}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(adv.amount)}</TableCell>
                          <TableCell className="text-right text-green-600">{fmt(adv.adjusted_amount)}</TableCell>
                          <TableCell className="text-right text-amber-600 font-medium">{fmt(adv.unadjusted_amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">{adv.payment_mode}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={cfg.variant} className="gap-1">
                              <Icon className="h-3 w-3" /> {cfg.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {adv.status !== 'fully_adjusted' && (
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => openAdjust(adv)}>
                                <ArrowRightLeft className="h-3.5 w-3.5" /> Adjust
                              </Button>
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

        <TabsContent value="adjustments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Advance Adjustments History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Advance #</TableHead>
                    <TableHead>Bill #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No adjustments recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    adjustments.map(adj => (
                      <TableRow key={adj.id}>
                        <TableCell>{format(new Date(adj.adjustment_date), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-medium">{adj.advance_number}</TableCell>
                        <TableCell className="font-medium">{adj.bill_number}</TableCell>
                        <TableCell>{adj.vendor_name}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(adj.amount)}</TableCell>
                        <TableCell className="text-muted-foreground">{adj.notes || '—'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record Advance Dialog */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" /> Record Vendor Advance
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor *</Label>
              <Select value={formVendorId} onValueChange={setFormVendorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.name}{v.company_name ? ` (${v.company_name})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !formDate && 'text-muted-foreground')}>
                      {formDate ? format(formDate, 'dd MMM yyyy') : 'Pick date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={formDate} onSelect={d => d && setFormDate(d)} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <div className="relative">
                  <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    className="pl-10"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Mode</Label>
                <Select value={formPaymentMode} onValueChange={setFormPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  value={formReference}
                  onChange={e => setFormReference(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Optional notes..."
                value={formNotes}
                onChange={e => setFormNotes(e.target.value)}
                rows={2}
              />
            </div>

            <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-medium text-primary">Auto Journal Entry</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Dr. Vendor Advances</span>
                <span className="text-right font-medium">{formAmount ? fmt(Number(formAmount)) : '—'}</span>
                <span>Cr. {formPaymentMode === 'cash' ? 'Cash Account' : 'Bank Account'}</span>
                <span className="text-right font-medium">{formAmount ? fmt(Number(formAmount)) : '—'}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={handleCreateAdvance}
              disabled={!formVendorId || !formAmount || Number(formAmount) <= 0 || createAdvance.isPending}
            >
              {createAdvance.isPending ? 'Saving...' : 'Record Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust Advance Dialog */}
      <Dialog open={showAdjust} onOpenChange={v => { setShowAdjust(v); if (!v) { setSelectedAdvance(null); resetAdjustForm(); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-primary" /> Adjust Advance Against Bill
            </DialogTitle>
          </DialogHeader>
          {selectedAdvance && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Advance</span>
                  <span className="font-medium">{selectedAdvance.advance_number}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Vendor</span>
                  <span>{selectedAdvance.vendor_name}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Available Balance</span>
                  <span className="font-bold text-primary">{fmt(selectedAdvance.unadjusted_amount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Select Bill *</Label>
                <Select value={adjustBillId} onValueChange={v => {
                  setAdjustBillId(v);
                  const bill = vendorUnpaidBills.find(b => b.id === v);
                  if (bill) {
                    const remaining = bill.total_amount - (bill.paid_amount || 0);
                    setAdjustAmount(String(Math.min(remaining, selectedAdvance.unadjusted_amount)));
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select unpaid bill" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendorUnpaidBills.length === 0 ? (
                      <SelectItem value="none" disabled>No unpaid bills for this vendor</SelectItem>
                    ) : (
                      vendorUnpaidBills.map(b => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bill_number} — Due: {fmt(b.total_amount - (b.paid_amount || 0))}
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
                      max={selectedAdvance.unadjusted_amount}
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
            <Button variant="outline" onClick={() => { setShowAdjust(false); setSelectedAdvance(null); resetAdjustForm(); }}>Cancel</Button>
            <Button
              onClick={handleAdjust}
              disabled={!adjustBillId || !adjustAmount || Number(adjustAmount) <= 0 || adjustAdvance.isPending}
            >
              {adjustAdvance.isPending ? 'Adjusting...' : 'Adjust Advance'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

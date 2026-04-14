
import React, { useState, useMemo } from 'react';
import {
  Search, IndianRupee, Clock, CheckCircle2, AlertCircle, ArrowDownRight,
  ChevronDown, ChevronRight, FileText, Receipt, CreditCard, Wallet,
  Building2, Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@clerk/clerk-react';
import { WaterPod } from '@/components/ui/WaterPod';
import { usePurchaseBills, PurchaseBill } from '@/hooks/usePurchaseBills';
import { useRecordBillPayment } from '@/hooks/useVendorBillPayments';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { Link } from 'react-router-dom';

// ── Types ──

interface VendorExpense {
  id: string;
  vendor_id: string;
  vendor_name: string;
  expense_number: string;
  description: string;
  total_amount: number;
  expense_date: string;
  status: string;
  payment_mode: string;
}

interface VendorAdvance {
  id: string;
  vendor_id: string;
  vendor_name: string;
  advance_number: string;
  amount: number;
  unadjusted_amount: number;
  status: string;
  advance_date: string;
}

type LineItemType = 'bill' | 'expense';

interface PayableLineItem {
  id: string;
  type: LineItemType;
  reference: string;
  description: string;
  total_amount: number;
  paid_amount: number;
  balance: number;
  due_date: string;
  date: string;
  status: string;
}

interface VendorPayable {
  vendor_id: string;
  vendor_name: string;
  bills: PayableLineItem[];
  expenses: PayableLineItem[];
  totalBills: number;
  totalExpenses: number;
  totalAdvances: number;
  netPayable: number;
  overdueAmount: number;
  advances: VendorAdvance[];
}

// ── Status config ──

const statusConfig: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300', icon: Clock },
  overdue: { label: 'Overdue', cls: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300', icon: AlertCircle },
  paid: { label: 'Paid', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300', icon: CheckCircle2 },
  partial: { label: 'Partial', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', icon: ArrowDownRight },
  partially_paid: { label: 'Partial', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300', icon: ArrowDownRight },
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0 }).format(n);

const getOverdueDays = (dueDate: string) => {
  const diffDays = Math.ceil((Date.now() - new Date(dueDate).getTime()) / 86400000);
  return diffDays > 0 ? diffDays : 0;
};

// ── Aging bucket helper ──
type AgingBucket = '0-30' | '31-60' | '61-90' | '90+';
const getAgingBucket = (dueDate: string): AgingBucket => {
  const days = getOverdueDays(dueDate);
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
};

// ── Hooks for vendor expenses & advances ──

const useUnpaidVendorExpenses = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['vendor-expenses-unpaid', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('expenses')
        .select('id, vendor_id, vendor_name, expense_number, description, total_amount, expense_date, status, payment_mode')
        .eq('user_id', uid)
        .not('vendor_id', 'is', null)
        .in('status', ['pending', 'approved', 'posted'])
        .order('expense_date', { ascending: false });
      if (error) throw error;
      // Exclude cash/upi/credit_card/debit_card paid expenses (already settled)
      return (data || []).filter((e: any) =>
        !['cash', 'upi', 'credit_card', 'debit_card'].includes(e.payment_mode)
      ) as VendorExpense[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

const useVendorAdvances = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['vendor-advances', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('vendor_advances')
        .select('id, vendor_id, vendor_name, advance_number, amount, unadjusted_amount, status, advance_date')
        .eq('user_id', uid)
        .in('status', ['active', 'partially_adjusted'])
        .order('advance_date', { ascending: false });
      if (error) throw error;
      return (data || []) as VendorAdvance[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

// ── Main Component ──

export default function Payables() {
  const { data: bills = [], isLoading: billsLoading } = usePurchaseBills();
  const { data: vendorExpenses = [], isLoading: expensesLoading } = useUnpaidVendorExpenses();
  const { data: vendorAdvances = [], isLoading: advancesLoading } = useVendorAdvances();
  const { user } = useUser();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('payable');
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'vendor' | 'flat'>('vendor');

  // Payment dialog
  const [payBill, setPayBill] = useState<PurchaseBill | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const recordBillPayment = useRecordBillPayment();

  const isLoading = billsLoading || expensesLoading || advancesLoading;

  // ── Compute vendor-wise payables ──
  const { vendorPayables, flatItems } = useMemo(() => {
    const vendorMap = new Map<string, VendorPayable>();

    const ensureVendor = (vendorId: string, vendorName: string): VendorPayable => {
      const key = vendorId || `_novendor_${vendorName}`;
      if (!vendorMap.has(key)) {
        vendorMap.set(key, {
          vendor_id: key,
          vendor_name: vendorName,
          bills: [],
          expenses: [],
          totalBills: 0,
          totalExpenses: 0,
          totalAdvances: 0,
          netPayable: 0,
          overdueAmount: 0,
          advances: [],
        });
      }
      return vendorMap.get(key)!;
    };

    // 1. Bills — exclude paid
    const unpaidBills = bills.filter(b => b.status !== 'paid');
    for (const bill of unpaidBills) {
      const vendor = ensureVendor(bill.vendor_id || '', bill.vendor_name);
      const paid = Number(bill.paid_amount || 0);
      const balance = Number(bill.total_amount) - paid;
      const isOverdue = bill.status === 'overdue' || (bill.due_date < new Date().toISOString().split('T')[0] && bill.status !== 'paid');
      vendor.bills.push({
        id: bill.id,
        type: 'bill',
        reference: bill.bill_number,
        description: `Bill ${bill.bill_number}`,
        total_amount: Number(bill.total_amount),
        paid_amount: paid,
        balance,
        due_date: bill.due_date,
        date: bill.bill_date,
        status: isOverdue ? 'overdue' : (paid > 0 ? 'partially_paid' : 'pending'),
      });
      vendor.totalBills += balance;
      if (isOverdue) vendor.overdueAmount += balance;
    }

    // 2. Unpaid vendor-linked expenses
    for (const exp of vendorExpenses) {
      const vendor = ensureVendor(exp.vendor_id, exp.vendor_name);
      vendor.expenses.push({
        id: exp.id,
        type: 'expense',
        reference: exp.expense_number,
        description: exp.description,
        total_amount: Number(exp.total_amount),
        paid_amount: 0,
        balance: Number(exp.total_amount),
        due_date: exp.expense_date,
        date: exp.expense_date,
        status: 'pending',
      });
      vendor.totalExpenses += Number(exp.total_amount);
    }

    // 3. Vendor advances — deduct from payable
    for (const adv of vendorAdvances) {
      const vendor = ensureVendor(adv.vendor_id, adv.vendor_name);
      vendor.advances.push(adv);
      vendor.totalAdvances += Number(adv.unadjusted_amount);
    }

    // Compute net payable per vendor
    for (const v of vendorMap.values()) {
      v.netPayable = Math.max(0, v.totalBills + v.totalExpenses - v.totalAdvances);
    }

    const vendorPayables = Array.from(vendorMap.values())
      .filter(v => v.totalBills > 0 || v.totalExpenses > 0) // only vendors with payable items
      .sort((a, b) => b.netPayable - a.netPayable);

    // Flat list for flat view
    const flatItems: PayableLineItem[] = [];
    for (const v of vendorPayables) {
      flatItems.push(...v.bills, ...v.expenses);
    }
    flatItems.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

    return { vendorPayables, flatItems };
  }, [bills, vendorExpenses, vendorAdvances]);

  // ── Filtered data ──
  const filteredVendors = useMemo(() => {
    let filtered = vendorPayables;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(v =>
        v.vendor_name.toLowerCase().includes(q) ||
        v.bills.some(b => b.reference.toLowerCase().includes(q)) ||
        v.expenses.some(e => e.reference.toLowerCase().includes(q))
      );
    }
    if (statusFilter === 'overdue') {
      filtered = filtered.filter(v => v.overdueAmount > 0);
    }
    return filtered;
  }, [vendorPayables, searchTerm, statusFilter]);

  const filteredFlat = useMemo(() => {
    let filtered = flatItems;
    if (statusFilter === 'overdue') {
      filtered = filtered.filter(item => item.status === 'overdue');
    } else if (statusFilter !== 'payable' && statusFilter !== 'all') {
      filtered = filtered.filter(item => item.status === statusFilter);
    }
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.reference.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [flatItems, searchTerm, statusFilter]);

  // ── Summary ──
  const summary = useMemo(() => {
    const totalBills = vendorPayables.reduce((s, v) => s + v.totalBills, 0);
    const totalExpenses = vendorPayables.reduce((s, v) => s + v.totalExpenses, 0);
    const totalAdvances = vendorPayables.reduce((s, v) => s + v.totalAdvances, 0);
    const gross = totalBills + totalExpenses;
    const netPayable = Math.max(0, gross - totalAdvances);
    const overdue = vendorPayables.reduce((s, v) => s + v.overdueAmount, 0);
    const pending = netPayable - overdue;
    return { totalBills, totalExpenses, totalAdvances, gross, netPayable, overdue, pending };
  }, [vendorPayables]);

  // Aging
  const aging = useMemo(() => {
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    for (const item of flatItems) {
      if (item.status === 'overdue') {
        buckets[getAgingBucket(item.due_date)] += item.balance;
      }
    }
    return buckets;
  }, [flatItems]);

  const totalBase = Math.max(summary.gross, 1);
  const overduePercent = (summary.overdue / totalBase) * 100;
  const pendingPercent = (summary.pending / totalBase) * 100;
  const advancePercent = (summary.totalAdvances / totalBase) * 100;
  const netPercent = (summary.netPayable / totalBase) * 100;

  // ── Toggle vendor expand ──
  const toggleVendor = (vendorId: string) => {
    setExpandedVendors(prev => {
      const next = new Set(prev);
      if (next.has(vendorId)) next.delete(vendorId);
      else next.add(vendorId);
      return next;
    });
  };

  // ── Payment ──
  const openPayDialog = (bill: PurchaseBill) => {
    setPayBill(bill);
    const balance = Number(bill.total_amount) - Number(bill.paid_amount || 0);
    setPayAmount(balance.toFixed(2));
  };

  const handlePay = async () => {
    if (!payBill || !user) return;
    const amt = Number(payAmount);
    const balance = Number(payBill.total_amount) - Number(payBill.paid_amount || 0);
    if (!amt || amt <= 0 || amt > balance) {
      toast({ title: 'Invalid amount', description: `Enter between ₹1 and ${fmt(balance)}`, variant: 'destructive' });
      return;
    }
    try {
      await recordBillPayment.mutateAsync({
        bill_id: payBill.id,
        bill_number: payBill.bill_number,
        vendor_id: payBill.vendor_id || '',
        vendor_name: payBill.vendor_name,
        amount: amt,
        payment_mode: 'bank',
        payment_date: new Date().toISOString().split('T')[0],
      });
      toast({ title: amt >= balance ? 'Bill fully paid' : 'Payment recorded', description: `${fmt(amt)} paid for ${payBill.bill_number}` });
      setPayBill(null);
      setPayAmount('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Payment failed', variant: 'destructive' });
    }
  };

  // Find bill object by id for the pay action
  const findBill = (billId: string) => bills.find(b => b.id === billId);

  if (isLoading) {
    return <div className="flex justify-center items-center h-64 text-muted-foreground">Loading payables...</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Payables</h1>
          <p className="text-sm text-muted-foreground">
            Pending bills + unpaid vendor expenses {summary.totalAdvances > 0 ? `- ${fmt(summary.totalAdvances)} advances` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/vendor-advances">Vendor Advances</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/vendor-bill-payments">Bill Payments</Link>
          </Button>
        </div>
      </div>

      {/* Water Pod Summary */}
      <Card className="border border-border">
        <CardContent className="py-8">
          <div className="flex flex-wrap items-end justify-center gap-8 md:gap-12">
            <WaterPod
              label="Net Payable"
              value={fmt(summary.netPayable)}
              subtitle="After advances"
              fillPercent={netPercent}
              color="purple"
              size="lg"
              icon={<IndianRupee className="h-4 w-4 text-purple-600" />}
            />
            <WaterPod
              label="Overdue"
              value={fmt(summary.overdue)}
              subtitle="Past due date"
              fillPercent={overduePercent}
              color="red"
              size="md"
              icon={<AlertCircle className="h-4 w-4 text-red-600" />}
            />
            <WaterPod
              label="Pending"
              value={fmt(summary.pending)}
              subtitle="Not yet due"
              fillPercent={pendingPercent}
              color="amber"
              size="md"
              icon={<Clock className="h-4 w-4 text-amber-600" />}
            />
            <WaterPod
              label="Advances"
              value={fmt(summary.totalAdvances)}
              subtitle="Unadjusted"
              fillPercent={advancePercent}
              color="green"
              size="md"
              icon={<Wallet className="h-4 w-4 text-green-600" />}
            />
          </div>
        </CardContent>
      </Card>

      {/* Payable Breakdown Bar */}
      <Card className="border border-border">
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-500" />
              <span className="text-muted-foreground">Bills:</span>
              <span className="font-semibold">{fmt(summary.totalBills)}</span>
            </div>
            <span className="text-muted-foreground">+</span>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-orange-500" />
              <span className="text-muted-foreground">Expenses:</span>
              <span className="font-semibold">{fmt(summary.totalExpenses)}</span>
            </div>
            <span className="text-muted-foreground">-</span>
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-green-500" />
              <span className="text-muted-foreground">Advances:</span>
              <span className="font-semibold">{fmt(summary.totalAdvances)}</span>
            </div>
            <span className="text-muted-foreground">=</span>
            <div className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-purple-600" />
              <span className="font-bold text-purple-700">{fmt(summary.netPayable)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Aging Buckets (only if overdue) */}
      {summary.overdue > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {([['0-30', '0-30 days'], ['31-60', '31-60 days'], ['61-90', '61-90 days'], ['90+', '90+ days']] as [AgingBucket, string][]).map(([key, label]) => (
            <Card key={key} className="border">
              <CardContent className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-lg font-bold ${aging[key] > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {fmt(aging[key])}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendor, bill, expense..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="payable">All Payable</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="partially_paid">Partial</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex border rounded-md overflow-hidden">
          <Button
            variant={viewMode === 'vendor' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => setViewMode('vendor')}
          >
            <Building2 className="h-3.5 w-3.5 mr-1" /> Vendor
          </Button>
          <Button
            variant={viewMode === 'flat' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-none"
            onClick={() => setViewMode('flat')}
          >
            <FileText className="h-3.5 w-3.5 mr-1" /> All Items
          </Button>
        </div>
      </div>

      {/* ── VENDOR VIEW ── */}
      {viewMode === 'vendor' && (
        <div className="space-y-3">
          {filteredVendors.length === 0 ? (
            <Card className="border"><CardContent className="py-12 text-center text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              No payables found
            </CardContent></Card>
          ) : (
            filteredVendors.map(v => {
              const isExpanded = expandedVendors.has(v.vendor_id);
              return (
                <Card key={v.vendor_id} className="border">
                  {/* Vendor header row */}
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-muted/40 transition-colors"
                    onClick={() => toggleVendor(v.vendor_id)}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{v.vendor_name}</div>
                      <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                        <span>{v.bills.length} bill{v.bills.length !== 1 ? 's' : ''}</span>
                        {v.expenses.length > 0 && <span>{v.expenses.length} expense{v.expenses.length !== 1 ? 's' : ''}</span>}
                        {v.advances.length > 0 && <span className="text-green-600">{v.advances.length} advance{v.advances.length !== 1 ? 's' : ''}</span>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold">{fmt(v.netPayable)}</div>
                      {v.totalAdvances > 0 && (
                        <div className="text-xs text-green-600">-{fmt(v.totalAdvances)} advances</div>
                      )}
                      {v.overdueAmount > 0 && (
                        <div className="text-xs text-red-500">{fmt(v.overdueAmount)} overdue</div>
                      )}
                    </div>
                  </button>

                  {/* Drill-down */}
                  {isExpanded && (
                    <div className="border-t px-4 pb-3">
                      {/* Bills */}
                      {v.bills.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <FileText className="h-3 w-3" /> Bills
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Bill #</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                                <TableHead className="text-right">Paid</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                                <TableHead>Due Date</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {v.bills.map(item => {
                                const cfg = statusConfig[item.status] || statusConfig.pending;
                                const Icon = cfg.icon;
                                return (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-medium text-sm">{item.reference}</TableCell>
                                    <TableCell className="text-right">{fmt(item.total_amount)}</TableCell>
                                    <TableCell className="text-right">
                                      {item.paid_amount > 0 ? (
                                        <div>
                                          <div>{fmt(item.paid_amount)}</div>
                                          <Progress value={(item.paid_amount / item.total_amount) * 100} className="h-1 w-16 ml-auto mt-0.5" />
                                        </div>
                                      ) : '--'}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">{fmt(item.balance)}</TableCell>
                                    <TableCell>
                                      <div className="text-sm">{new Date(item.due_date).toLocaleDateString('en-IN')}</div>
                                      {item.status === 'overdue' && (
                                        <div className="text-xs text-red-500">{getOverdueDays(item.due_date)}d overdue</div>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      <Badge className={cfg.cls + ' gap-1'}><Icon className="h-3 w-3" /> {cfg.label}</Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      {(() => {
                                        const bill = findBill(item.id);
                                        return bill ? (
                                          <Button size="sm" variant="outline" className="gap-1 border-green-400 text-green-700 hover:bg-green-50" onClick={() => openPayDialog(bill)}>
                                            <IndianRupee className="h-3.5 w-3.5" /> Pay
                                          </Button>
                                        ) : null;
                                      })()}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Expenses */}
                      {v.expenses.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Receipt className="h-3 w-3" /> Unpaid Vendor Expenses
                          </p>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Expense #</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead>Date</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {v.expenses.map(item => (
                                <TableRow key={item.id}>
                                  <TableCell className="font-medium text-sm">{item.reference}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{item.description}</TableCell>
                                  <TableCell className="text-right font-medium">{fmt(item.balance)}</TableCell>
                                  <TableCell className="text-sm">{new Date(item.date).toLocaleDateString('en-IN')}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      {/* Advances */}
                      {v.advances.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                            <Wallet className="h-3 w-3 text-green-600" /> Unadjusted Advances
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {v.advances.map(adv => (
                              <Badge key={adv.id} variant="outline" className="gap-1 border-green-300 text-green-700 bg-green-50">
                                {adv.advance_number}: {fmt(Number(adv.unadjusted_amount))}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Vendor summary row */}
                      <div className="mt-3 pt-3 border-t flex flex-wrap gap-4 text-sm">
                        <div><span className="text-muted-foreground">Bills:</span> <span className="font-medium">{fmt(v.totalBills)}</span></div>
                        {v.totalExpenses > 0 && <div><span className="text-muted-foreground">+ Expenses:</span> <span className="font-medium">{fmt(v.totalExpenses)}</span></div>}
                        {v.totalAdvances > 0 && <div><span className="text-muted-foreground">- Advances:</span> <span className="font-medium text-green-600">{fmt(v.totalAdvances)}</span></div>}
                        <div className="ml-auto"><span className="text-muted-foreground">Net Payable:</span> <span className="font-bold text-purple-700">{fmt(v.netPayable)}</span></div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── FLAT VIEW ── */}
      {viewMode === 'flat' && (
        <Card className="border border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">All Payable Items ({filteredFlat.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFlat.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      No payable items found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredFlat.map(item => {
                    const cfg = statusConfig[item.status] || statusConfig.pending;
                    const Icon = cfg.icon;
                    // Find vendor name from vendorPayables
                    const vendorName = vendorPayables.find(v =>
                      v.bills.some(b => b.id === item.id) || v.expenses.some(e => e.id === item.id)
                    )?.vendor_name || '';
                    return (
                      <TableRow key={`${item.type}-${item.id}`}>
                        <TableCell>
                          <Badge variant="outline" className="gap-1 text-xs">
                            {item.type === 'bill' ? <FileText className="h-3 w-3" /> : <Receipt className="h-3 w-3" />}
                            {item.type === 'bill' ? 'Bill' : 'Expense'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-sm">{item.reference}</TableCell>
                        <TableCell className="text-sm">{vendorName}</TableCell>
                        <TableCell className="text-right">{fmt(item.total_amount)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(item.balance)}</TableCell>
                        <TableCell>
                          <div className="text-sm">{new Date(item.due_date).toLocaleDateString('en-IN')}</div>
                          {item.status === 'overdue' && (
                            <div className="text-xs text-red-500">{getOverdueDays(item.due_date)}d overdue</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={cfg.cls + ' gap-1'}><Icon className="h-3 w-3" /> {cfg.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {item.type === 'bill' && (() => {
                            const bill = findBill(item.id);
                            return bill ? (
                              <Button size="sm" variant="outline" className="gap-1 border-green-400 text-green-700 hover:bg-green-50" onClick={() => openPayDialog(bill)}>
                                <IndianRupee className="h-3.5 w-3.5" /> Pay
                              </Button>
                            ) : null;
                          })()}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* ── Payment Dialog ── */}
      <Dialog open={!!payBill} onOpenChange={open => { if (!open) { setPayBill(null); setPayAmount(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
          {payBill && (() => {
            const total = Number(payBill.total_amount);
            const paid = Number(payBill.paid_amount || 0);
            const balance = total - paid;
            const pct = Math.min((paid / total) * 100, 100);
            return (
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Bill</span><span className="font-medium">{payBill.bill_number}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Vendor</span><span>{payBill.vendor_name}</span></div>
                  <div className="flex justify-between font-medium"><span className="text-muted-foreground">Bill Total</span><span>{fmt(total)}</span></div>
                  {paid > 0 && (
                    <>
                      <div className="flex justify-between text-green-700"><span>Already Paid</span><span>{fmt(paid)}</span></div>
                      <Progress value={pct} className="h-2 mt-1" />
                    </>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                    <span>Balance Due</span><span className="text-orange-600">{fmt(balance)}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment Amount</Label>
                  <Input type="number" step="0.01" min="0.01" max={balance} value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={`Max ${fmt(balance)}`} />
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPayAmount((balance / 2).toFixed(2))}>50%</Button>
                    <Button type="button" size="sm" variant="outline" className="text-xs" onClick={() => setPayAmount(balance.toFixed(2))}>Full</Button>
                  </div>
                </div>
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPayBill(null); setPayAmount(''); }}>Cancel</Button>
            <Button onClick={handlePay} disabled={recordBillPayment.isPending}>
              {recordBillPayment.isPending ? 'Saving...' : 'Record Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import React, { useState, useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
    IndianRupee, Plus, ArrowUpRight, ArrowDownLeft, Wallet, TrendingUp,
    FileText, CreditCard, Banknote, CheckCircle2, Clock, Loader2,
    Filter, Search, Tag, Users, Building2, Receipt, ArrowRightLeft,
    ChevronDown, ChevronUp, Sparkles, AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
    useHubCustomers, useHubVendors, useUnpaidInvoices, useUnpaidBills,
    useAdvanceBalances, usePaymentHistory, useRecordUnifiedPayment,
    suggestCategory, PAYMENT_CATEGORIES, PAYMENT_MODES_LIST,
    type PartyType, type PaymentType, type PaymentMode, type PaymentCategory,
} from '@/hooks/usePaymentHub';

const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const categoryColors: Record<string, string> = {
    sales_receipt: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
    advance_from_customer: 'bg-blue-500/10 text-blue-700 border-blue-200',
    expense_payment: 'bg-red-500/10 text-red-700 border-red-200',
    vendor_advance: 'bg-amber-500/10 text-amber-700 border-amber-200',
    advance_adjustment: 'bg-purple-500/10 text-purple-700 border-purple-200',
};

const categoryIcons: Record<string, React.ElementType> = {
    sales_receipt: Receipt,
    advance_from_customer: ArrowDownLeft,
    expense_payment: ArrowUpRight,
    vendor_advance: Wallet,
    advance_adjustment: ArrowRightLeft,
};

export default function PaymentHub() {
    const { user } = useUser();
    const { toast } = useToast();
    const [showDialog, setShowDialog] = useState(false);
    const [tab, setTab] = useState('record');
    const [search, setSearch] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterParty, setFilterParty] = useState('all');
    const [showAdvances, setShowAdvances] = useState(false);

    // Form state
    const [partyType, setPartyType] = useState<PartyType>('customer');
    const [paymentType, setPaymentType] = useState<PaymentType>('invoice');
    const [partyId, setPartyId] = useState('');
    const [partyName, setPartyName] = useState('');
    const [amount, setAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMode, setPaymentMode] = useState<PaymentMode>('bank_transfer');
    const [category, setCategory] = useState<PaymentCategory>('sales_receipt');
    const [referenceNumber, setReferenceNumber] = useState('');
    const [notes, setNotes] = useState('');
    const [selectedDocs, setSelectedDocs] = useState<string[]>([]);

    // Data hooks
    const { data: customers = [] } = useHubCustomers();
    const { data: vendors = [] } = useHubVendors();
    const { data: unpaidInvoices = [] } = useUnpaidInvoices(partyType === 'customer' ? partyName : '');
    const { data: unpaidBills = [] } = useUnpaidBills(partyType === 'vendor' ? partyId : '');
    const { data: advances = [] } = useAdvanceBalances(partyType, partyId || undefined);
    const { data: history = [], isLoading: historyLoading } = usePaymentHistory();
    const recordPayment = useRecordUnifiedPayment();

    // Auto-suggest category when party/type changes
    const handlePartyTypeChange = (v: PartyType) => {
        setPartyType(v);
        setPartyId('');
        setPartyName('');
        setSelectedDocs([]);
        setCategory(suggestCategory(v, paymentType));
    };

    const handlePaymentTypeChange = (v: PaymentType) => {
        setPaymentType(v);
        setSelectedDocs([]);
        setCategory(suggestCategory(partyType, v));
    };

    const handlePartySelect = (id: string) => {
        setPartyId(id);
        setSelectedDocs([]);
        if (partyType === 'customer') {
            const c = customers.find(x => x.id === id);
            setPartyName(c?.name || '');
        } else {
            const v = vendors.find(x => x.id === id);
            setPartyName(v?.name || '');
        }
    };

    const toggleDoc = (docId: string) => {
        setSelectedDocs(prev => prev.includes(docId) ? prev.filter(x => x !== docId) : [...prev, docId]);
    };

    const resetForm = () => {
        setPartyType('customer');
        setPaymentType('invoice');
        setPartyId('');
        setPartyName('');
        setAmount('');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentMode('bank_transfer');
        setCategory('sales_receipt');
        setReferenceNumber('');
        setNotes('');
        setSelectedDocs([]);
    };

    const handleSubmit = () => {
        if (!partyName || !amount || Number(amount) <= 0) {
            toast({ title: 'Validation error', description: 'Select party and enter a valid amount.', variant: 'destructive' });
            return;
        }
        recordPayment.mutate({
            partyType, paymentType, partyId, partyName,
            amount: Number(amount), paymentDate, paymentMode, category,
            referenceNumber: referenceNumber || undefined,
            notes: notes || undefined,
            linkedDocumentIds: selectedDocs.length > 0 ? selectedDocs : undefined,
        }, {
            onSuccess: () => { resetForm(); setShowDialog(false); },
        });
    };

    // Summaries
    const summary = useMemo(() => {
        let totalIn = 0, totalOut = 0;
        const catMap: Record<string, number> = {};
        history.forEach(h => {
            if (h.party_type === 'customer') totalIn += h.amount; else totalOut += h.amount;
            catMap[h.category] = (catMap[h.category] || 0) + h.amount;
        });
        return { totalIn, totalOut, net: totalIn - totalOut, catMap, count: history.length };
    }, [history]);

    // Filtered history
    const filteredHistory = useMemo(() => {
        let result = history;
        if (search) {
            const q = search.toLowerCase();
            result = result.filter(h => h.party_name.toLowerCase().includes(q) || h.reference_number?.toLowerCase().includes(q));
        }
        if (filterCategory !== 'all') result = result.filter(h => h.category === filterCategory);
        if (filterParty !== 'all') result = result.filter(h => h.party_type === filterParty);
        return result;
    }, [history, search, filterCategory, filterParty]);

    // Journal preview text
    const journalPreview = useMemo(() => {
        const a = Number(amount) || 0;
        const mode = paymentMode === 'cash' ? 'Cash' : 'Bank';
        if (partyType === 'customer' && paymentType === 'invoice') {
            return { dr: `${mode} Account`, cr: 'Accounts Receivable', amount: a };
        }
        if (partyType === 'customer' && paymentType === 'advance') {
            return { dr: `${mode} Account`, cr: 'Customer Advances (Liability)', amount: a };
        }
        if (partyType === 'vendor' && paymentType === 'invoice') {
            return { dr: 'Accounts Payable', cr: `${mode} Account`, amount: a };
        }
        return { dr: 'Vendor Advance (Asset)', cr: `${mode} Account`, amount: a };
    }, [partyType, paymentType, paymentMode, amount]);

    const parties = partyType === 'customer' ? customers : vendors;

    return (
        <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-200">
                        <IndianRupee className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Payment Hub</h1>
                        <p className="text-muted-foreground text-xs mt-0.5">Unified payments · Auto journals · Real-time ledgers</p>
                    </div>
                </div>
                <Button onClick={() => setShowDialog(true)} className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 shadow-md">
                    <Plus className="h-4 w-4" /> Record Payment
                </Button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="border-emerald-200/50 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-1"><ArrowDownLeft className="h-4 w-4 text-emerald-600" /><span className="text-xs text-muted-foreground">Money In</span></div>
                        <p className="text-lg font-bold text-emerald-600">{fmt(summary.totalIn)}</p>
                    </CardContent>
                </Card>
                <Card className="border-red-200/50 bg-gradient-to-br from-red-50 to-white dark:from-red-950/20 dark:to-background">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-1"><ArrowUpRight className="h-4 w-4 text-red-600" /><span className="text-xs text-muted-foreground">Money Out</span></div>
                        <p className="text-lg font-bold text-red-600">{fmt(summary.totalOut)}</p>
                    </CardContent>
                </Card>
                <Card className="border-violet-200/50 bg-gradient-to-br from-violet-50 to-white dark:from-violet-950/20 dark:to-background">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-violet-600" /><span className="text-xs text-muted-foreground">Net Position</span></div>
                        <p className={`text-lg font-bold ${summary.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(summary.net)}</p>
                    </CardContent>
                </Card>
                <Card className="border-blue-200/50 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-background">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center gap-2 mb-1"><FileText className="h-4 w-4 text-blue-600" /><span className="text-xs text-muted-foreground">Total Entries</span></div>
                        <p className="text-lg font-bold text-blue-600">{summary.count}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Category Breakdown */}
            {Object.keys(summary.catMap).length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2"><Tag className="h-4 w-4 text-violet-500" /> Category-wise Breakdown</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {PAYMENT_CATEGORIES.map(cat => {
                                const val = summary.catMap[cat.value] || 0;
                                const Icon = categoryIcons[cat.value] || Tag;
                                return (
                                    <div key={cat.value} className={`rounded-lg border p-3 ${categoryColors[cat.value] || ''}`}>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Icon className="h-3.5 w-3.5" />
                                            <span className="text-[11px] font-medium truncate">{cat.label.split('(')[0].trim()}</span>
                                        </div>
                                        <p className="text-sm font-bold">{fmt(val)}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Tabs: History & Advances */}
            <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                    <TabsTrigger value="record" className="gap-1.5"><Receipt className="h-3.5 w-3.5" /> History</TabsTrigger>
                    <TabsTrigger value="advances" className="gap-1.5"><Wallet className="h-3.5 w-3.5" /> Advances</TabsTrigger>
                </TabsList>

                {/* History Tab */}
                <TabsContent value="record" className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input placeholder="Search by party name or reference..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                        </div>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                            <SelectTrigger className="w-[200px]"><Tag className="mr-2 h-3.5 w-3.5" /><SelectValue placeholder="Category" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {PAYMENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label.split('(')[0].trim()}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={filterParty} onValueChange={setFilterParty}>
                            <SelectTrigger className="w-[150px]"><Users className="mr-2 h-3.5 w-3.5" /><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Parties</SelectItem>
                                <SelectItem value="customer">Customers</SelectItem>
                                <SelectItem value="vendor">Vendors</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Card>
                        <CardContent className="p-0">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            ) : filteredHistory.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
                                    <p className="text-sm">No payments found</p>
                                </div>
                            ) : (
                                <div className="overflow-auto">
                                    <Table>
                                        <TableHeader className="bg-muted/40">
                                            <TableRow>
                                                <TableHead className="pl-4">Date</TableHead>
                                                <TableHead>Party</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Category</TableHead>
                                                <TableHead>Mode</TableHead>
                                                <TableHead>Reference</TableHead>
                                                <TableHead className="text-right pr-4">Amount</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {filteredHistory.slice(0, 100).map(h => {
                                                const CatIcon = categoryIcons[h.category] || Tag;
                                                return (
                                                    <TableRow key={h.id}>
                                                        <TableCell className="pl-4 font-mono text-xs">{h.payment_date}</TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                {h.party_type === 'customer' ? <Users className="h-3.5 w-3.5 text-emerald-500" /> : <Building2 className="h-3.5 w-3.5 text-amber-500" />}
                                                                <span className="text-sm font-medium">{h.party_name}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Badge variant={h.party_type === 'customer' ? 'default' : 'secondary'} className="text-[10px]">
                                                                {h.party_type === 'customer' ? 'Customer' : 'Vendor'} · {h.payment_type === 'invoice' ? 'Inv' : 'Adv'}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium ${categoryColors[h.category] || ''}`}>
                                                                <CatIcon className="h-3 w-3" />
                                                                {PAYMENT_CATEGORIES.find(c => c.value === h.category)?.label.split('(')[0].trim() || h.category}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-xs capitalize">{(h.payment_mode || '').replace('_', ' ')}</TableCell>
                                                        <TableCell className="font-mono text-xs text-muted-foreground">{h.reference_number || '—'}</TableCell>
                                                        <TableCell className={`text-right pr-4 font-mono font-semibold text-sm ${h.party_type === 'customer' ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {h.party_type === 'customer' ? '+' : '-'}{fmt(h.amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Advances Tab */}
                <TabsContent value="advances" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Vendor Advances */}
                        <AdvanceCard title="Vendor Advances" partyType="vendor" />
                        {/* Customer Advances */}
                        <AdvanceCard title="Customer Advances" partyType="customer" />
                    </div>
                </TabsContent>
            </Tabs>

            {/* ─── Record Payment Dialog ─── */}
            <Dialog open={showDialog} onOpenChange={v => { setShowDialog(v); if (!v) resetForm(); }}>
                <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <IndianRupee className="h-4 w-4 text-violet-600" /> Record Payment
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                        {/* Party Type & Payment Type */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Party Type *</Label>
                                <Select value={partyType} onValueChange={(v: PartyType) => handlePartyTypeChange(v)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="customer"><span className="flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Customer</span></SelectItem>
                                        <SelectItem value="vendor"><span className="flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Vendor</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Payment Type *</Label>
                                <Select value={paymentType} onValueChange={(v: PaymentType) => handlePaymentTypeChange(v)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="invoice"><span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Invoice / Bill</span></SelectItem>
                                        <SelectItem value="advance"><span className="flex items-center gap-2"><Banknote className="h-3.5 w-3.5" /> Advance</span></SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Party Select */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">{partyType === 'customer' ? 'Customer' : 'Vendor'} *</Label>
                            <Select value={partyId} onValueChange={handlePartySelect}>
                                <SelectTrigger className="h-9"><SelectValue placeholder={`Select ${partyType}`} /></SelectTrigger>
                                <SelectContent>
                                    {parties.map((p: any) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}{p.email ? ` — ${p.email}` : ''}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Amount, Date, Mode */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Amount (₹) *</Label>
                                <Input className="h-9" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Date *</Label>
                                <Input className="h-9" type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Mode</Label>
                                <Select value={paymentMode} onValueChange={v => setPaymentMode(v as PaymentMode)}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {PAYMENT_MODES_LIST.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Category (auto-suggested + manual override) */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3 text-violet-500" /> Category
                                <span className="text-[10px] text-muted-foreground font-normal">(auto-suggested, editable)</span>
                            </Label>
                            <Select value={category} onValueChange={v => setCategory(v as PaymentCategory)}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Reference & Notes */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs">Reference #</Label>
                                <Input className="h-9" value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} placeholder="UTR / Cheque No." />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs">Notes</Label>
                                <Input className="h-9" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
                            </div>
                        </div>

                        {/* Linked invoices/bills */}
                        {paymentType === 'invoice' && partyName && (
                            <LinkedDocsSection
                                partyType={partyType}
                                invoices={partyType === 'customer' ? unpaidInvoices : []}
                                bills={partyType === 'vendor' ? unpaidBills : []}
                                selected={selectedDocs}
                                onToggle={toggleDoc}
                            />
                        )}

                        {/* Advance balances */}
                        {partyId && advances.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/10 p-3">
                                <p className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                                    <Wallet className="h-3.5 w-3.5" /> Active Advances ({advances.length})
                                </p>
                                <div className="space-y-1.5">
                                    {advances.slice(0, 5).map(a => (
                                        <div key={a.id} className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">{a.advance_number || a.party_name} · {a.advance_date}</span>
                                            <span className="font-semibold text-amber-700">Balance: {fmt(a.unadjusted_amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Auto Journal Preview */}
                        <div className="rounded-lg border border-dashed border-violet-300 bg-violet-50/50 dark:bg-violet-950/10 p-3">
                            <p className="text-xs font-semibold text-violet-700 mb-2 flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5" /> Auto Journal Entry Preview
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
                                <span>Dr. {journalPreview.dr}</span>
                                <span className="text-right font-medium">{journalPreview.amount > 0 ? fmt(journalPreview.amount) : '—'}</span>
                                <span>Cr. {journalPreview.cr}</span>
                                <span className="text-right font-medium">{journalPreview.amount > 0 ? fmt(journalPreview.amount) : '—'}</span>
                            </div>
                            <p className="text-[10px] text-violet-600/70 mt-2">Posts to General Ledger · Party Ledger · Trial Balance · P&L · Balance Sheet</p>
                        </div>
                    </div>

                    <DialogFooter className="mt-3">
                        <Button variant="outline" onClick={() => { setShowDialog(false); resetForm(); }}>Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={recordPayment.isPending || !partyName || !amount}
                            className="gap-2 bg-gradient-to-r from-violet-600 to-indigo-600"
                        >
                            {recordPayment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            {recordPayment.isPending ? 'Processing...' : 'Record Payment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────

function LinkedDocsSection({ partyType, invoices, bills, selected, onToggle }: {
    partyType: PartyType;
    invoices: any[];
    bills: any[];
    selected: string[];
    onToggle: (id: string) => void;
}) {
    const docs = partyType === 'customer' ? invoices : bills;
    if (!docs.length) return (
        <div className="text-center py-4 text-xs text-muted-foreground border rounded-lg">
            No unpaid {partyType === 'customer' ? 'invoices' : 'bills'} found
        </div>
    );

    return (
        <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-2 text-xs font-semibold">
                {partyType === 'customer' ? 'Unpaid Invoices' : 'Unpaid Bills'} ({docs.length})
            </div>
            <div className="max-h-[180px] overflow-y-auto">
                <Table>
                    <TableHeader>
                        <TableRow className="text-[10px]">
                            <TableHead className="w-8 pl-3"></TableHead>
                            <TableHead>{partyType === 'customer' ? 'Invoice' : 'Bill'} #</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right pr-3">Balance</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {docs.map((d: any) => (
                            <TableRow key={d.id} className="cursor-pointer hover:bg-violet-50/40" onClick={() => onToggle(d.id)}>
                                <TableCell className="pl-3"><Checkbox checked={selected.includes(d.id)} /></TableCell>
                                <TableCell className="font-mono text-xs">{d.invoice_number || d.bill_number}</TableCell>
                                <TableCell className="text-xs">{d.invoice_date || d.bill_date}</TableCell>
                                <TableCell className="text-right font-mono text-xs">{fmt(Number(d.total_amount))}</TableCell>
                                <TableCell className="text-right pr-3 font-mono text-xs font-semibold text-amber-600">{fmt(d.balance)}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

function AdvanceCard({ title, partyType }: { title: string; partyType: PartyType }) {
    const { data: advances = [], isLoading } = useAdvanceBalances(partyType);
    const total = advances.reduce((s, a) => s + a.unadjusted_amount, 0);

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                    {partyType === 'vendor' ? <Building2 className="h-4 w-4 text-amber-500" /> : <Users className="h-4 w-4 text-blue-500" />}
                    {title}
                </CardTitle>
                <CardDescription className="text-xs">
                    {advances.length} active · Total balance: <span className="font-semibold">{fmt(total)}</span>
                </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
                ) : advances.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground">No active advances</div>
                ) : (
                    <div className="overflow-auto max-h-[300px]">
                        <Table>
                            <TableHeader className="bg-muted/40">
                                <TableRow>
                                    <TableHead className="pl-4">Party</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Adjusted</TableHead>
                                    <TableHead className="text-right pr-4">Balance</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {advances.map(a => {
                                    const pct = a.total_amount > 0 ? (a.adjusted_amount / a.total_amount) * 100 : 0;
                                    return (
                                        <TableRow key={a.id}>
                                            <TableCell className="pl-4 text-sm font-medium">{a.party_name}</TableCell>
                                            <TableCell className="text-xs font-mono">{a.advance_date || '—'}</TableCell>
                                            <TableCell className="text-right text-xs font-mono">{fmt(a.total_amount)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="space-y-1">
                                                    <span className="text-xs font-mono">{fmt(a.adjusted_amount)}</span>
                                                    <Progress value={pct} className="h-1" />
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right pr-4 font-mono font-semibold text-amber-600 text-sm">{fmt(a.unadjusted_amount)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

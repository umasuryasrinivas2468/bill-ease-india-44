import React, { useState, useMemo } from "react";
import { useUser } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  IndianRupee, Plus, FileText, CheckCircle2, Clock, Loader2,
  Receipt, Users, CreditCard, Banknote, Upload,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab",
  "Rajasthan","Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand",
  "West Bengal","Delhi","Jammu & Kashmir","Ladakh","Chandigarh","Puducherry",
];

const fmtINR = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const emptyInvoicePayment = {
  customer_id: "",
  customer_name: "",
  amount: "",
  bank_charges: "",
  payment_date: new Date().toISOString().split("T")[0],
  reference_number: "",
  payment_mode: "bank_transfer",
  deposit_account: "",
  deposit_reference: "",
  tax_deducted: "",
  notes: "",
  selected_invoices: [] as string[],
};

const emptyAdvance = {
  customer_id: "",
  customer_name: "",
  place_of_supply: "",
  description: "",
  amount: "",
  bank_charges: "",
  tax_amount: "",
  payment_date: new Date().toISOString().split("T")[0],
  reference_number: "",
  payment_mode: "bank_transfer",
  deposit_account: "",
  deposit_reference: "",
  notes: "",
};

export default function PaymentReceived() {
  const { user } = useUser();
  const userId = user?.id;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showDialog, setShowDialog] = useState(false);
  const [paymentTab, setPaymentTab] = useState<"invoice" | "advance">("invoice");
  const [invoiceForm, setInvoiceForm] = useState({ ...emptyInvoicePayment });
  const [advanceForm, setAdvanceForm] = useState({ ...emptyAdvance });
  const [isSaving, setIsSaving] = useState(false);

  // Fetch clients
  const { data: clients } = useQuery({
    queryKey: ["payment-clients", userId],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name, email, phone").eq("user_id", userId!).order("name");
      return data || [];
    },
    enabled: !!userId,
  });

  // Fetch accounts for deposit account dropdown
  const { data: accounts } = useQuery({
    queryKey: ["payment-accounts", userId],
    queryFn: async () => {
      const { data } = await supabase.from("accounts").select("id, account_name, account_type").eq("user_id", userId!).eq("is_active", true).order("account_code");
      return (data || []).filter(a => /bank|cash|current|savings/i.test(a.account_name) || /bank|cash/i.test(a.account_type || ""));
    },
    enabled: !!userId,
  });

  // Fetch unpaid invoices for the selected customer
  const { data: unpaidInvoices } = useQuery({
    queryKey: ["unpaid-invoices", userId, invoiceForm.customer_name],
    queryFn: async () => {
      if (!invoiceForm.customer_name) return [];
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, total_amount, paid_amount, status")
        .eq("user_id", userId!)
        .eq("client_name", invoiceForm.customer_name)
        .in("status", ["pending", "sent", "overdue", "partial"]);
      return (data || []).map(inv => ({
        ...inv,
        balance: Number(inv.total_amount || 0) - Number(inv.paid_amount || 0),
      }));
    },
    enabled: !!userId && !!invoiceForm.customer_name,
  });

  // Fetch payment history
  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["payments-received", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_received")
        .select("*")
        .eq("user_id", userId!)
        .order("payment_date", { ascending: false })
        .limit(100);
      if (error) { console.error(error); return []; }
      return data || [];
    },
    enabled: !!userId,
  });

  const handleClientSelect = (clientId: string, target: "invoice" | "advance") => {
    const client = clients?.find(c => c.id === clientId);
    if (!client) return;
    if (target === "invoice") {
      setInvoiceForm(f => ({ ...f, customer_id: clientId, customer_name: client.name }));
    } else {
      setAdvanceForm(f => ({ ...f, customer_id: clientId, customer_name: client.name }));
    }
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    setInvoiceForm(f => ({
      ...f,
      selected_invoices: f.selected_invoices.includes(invoiceId)
        ? f.selected_invoices.filter(id => id !== invoiceId)
        : [...f.selected_invoices, invoiceId],
    }));
  };

  const handleSaveInvoicePayment = async () => {
    if (!userId || !invoiceForm.customer_name || !invoiceForm.amount) {
      toast({ title: "Please fill customer and amount", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const allocations = invoiceForm.selected_invoices.map(id => {
        const inv = unpaidInvoices?.find(i => i.id === id);
        return { invoice_id: id, invoice_number: inv?.invoice_number, allocated: inv?.balance || 0 };
      });

      const { error } = await supabase.from("payment_received").insert({
        user_id: userId,
        payment_type: "invoice_payment",
        customer_id: invoiceForm.customer_id || null,
        customer_name: invoiceForm.customer_name,
        amount: Number(invoiceForm.amount) || 0,
        bank_charges: Number(invoiceForm.bank_charges) || 0,
        payment_date: invoiceForm.payment_date,
        reference_number: invoiceForm.reference_number || null,
        payment_mode: invoiceForm.payment_mode,
        deposit_account: invoiceForm.deposit_account || null,
        deposit_reference: invoiceForm.deposit_reference || null,
        tax_deducted: Number(invoiceForm.tax_deducted) || 0,
        invoice_allocations: allocations,
        notes: invoiceForm.notes || null,
      });
      if (error) throw error;

      // Update paid_amount on allocated invoices
      for (const alloc of allocations) {
        const inv = unpaidInvoices?.find(i => i.id === alloc.invoice_id);
        if (inv) {
          const newPaid = Number(inv.paid_amount || 0) + alloc.allocated;
          const newStatus = newPaid >= Number(inv.total_amount) ? "paid" : "partial";
          await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", inv.id);
        }
      }

      toast({ title: "Payment recorded", description: `${fmtINR(Number(invoiceForm.amount))} from ${invoiceForm.customer_name}` });
      setInvoiceForm({ ...emptyInvoicePayment });
      setShowDialog(false);
      refetchPayments();
      queryClient.invalidateQueries({ queryKey: ["unpaid-invoices"] });
    } catch (err: any) {
      toast({ title: "Failed to save payment", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAdvance = async () => {
    if (!userId || !advanceForm.customer_name || !advanceForm.amount) {
      toast({ title: "Please fill customer and amount", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const { error } = await supabase.from("payment_received").insert({
        user_id: userId,
        payment_type: "customer_advance",
        customer_id: advanceForm.customer_id || null,
        customer_name: advanceForm.customer_name,
        amount: Number(advanceForm.amount) || 0,
        bank_charges: Number(advanceForm.bank_charges) || 0,
        tax_amount: Number(advanceForm.tax_amount) || 0,
        payment_date: advanceForm.payment_date,
        reference_number: advanceForm.reference_number || null,
        payment_mode: advanceForm.payment_mode,
        deposit_account: advanceForm.deposit_account || null,
        deposit_reference: advanceForm.deposit_reference || null,
        place_of_supply: advanceForm.place_of_supply || null,
        description: advanceForm.description || null,
        notes: advanceForm.notes || null,
      });
      if (error) throw error;

      toast({ title: "Advance recorded", description: `${fmtINR(Number(advanceForm.amount))} from ${advanceForm.customer_name}` });
      setAdvanceForm({ ...emptyAdvance });
      setShowDialog(false);
      refetchPayments();
    } catch (err: any) {
      toast({ title: "Failed to save advance", description: err.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const totalReceived = useMemo(() => (payments || []).reduce((s, p) => s + Number(p.amount || 0), 0), [payments]);
  const invoicePayments = useMemo(() => (payments || []).filter(p => p.payment_type === "invoice_payment"), [payments]);
  const advances = useMemo(() => (payments || []).filter(p => p.payment_type === "customer_advance"), [payments]);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <IndianRupee className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Payment Received</h1>
            <p className="text-muted-foreground text-xs mt-0.5">Record invoice payments and customer advances</p>
          </div>
        </div>
        <Button onClick={() => setShowDialog(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Record Payment
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Received</p><p className="text-lg font-bold text-emerald-600">{fmtINR(totalReceived)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Invoice Payments</p><p className="text-lg font-bold">{invoicePayments.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Customer Advances</p><p className="text-lg font-bold">{advances.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 pb-4"><p className="text-xs text-muted-foreground">Total Entries</p><p className="text-lg font-bold">{(payments || []).length}</p></CardContent></Card>
      </div>

      {/* Payment history table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Receipt className="h-4 w-4 text-primary" /> Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments && payments.length > 0 ? (
            <div className="overflow-auto">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right pr-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="pl-4 font-mono text-xs">{p.payment_date}</TableCell>
                      <TableCell className="font-medium text-sm">{p.customer_name}</TableCell>
                      <TableCell>
                        <Badge variant={p.payment_type === "invoice_payment" ? "default" : "secondary"} className="text-[10px]">
                          {p.payment_type === "invoice_payment" ? "Invoice" : "Advance"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs capitalize">{(p.payment_mode || "").replace("_", " ")}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{p.reference_number || "—"}</TableCell>
                      <TableCell className="text-right font-mono font-semibold text-sm text-emerald-600">{fmtINR(Number(p.amount || 0))}</TableCell>
                      <TableCell className="text-right pr-4">
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                          <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{p.status || "received"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-14 text-muted-foreground">
              <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No payments recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-emerald-600" /> Record Payment
            </DialogTitle>
          </DialogHeader>

          <Tabs value={paymentTab} onValueChange={v => setPaymentTab(v as any)} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="h-9 p-0.5 gap-1">
              <TabsTrigger value="invoice" className="text-xs gap-1.5 h-8"><FileText className="h-3 w-3" /> Invoice Payment</TabsTrigger>
              <TabsTrigger value="advance" className="text-xs gap-1.5 h-8"><Banknote className="h-3 w-3" /> Customer Advance</TabsTrigger>
            </TabsList>

            {/* ── Invoice Payment ────────────────────────────────── */}
            <TabsContent value="invoice" className="flex-1 overflow-y-auto mt-3 space-y-3 pr-1">
              {/* Customer */}
              <div className="space-y-1.5">
                <Label className="text-xs">Customer *</Label>
                <Select value={invoiceForm.customer_id} onValueChange={v => handleClientSelect(v, "invoice")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(clients || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount Received (₹) *</Label>
                  <Input className="h-9" type="number" value={invoiceForm.amount} onChange={e => setInvoiceForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bank Charges (₹)</Label>
                  <Input className="h-9" type="number" value={invoiceForm.bank_charges} onChange={e => setInvoiceForm(f => ({ ...f, bank_charges: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Date *</Label>
                  <Input className="h-9" type="date" value={invoiceForm.payment_date} onChange={e => setInvoiceForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference Number</Label>
                  <Input className="h-9" value={invoiceForm.reference_number} onChange={e => setInvoiceForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="UTR / Cheque No." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Mode</Label>
                  <Select value={invoiceForm.payment_mode} onValueChange={v => setInvoiceForm(f => ({ ...f, payment_mode: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tax Deducted (TDS) ₹</Label>
                  <Input className="h-9" type="number" value={invoiceForm.tax_deducted} onChange={e => setInvoiceForm(f => ({ ...f, tax_deducted: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit To Account</Label>
                  <Select value={invoiceForm.deposit_account} onValueChange={v => setInvoiceForm(f => ({ ...f, deposit_account: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit Reference</Label>
                  <Input className="h-9" value={invoiceForm.deposit_reference} onChange={e => setInvoiceForm(f => ({ ...f, deposit_reference: e.target.value }))} placeholder="Bank ref" />
                </div>
              </div>

              {/* Unpaid Invoices */}
              {invoiceForm.customer_name && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-3 py-2 text-xs font-semibold">Unpaid Invoices for {invoiceForm.customer_name}</div>
                  {unpaidInvoices && unpaidInvoices.length > 0 ? (
                    <div className="max-h-[160px] overflow-y-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="text-[10px]">
                            <TableHead className="w-8 pl-3"></TableHead>
                            <TableHead>Invoice</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Total</TableHead>
                            <TableHead className="text-right pr-3">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {unpaidInvoices.map(inv => (
                            <TableRow key={inv.id} className="cursor-pointer hover:bg-emerald-50/40" onClick={() => toggleInvoiceSelection(inv.id)}>
                              <TableCell className="pl-3">
                                <Checkbox checked={invoiceForm.selected_invoices.includes(inv.id)} />
                              </TableCell>
                              <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                              <TableCell className="text-xs">{inv.invoice_date}</TableCell>
                              <TableCell className="text-right font-mono text-xs">{fmtINR(Number(inv.total_amount))}</TableCell>
                              <TableCell className="text-right pr-3 font-mono text-xs font-semibold text-amber-600">{fmtINR(inv.balance)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-4 text-xs text-muted-foreground">No unpaid invoices found</div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea value={invoiceForm.notes} onChange={e => setInvoiceForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." rows={2} />
              </div>
            </TabsContent>

            {/* ── Customer Advance ───────────────────────────────── */}
            <TabsContent value="advance" className="flex-1 overflow-y-auto mt-3 space-y-3 pr-1">
              <div className="space-y-1.5">
                <Label className="text-xs">Customer *</Label>
                <Select value={advanceForm.customer_id} onValueChange={v => handleClientSelect(v, "advance")}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{(clients || []).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Place of Supply</Label>
                <Select value={advanceForm.place_of_supply} onValueChange={v => setAdvanceForm(f => ({ ...f, place_of_supply: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>{INDIAN_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Input className="h-9" value={advanceForm.description} onChange={e => setAdvanceForm(f => ({ ...f, description: e.target.value }))} placeholder="Advance for..." />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount (₹) *</Label>
                  <Input className="h-9" type="number" value={advanceForm.amount} onChange={e => setAdvanceForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bank Charges (₹)</Label>
                  <Input className="h-9" type="number" value={advanceForm.bank_charges} onChange={e => setAdvanceForm(f => ({ ...f, bank_charges: e.target.value }))} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Tax (₹)</Label>
                  <Input className="h-9" type="number" value={advanceForm.tax_amount} onChange={e => setAdvanceForm(f => ({ ...f, tax_amount: e.target.value }))} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Date *</Label>
                  <Input className="h-9" type="date" value={advanceForm.payment_date} onChange={e => setAdvanceForm(f => ({ ...f, payment_date: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Reference Number</Label>
                  <Input className="h-9" value={advanceForm.reference_number} onChange={e => setAdvanceForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="UTR / Cheque No." />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Payment Mode</Label>
                  <Select value={advanceForm.payment_mode} onValueChange={v => setAdvanceForm(f => ({ ...f, payment_mode: v }))}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Deposit To Account</Label>
                  <Select value={advanceForm.deposit_account} onValueChange={v => setAdvanceForm(f => ({ ...f, deposit_account: v }))}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>{(accounts || []).map(a => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Deposit Reference</Label>
                <Input className="h-9" value={advanceForm.deposit_reference} onChange={e => setAdvanceForm(f => ({ ...f, deposit_reference: e.target.value }))} placeholder="Bank ref" />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Notes</Label>
                <Textarea value={advanceForm.notes} onChange={e => setAdvanceForm(f => ({ ...f, notes: e.target.value }))} placeholder="Internal notes..." rows={2} />
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-3">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button
              onClick={paymentTab === "invoice" ? handleSaveInvoicePayment : handleSaveAdvance}
              disabled={isSaving}
              className="gap-2"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {isSaving ? "Saving..." : "Record Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

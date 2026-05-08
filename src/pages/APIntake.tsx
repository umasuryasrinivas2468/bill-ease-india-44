import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { processPurchaseBillInventory } from '@/services/inventoryAutomationService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Trash2, ScanLine, ArrowRight, ListChecks } from 'lucide-react';
import { useVendors } from '@/hooks/useVendors';
import CostCenterSelect from '@/components/CostCenterSelect';
import { classifyBillLines, type LineClassification } from '@/lib/billClassifier';
import { extractBillFromFile } from '@/utils/billOcr';
import { ensureInventoryItem } from '@/utils/expenseInventoryAutomation';
import {
  computeBillGst, stateNameFromGstin, STATE_CODE_MAP,
} from '@/lib/gstHelpers';
import { postPurchaseBillJournal } from '@/utils/autoJournalEntry';

/**
 * Unified AP Intake (Gap 2).
 *
 * One screen handles ALL incoming vendor-side spending. The classifier
 * (rules → inventory → vendor history → default) decides per line whether
 * it's inventory, expense, asset, or prepaid; then the form routes to the
 * right destination table:
 *   • At least one inventory line → purchase_bills (full bill flow)
 *   • All lines are expense / asset / prepaid → expenses (single-line each)
 *
 * The form supports OCR upload, RCM/ITC controls, cost-center tagging, and
 * the Draft → Pending Approval → Posted lifecycle.
 */

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

type IntakeLine = {
  id: string;
  description: string;
  hsn_sac: string;
  quantity: number;
  rate: number;
  tax_rate: number;
  amount: number;
  classification?: LineClassification;
};

const newLine = (): IntakeLine => ({
  id: `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  description: '',
  hsn_sac: '',
  quantity: 1,
  rate: 0,
  tax_rate: 18,
  amount: 0,
});

/**
 * Shape callers can pass via `navigate('/ap-intake', { state: { prefill: ... } })`
 * to seed the form. Used by Expense OCR Capture to hand off goods-detected
 * bills, but generic enough for any caller that already has parsed data.
 */
export interface APIntakePrefill {
  vendor_name?: string | null;
  vendor_gstin?: string | null;
  vendor_state?: string | null;
  bill_number?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  is_rcm?: boolean;
  items?: Array<{
    description?: string | null;
    hsn_sac?: string | null;
    quantity?: number | null;
    rate?: number | null;
    unit_price?: number | null;
    tax_rate?: number | null;
    amount?: number | null;
  }>;
  notes?: string | null;
}

const APIntake: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: vendors = [] } = useVendors();
  const prefillAppliedRef = useRef(false);

  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [vendorGstin, setVendorGstin] = useState('');
  const [vendorState, setVendorState] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(new Date().toISOString().split('T')[0]);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [paymentMode, setPaymentMode] = useState<'credit' | 'cash' | 'bank' | 'upi'>('credit');
  const [isRcm, setIsRcm] = useState(false);
  const [itcEligible, setItcEligible] = useState(true);
  const [vendorGstStatus, setVendorGstStatus] = useState<'registered'|'unregistered'|'composition'|'unknown'>('registered');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState('');
  const [department, setDepartment] = useState('');
  const [notes, setNotes] = useState('');
  const [submitMode, setSubmitMode] = useState<'draft' | 'pending_approval' | 'posted'>('posted');
  const [lines, setLines] = useState<IntakeLine[]>([newLine()]);
  const [classified, setClassified] = useState<IntakeLine[]>([]);
  const [headerClass, setHeaderClass] = useState<'goods'|'expense'|'mixed'|'asset'|'prepaid'>('expense');
  const [isOcrLoading, setOcrLoading] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const ocrInputRef = useRef<HTMLInputElement>(null);

  const totals = useMemo(() => {
    const taxable = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
    const tax     = lines.reduce((s, l) => s + Number(l.amount || 0) * Number(l.tax_rate || 0) / 100, 0);
    return { taxable, tax, total: taxable + tax };
  }, [lines]);

  // Re-classify whenever vendor or lines change.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!user?.id || lines.every(l => !l.description.trim())) {
        setClassified([]);
        return;
      }
      const result = await classifyBillLines(
        user.id,
        vendorId || null,
        lines.map(l => ({
          description: l.description,
          hsn_sac: l.hsn_sac,
          amount: l.amount,
        })),
      );
      if (cancelled) return;
      setClassified(lines.map((l, i) => ({ ...l, classification: result.lines[i]?.__classification })));
      setHeaderClass(result.header);
    };
    run();
    return () => { cancelled = true; };
  }, [user?.id, vendorId, JSON.stringify(lines.map(l => [l.description, l.hsn_sac, l.amount]))]);

  // Hydrate from `location.state.prefill` (e.g. handed off from Expense OCR
  // Capture when a bill is detected as a goods/inventory purchase). Runs once
  // per navigation so user edits are not overwritten.
  useEffect(() => {
    if (prefillAppliedRef.current) return;
    const prefill: APIntakePrefill | undefined = (location.state as any)?.prefill;
    if (!prefill) return;
    prefillAppliedRef.current = true;

    if (prefill.vendor_gstin) setVendorGstin(prefill.vendor_gstin.toUpperCase());
    if (prefill.vendor_state) setVendorState(prefill.vendor_state);
    if (prefill.vendor_name) setVendorName(prefill.vendor_name);
    if (prefill.bill_number) setBillNumber(prefill.bill_number);
    if (prefill.bill_date)   setBillDate(prefill.bill_date);
    if (prefill.due_date)    setDueDate(prefill.due_date);
    if (typeof prefill.is_rcm === 'boolean') setIsRcm(prefill.is_rcm);
    if (prefill.notes)       setNotes(prefill.notes);

    // Try to match a vendor in the dropdown by GSTIN, then by name (case-insensitive).
    const match: any = vendors.find((v: any) => {
      if (prefill.vendor_gstin && v.gst_number === prefill.vendor_gstin.toUpperCase()) return true;
      if (prefill.vendor_name && v.name?.toLowerCase() === prefill.vendor_name.toLowerCase()) return true;
      return false;
    });
    if (match) {
      handleVendorChange(match.id);
    }

    if (prefill.items && prefill.items.length > 0) {
      setLines(
        prefill.items.map((it) => {
          const qty = Number(it.quantity || 0) || 1;
          const rate = Number(it.rate ?? it.unit_price ?? 0) || 0;
          const amt = Number(it.amount ?? qty * rate) || qty * rate;
          return {
            ...newLine(),
            description: (it.description || '').trim(),
            hsn_sac: it.hsn_sac || '',
            quantity: qty,
            rate,
            tax_rate: Number(it.tax_rate || 0),
            amount: amt,
          };
        }),
      );
    }

    toast({
      title: 'Prefilled from OCR',
      description: prefill.items?.length
        ? `Loaded ${prefill.items.length} line item(s). Review and submit.`
        : 'Vendor and document details populated.',
    });

    // Clear the navigation state so a refresh does not re-prefill.
    navigate(location.pathname, { replace: true, state: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendors]);

  const handleVendorChange = (id: string) => {
    const v: any = vendors.find((x: any) => x.id === id);
    if (!v) { setVendorId(''); return; }
    const treat = (v.gst_treatment as string)?.toLowerCase();
    const status: typeof vendorGstStatus =
      treat === 'composition'   ? 'composition' :
      treat === 'unregistered' || !v.gst_number ? 'unregistered' :
      v.gst_number ? 'registered' : 'unknown';
    setVendorId(id);
    setVendorName(v.name || '');
    setVendorGstin(v.gst_number || '');
    setVendorState(stateNameFromGstin(v.gst_number) || v.state || '');
    setVendorGstStatus(status);
    setIsRcm(status === 'unregistered' || status === 'composition');
    setItcEligible(status !== 'composition');
  };

  const updateLine = (id: string, patch: Partial<IntakeLine>) => {
    setLines(prev => prev.map(l => {
      if (l.id !== id) return l;
      const next = { ...l, ...patch };
      next.amount = Number(next.quantity || 0) * Number(next.rate || 0);
      return next;
    }));
  };

  const handleOcr = async (file: File) => {
    setOcrLoading(true);
    try {
      const ext = await extractBillFromFile(file);
      const matched: any = vendors.find((v: any) =>
        (ext.vendor_gstin && v.gst_number && v.gst_number === ext.vendor_gstin) ||
        (ext.vendor_name && v.name?.toLowerCase() === ext.vendor_name.toLowerCase())
      );
      if (matched) handleVendorChange(matched.id);
      else if (ext.vendor_name) {
        setVendorName(ext.vendor_name);
        setVendorGstin(ext.vendor_gstin || '');
        setVendorState(ext.vendor_state || '');
      }
      setBillNumber(ext.bill_number || '');
      if (ext.bill_date) setBillDate(ext.bill_date);
      if (ext.due_date) setDueDate(ext.due_date);
      if (ext.is_rcm) setIsRcm(true);
      if (ext.buyer_state) setPlaceOfSupply(ext.buyer_state);

      if (ext.items && ext.items.length > 0) {
        setLines(ext.items.map(it => ({
          ...newLine(),
          description: it.description || '',
          hsn_sac: it.hsn_sac || '',
          quantity: Number(it.quantity) || 1,
          rate: Number(it.rate) || 0,
          tax_rate: Number(it.tax_rate) || 0,
          amount: Number(it.amount) || (Number(it.quantity) || 1) * (Number(it.rate) || 0),
        })));
      } else {
        setLines([{
          ...newLine(),
          description: ext.vendor_name ? `Bill from ${ext.vendor_name}` : 'OCR-extracted',
          rate:   Number(ext.taxable_amount) || Number(ext.total_amount) || 0,
          amount: Number(ext.taxable_amount) || Number(ext.total_amount) || 0,
        }]);
      }
      toast({ title: 'Bill scanned', description: matched ? `Linked vendor "${matched.name}"` : 'Vendor not matched — pick from list' });
    } catch (err: any) {
      toast({ title: 'OCR failed', description: err?.message || 'Could not read the bill', variant: 'destructive' });
    } finally {
      setOcrLoading(false);
      if (ocrInputRef.current) ocrInputRef.current.value = '';
    }
  };

  const isInventoryFlow = headerClass === 'goods' || headerClass === 'mixed';

  const submit = async () => {
    if (!user?.id) return;
    if (!vendorName.trim()) { toast({ title: 'Vendor name required', variant: 'destructive' }); return; }
    if (totals.total <= 0)  { toast({ title: 'Add at least one line item', variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const intra = vendorState && placeOfSupply
        ? vendorState.toLowerCase() === placeOfSupply.toLowerCase() : true;
      const tax = computeBillGst({
        taxable_amount: totals.taxable,
        gst_rate: totals.taxable > 0 ? (totals.tax / totals.taxable) * 100 : 0,
        seller_gstin: vendorGstin || null,
        seller_state: vendorState || null,
        place_of_supply: placeOfSupply || null,
        is_rcm: isRcm,
      });

      // Inventory or mixed → purchase_bills. Otherwise (pure expense / asset /
      // prepaid) → single expense row per line with the right classification.
      if (isInventoryFlow) {
        const billPayload: any = {
          user_id: user.id,
          vendor_id: vendorId || null,
          vendor_name: vendorName,
          vendor_gst_number: vendorGstin || null,
          bill_number: billNumber || `INTAKE-${Date.now().toString().slice(-6)}`,
          bill_date: billDate,
          due_date: dueDate,
          items: classified,
          amount: totals.taxable,
          gst_amount: totals.tax,
          total_amount: totals.total,
          status: 'pending',
          lifecycle_status: submitMode,
          classification: headerClass,
          asset_amount:   classified.filter(l => l.classification === 'asset').reduce((s, l) => s + l.amount, 0),
          prepaid_amount: classified.filter(l => l.classification === 'prepaid').reduce((s, l) => s + l.amount, 0),
          cost_center_id: costCenterId,
          project_id: projectId || null,
          department: department || null,
          is_rcm: isRcm,
          itc_eligible: itcEligible,
          itc_status: isRcm
            ? (itcEligible ? 'pending' : 'blocked')
            : (totals.tax > 0 ? (itcEligible ? 'pending' : 'blocked') : 'not_applicable'),
          vendor_gst_status: vendorGstStatus,
          place_of_supply: placeOfSupply || null,
          seller_state: vendorState || null,
          intra_state: intra,
          cgst_amount: tax.cgst,
          sgst_amount: tax.sgst,
          igst_amount: tax.igst,
          cess_amount: tax.cess,
          rcm_rate:   isRcm && totals.taxable > 0 ? Math.round((totals.tax / totals.taxable) * 10000) / 100 : 0,
          rcm_amount: tax.rcm_amount,
          notes,
        };
        const { data: bill, error } = await supabase.from('purchase_bills' as any)
          .insert([billPayload]).select().single();
        if (error) throw error;

        // Post inventory inward movements for any inventory-classified lines.
        // Find-or-create the matching `inventory` row by SKU/name/HSN; lines
        // that don't already exist (typical for OCR-extracted bills) get an
        // auto-created master row so stock-on-hand and average cost stay in
        // sync. Without this, OCR'd inventory lines are silently dropped by
        // `extractInventoryLines` because they have no product_id.
        const inventoryLines = classified.filter(l => l.classification === 'inventory');
        const inventoryItemsForPosting = await Promise.all(
          inventoryLines.map(async (l) => {
            const desc = (l.description || '').trim();
            const item = await ensureInventoryItem(
              user.id,
              {
                description: desc,
                hsn_sac: l.hsn_sac || null,
                quantity: l.quantity,
                unit: null,
                unit_price: l.rate,
                tax_rate: l.tax_rate,
                amount: l.amount,
              },
              { vendorId: vendorId || null },
            );
            return {
              product_id: item.id,
              description: desc,
              hsn_sac: l.hsn_sac,
              quantity: l.quantity,
              rate: l.rate,
              tax_rate: l.tax_rate,
              amount: l.amount,
            };
          }),
        );
        const inventoryItemsResolved = inventoryItemsForPosting.filter(i => i.product_id);
        let inventoryAmount = 0;
        if (inventoryItemsResolved.length > 0) {
          const result = await processPurchaseBillInventory(user.id, {
            id: bill.id,
            bill_number: bill.bill_number,
            bill_date: bill.bill_date,
            vendor_id: vendorId || null,
            vendor_name: vendorName,
            items: inventoryItemsResolved,
          });
          inventoryAmount = result.inventoryAmount;
        }

        // Only post the journal when lifecycle = posted. Drafts/pending stay
        // unposted; the journal is created on the eventual transition_bill('posted').
        if (submitMode === 'posted') {
          if (inventoryAmount === 0) {
            // Fallback: classifier-derived inventory amount when nothing was
            // physically tracked (e.g. items not in master).
            inventoryAmount = inventoryLines.reduce((s, l) => s + l.amount, 0);
          }
          await postPurchaseBillJournal(user.id, {
            bill_id: bill.id,
            bill_number: bill.bill_number,
            bill_date: bill.bill_date,
            vendor_name: bill.vendor_name,
            vendor_id: vendorId || undefined,
            amount: totals.taxable,
            gst_amount: totals.tax,
            total_amount: totals.total,
            inventory_amount: inventoryAmount,
            asset_amount:   billPayload.asset_amount,
            prepaid_amount: billPayload.prepaid_amount,
            is_rcm: isRcm,
            itc_eligible: itcEligible,
            cost_center_id: costCenterId || undefined,
            project_id: projectId || undefined,
            gst_split: { cgst: tax.cgst, sgst: tax.sgst, igst: tax.igst, cess: tax.cess },
          });
        }
        toast({ title: 'Bill saved', description: `${headerClass} bill created (${submitMode}).` });
        navigate('/payables');
      } else {
        // Pure expense / asset / prepaid path: one expense row per line.
        // The expenses table's payment_mode CHECK constraint allows
        // (cash, bank, credit_card, debit_card, upi, cheque) — but the
        // AP Intake selector includes 'credit' (= unpaid / creates AP). Map
        // 'credit' to 'bank' so the row is accepted; the unpaid status is
        // captured separately by the lifecycle/posted flags. Append the
        // "on credit" / form-notes context to the description so it survives
        // even on environments whose `expenses` table doesn't have a notes column.
        const expensePaymentMode = paymentMode === 'credit' ? 'bank' : paymentMode;
        const ctxBits = [paymentMode === 'credit' ? 'On credit (creates AP)' : null, notes?.trim() || null]
          .filter(Boolean);
        for (const l of classified) {
          const description = ctxBits.length
            ? `${l.description} — ${ctxBits.join(' | ')}`
            : l.description;
          const expensePayload: any = {
            user_id: user.id,
            vendor_id: vendorId || null,
            vendor_name: vendorName,
            description,
            category_name: l.classification === 'asset' ? 'Fixed Asset Purchase'
                          : l.classification === 'prepaid' ? 'Prepaid Expense'
                          : 'Operating Expense',
            expense_date: billDate,
            amount: l.amount,
            tax_amount: l.amount * (l.tax_rate || 0) / 100,
            total_amount: l.amount * (1 + (l.tax_rate || 0) / 100),
            payment_mode: expensePaymentMode,
            is_rcm: isRcm,
            itc_eligible: itcEligible,
            vendor_gst_status: vendorGstStatus,
            cost_center_id: costCenterId,
            project_id: projectId || null,
            department: department || null,
            lifecycle_status: submitMode,
            status: submitMode === 'posted' ? 'posted' : 'draft',
            posted_to_ledger: false,
          };
          const { data: created, error } = await supabase.from('expenses')
            .insert([expensePayload]).select().single();
          if (error) throw error;

          if (submitMode === 'posted') {
            const { postExpenseToLedger } = await import('@/utils/journalPosting');
            await postExpenseToLedger(user.id, {
              id: created.id,
              expense_date: created.expense_date,
              vendor_name: created.vendor_name,
              vendor_id: vendorId || undefined,
              category_name: created.category_name,
              amount: Number(created.amount),
              tax_amount: Number(created.tax_amount || 0),
              payment_mode: created.payment_mode,
              description: created.description || '',
              is_rcm: isRcm,
              itc_eligible: itcEligible,
              cost_center_id: costCenterId || undefined,
              project_id: projectId || undefined,
            });
          }
        }
        toast({ title: 'Expenses saved', description: `${classified.length} expense line(s) (${submitMode}).` });
        navigate('/expenses');
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Save failed', description: err?.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">AP Intake</h1>
          <p className="text-muted-foreground">
            Single entry point for vendor spending. Auto-classifies into
            inventory, expense, asset or prepaid based on item + vendor history.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={ocrInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleOcr(f); }}
          />
          <Button variant="outline" onClick={() => ocrInputRef.current?.click()} disabled={isOcrLoading}>
            <ScanLine className="mr-2 h-4 w-4" />
            {isOcrLoading ? 'Scanning…' : 'Scan Bill'}
          </Button>
        </div>
      </div>

      {/* Vendor + dates */}
      <Card>
        <CardHeader><CardTitle>Vendor &amp; Document</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Vendor</Label>
            <Select value={vendorId || undefined} onValueChange={handleVendorChange}>
              <SelectTrigger><SelectValue placeholder="Choose vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bill / Invoice #</Label>
            <Input value={billNumber} onChange={e => setBillNumber(e.target.value)} placeholder="Optional — auto if blank" />
          </div>
          <div>
            <Label>Bill Date</Label>
            <Input type="date" value={billDate} onChange={e => setBillDate(e.target.value)} />
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>Place of Supply</Label>
            <Select value={placeOfSupply || undefined} onValueChange={setPlaceOfSupply}>
              <SelectTrigger><SelectValue placeholder="Buyer state" /></SelectTrigger>
              <SelectContent className="max-h-60 overflow-y-auto">
                {Object.values(STATE_CODE_MAP).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Payment Mode</Label>
            <Select value={paymentMode} onValueChange={(v: any) => setPaymentMode(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">On credit (creates AP)</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
                <SelectItem value="upi">UPI</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Line Items</span>
            <Badge variant="outline">{headerClass}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>HSN/SAC</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Tax %</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Class.</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => {
                  const c = classified.find(x => x.id === l.id)?.classification;
                  return (
                    <TableRow key={l.id}>
                      <TableCell><Input value={l.description} onChange={e => updateLine(l.id, { description: e.target.value })} /></TableCell>
                      <TableCell><Input value={l.hsn_sac} onChange={e => updateLine(l.id, { hsn_sac: e.target.value })} className="w-24" /></TableCell>
                      <TableCell><Input type="number" value={l.quantity} onChange={e => updateLine(l.id, { quantity: Number(e.target.value) })} className="w-20" /></TableCell>
                      <TableCell><Input type="number" value={l.rate} onChange={e => updateLine(l.id, { rate: Number(e.target.value) })} className="w-24" /></TableCell>
                      <TableCell><Input type="number" value={l.tax_rate} onChange={e => updateLine(l.id, { tax_rate: Number(e.target.value) })} className="w-16" /></TableCell>
                      <TableCell className="font-medium">{inr(l.amount)}</TableCell>
                      <TableCell>
                        {c && <Badge variant={c === 'inventory' ? 'default' : 'secondary'}>{c}</Badge>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setLines(prev => prev.filter(x => x.id !== l.id))} disabled={lines.length === 1}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Button variant="outline" onClick={() => setLines(prev => [...prev, newLine()])}>
              <Plus className="mr-2 h-4 w-4" />Add Line
            </Button>
            <div className="text-sm space-y-1">
              <div>Taxable: <span className="font-medium">{inr(totals.taxable)}</span></div>
              <div>Tax: <span className="font-medium">{inr(totals.tax)}</span></div>
              <div className="text-base font-bold">Total: {inr(totals.total)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GST + Tagging */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>GST / RCM / ITC</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Vendor GST status</Label>
                <Select value={vendorGstStatus} onValueChange={(v: any) => setVendorGstStatus(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="registered">Registered</SelectItem>
                    <SelectItem value="unregistered">Unregistered</SelectItem>
                    <SelectItem value="composition">Composition</SelectItem>
                    <SelectItem value="unknown">Unknown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Seller state</Label>
                <Input value={vendorState} onChange={e => setVendorState(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={isRcm} onCheckedChange={setIsRcm} />
                <Label>RCM</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={itcEligible} onCheckedChange={setItcEligible} />
                <Label>ITC eligible</Label>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {vendorState && placeOfSupply
                ? (vendorState.toLowerCase() === placeOfSupply.toLowerCase()
                    ? 'Intra-state (CGST + SGST)'
                    : 'Inter-state (IGST)')
                : 'Tax split defaults to intra-state until both states are set'}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Cost Center / Project</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Cost Center</Label>
              <CostCenterSelect value={costCenterId} onChange={setCostCenterId} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Project ID</Label>
                <Input value={projectId} onChange={e => setProjectId(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Department</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Submit */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Label className="font-medium">Save as</Label>
            <Select value={submitMode} onValueChange={(v: any) => setSubmitMode(v)}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_approval">Pending Approval</SelectItem>
                <SelectItem value="posted">Posted (auto-post journal)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/payables')}>Cancel</Button>
            <Button onClick={submit} disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : (
                <>{isInventoryFlow ? 'Create Bill' : 'Create Expenses'}<ArrowRight className="ml-2 h-4 w-4" /></>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild variant="ghost">
          <a href="/ap-dashboard"><ListChecks className="mr-2 h-4 w-4" />View AP Dashboard</a>
        </Button>
      </div>
    </div>
  );
};

export default APIntake;

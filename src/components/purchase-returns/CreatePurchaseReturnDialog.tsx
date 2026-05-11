import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { PurchaseBill } from '@/hooks/usePurchaseBills';
import {
  useCreatePurchaseReturn,
  useApprovePurchaseReturn,
  useReturnedQuantitiesForBill,
} from '@/hooks/usePurchaseReturns';
import type { PurchaseReturnCondition, PurchaseReturnOutcome } from '@/services/purchaseReturnService';
import { AlertCircle } from 'lucide-react';

interface Props {
  bill: PurchaseBill | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RowState {
  product_id: string | null;
  product_name: string;
  hsn_sac?: string;
  uom?: string;
  purchased_qty: number;
  already_returned: number;
  returnable: number;
  rate: number;
  gst_rate: number;
  return_qty: string;
  condition: PurchaseReturnCondition;
  notes: string;
}

const buildInitialRows = (bill: PurchaseBill | null, alreadyReturned: Record<string, number>): RowState[] => {
  if (!bill) return [];
  const lines: any[] = bill.items || [];
  const byKey = new Map<string, RowState>();
  for (const li of lines) {
    if (li?.__tax_meta) continue;
    const pid = li.product_id || li.inventory_item_id || li.item_id || null;
    const key = pid || `name:${li.description || li.product_name || li.name || 'item'}`;
    const qty = Number(li.quantity || 0);
    const rate = Number(li.rate || li.price || li.unit_cost || li.purchase_price || 0);
    const gst = Number(li.gst_rate || 0);
    const already = pid ? Number(alreadyReturned[pid] || 0) : 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.purchased_qty += qty;
      existing.returnable = Math.max(existing.purchased_qty - existing.already_returned, 0);
    } else {
      byKey.set(key, {
        product_id: pid,
        product_name: li.description || li.product_name || li.name || 'Item',
        hsn_sac: li.hsn_sac,
        uom: li.uom,
        purchased_qty: qty,
        already_returned: already,
        returnable: Math.max(qty - already, 0),
        rate,
        gst_rate: gst,
        return_qty: '',
        condition: 'defective',
        notes: '',
      });
    }
  }
  return Array.from(byKey.values());
};

const CreatePurchaseReturnDialog: React.FC<Props> = ({ bill, open, onOpenChange }) => {
  const { toast } = useToast();
  const { data: alreadyReturned = {}, isLoading: loadingReturned } =
    useReturnedQuantitiesForBill(bill?.id ?? null);

  const createReturn = useCreatePurchaseReturn();
  const approveReturn = useApprovePurchaseReturn();

  const [rows, setRows] = useState<RowState[]>([]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState<PurchaseReturnOutcome>('adjustment');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [approveOnSubmit, setApproveOnSubmit] = useState(true);

  useEffect(() => {
    if (open && bill) {
      setRows(buildInitialRows(bill, alreadyReturned));
      setReason('');
      setNotes('');
      setOutcome('adjustment');
      setReturnDate(new Date().toISOString().split('T')[0]);
      setApproveOnSubmit(true);
    }
  }, [open, bill, alreadyReturned]);

  const totals = useMemo(() => {
    let sub = 0, gst = 0;
    for (const r of rows) {
      const qty = Number(r.return_qty) || 0;
      if (qty <= 0) continue;
      const amount = qty * r.rate;
      sub += amount;
      gst += amount * (r.gst_rate || 0) / 100;
    }
    return { sub: Number(sub.toFixed(2)), gst: Number(gst.toFixed(2)), total: Number((sub + gst).toFixed(2)) };
  }, [rows]);

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const setMaxQty = (idx: number) => updateRow(idx, { return_qty: String(rows[idx].returnable) });

  const validate = (): string | null => {
    if (!bill) return 'No bill selected';
    const selected = rows.filter((r) => Number(r.return_qty) > 0);
    if (selected.length === 0) return 'Enter at least one return quantity';
    for (const r of selected) {
      const qty = Number(r.return_qty);
      if (qty <= 0) return `Invalid quantity for ${r.product_name}`;
      if (qty > r.returnable + 1e-6) {
        return `${r.product_name}: cannot return ${qty} (max ${r.returnable})`;
      }
    }
    if (!reason.trim()) return 'Reason is required';
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast({ title: 'Cannot create return', description: err, variant: 'destructive' });
      return;
    }
    if (!bill) return;

    const items = rows
      .filter((r) => Number(r.return_qty) > 0)
      .map((r) => ({
        product_id: r.product_id,
        product_name: r.product_name,
        hsn_sac: r.hsn_sac,
        uom: r.uom,
        quantity: Number(r.return_qty),
        rate: r.rate,
        gst_rate: r.gst_rate,
        condition: r.condition,
        notes: r.notes || undefined,
      }));

    try {
      const created = await createReturn.mutateAsync({
        bill_id: bill.id,
        return_date: returnDate,
        reason,
        notes: notes || undefined,
        outcome,
        items,
      });

      if (approveOnSubmit) {
        await approveReturn.mutateAsync(created.id);
        toast({
          title: 'Purchase return approved',
          description: `${created.return_number} — debit note issued, inventory & ledgers updated.`,
        });
      } else {
        toast({
          title: 'Draft return created',
          description: `${created.return_number} — approve to apply inventory and accounting changes.`,
        });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: 'Purchase return failed',
        description: e?.message || 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const isPending = createReturn.isPending || approveReturn.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Purchase Return</DialogTitle>
          <DialogDescription>
            {bill && (
              <>
                Returning items against bill <span className="font-medium">{bill.bill_number}</span>{' '}
                from <span className="font-medium">{bill.vendor_name}</span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {bill && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Return Date</Label>
                <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
              </div>
              <div>
                <Label>Outcome</Label>
                <Select value={outcome} onValueChange={(v) => setOutcome(v as PurchaseReturnOutcome)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="adjustment">Apply to bill balance</SelectItem>
                    <SelectItem value="refund">Refundable advance from vendor</SelectItem>
                    <SelectItem value="replacement">Replacement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason *</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. defective batch, wrong item shipped" />
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Items to return</Label>
              {loadingReturned ? (
                <div className="text-sm text-muted-foreground py-2">Loading returnable quantities…</div>
              ) : null}
              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Purchased</TableHead>
                      <TableHead className="text-right">Already Returned</TableHead>
                      <TableHead className="text-right">Returnable</TableHead>
                      <TableHead className="w-28">Return Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">GST %</TableHead>
                      <TableHead className="w-36">Reason</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No items found on this bill.</TableCell></TableRow>
                    ) : (
                      rows.map((row, idx) => {
                        const qty = Number(row.return_qty) || 0;
                        const amount = qty * row.rate;
                        const gstAmt = amount * (row.gst_rate || 0) / 100;
                        const over = qty > row.returnable + 1e-6;
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <div className="font-medium">{row.product_name}</div>
                              {row.product_id ? null : (
                                <Badge variant="outline" className="text-xs mt-1">No product_id — qty check skipped</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">{row.purchased_qty}</TableCell>
                            <TableCell className="text-right">{row.already_returned || 0}</TableCell>
                            <TableCell className="text-right font-medium">{row.returnable}</TableCell>
                            <TableCell>
                              <div className="flex gap-1 items-center">
                                <Input
                                  type="number"
                                  min={0}
                                  max={row.returnable}
                                  step="any"
                                  value={row.return_qty}
                                  onChange={(e) => updateRow(idx, { return_qty: e.target.value })}
                                  className={over ? 'border-red-500' : ''}
                                />
                                <Button variant="ghost" size="sm" type="button" onClick={() => setMaxQty(idx)} className="px-2 text-xs">
                                  Max
                                </Button>
                              </div>
                              {over && (
                                <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Exceeds returnable
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">₹{row.rate.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{row.gst_rate}%</TableCell>
                            <TableCell>
                              <Select
                                value={row.condition}
                                onValueChange={(v) => updateRow(idx, { condition: v as PurchaseReturnCondition })}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="defective">Defective</SelectItem>
                                  <SelectItem value="damaged">Damaged in transit</SelectItem>
                                  <SelectItem value="wrong_item">Wrong item</SelectItem>
                                  <SelectItem value="excess">Excess delivery</SelectItem>
                                  <SelectItem value="expired">Expired</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-right">
                              <div>₹{amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                              <div className="text-xs text-muted-foreground">GST ₹{gstAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional internal notes"
                rows={2}
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-4 bg-muted/30 rounded-md p-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="approve-now-pr"
                  checked={approveOnSubmit}
                  onChange={(e) => setApproveOnSubmit(e.target.checked)}
                />
                <Label htmlFor="approve-now-pr" className="cursor-pointer">
                  Approve immediately (issue debit note, reduce inventory, post journals)
                </Label>
              </div>
              <div className="text-right space-y-1 text-sm">
                <div>Subtotal: <span className="font-medium">₹{totals.sub.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div>GST: <span className="font-medium">₹{totals.gst.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="text-base">Total Return: <span className="font-semibold">₹{totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="orange" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Processing…' : approveOnSubmit ? 'Create & Approve' : 'Save as Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePurchaseReturnDialog;

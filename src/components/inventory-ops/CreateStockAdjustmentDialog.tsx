import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useInventory } from '@/hooks/useInventory';
import {
  useCreateStockAdjustment,
  useApproveStockAdjustment,
} from '@/hooks/useStockAdjustments';
import type { AdjustmentLineType } from '@/services/stockAdjustmentService';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LineState {
  product_id: string;
  product_name: string;
  quantity_delta: string;   // signed
  unit_cost: string;
  adjustment_type: AdjustmentLineType;
  notes: string;
}

const CreateStockAdjustmentDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const { data: inventory = [] } = useInventory();
  const createAdj = useCreateStockAdjustment();
  const approveAdj = useApproveStockAdjustment();

  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([]);
  const [approveOnSubmit, setApproveOnSubmit] = useState(true);

  useEffect(() => {
    if (open) {
      setAdjustmentDate(new Date().toISOString().split('T')[0]);
      setReason(''); setNotes(''); setLines([]); setApproveOnSubmit(true);
    }
  }, [open]);

  const goodsItems = useMemo(() => inventory.filter((i: any) => i.type === 'goods'), [inventory]);

  const addLine = () => setLines((prev) => [...prev, {
    product_id: '', product_name: '', quantity_delta: '', unit_cost: '', adjustment_type: 'damaged', notes: '',
  }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const onPickProduct = (idx: number, pid: string) => {
    const it: any = goodsItems.find((i: any) => i.id === pid);
    if (!it) return;
    updateLine(idx, { product_id: pid, product_name: it.product_name, unit_cost: String(it.average_cost ?? it.purchase_price ?? 0) });
  };

  const totals = useMemo(() => {
    let val = 0;
    for (const l of lines) {
      const q = Number(l.quantity_delta) || 0;
      const c = Number(l.unit_cost) || 0;
      val += q * c;
    }
    return { val: Number(val.toFixed(2)) };
  }, [lines]);

  const validate = (): string | null => {
    if (!reason.trim()) return 'Reason is required';
    if (lines.length === 0) return 'Add at least one line';
    for (const l of lines) {
      if (!l.product_id) return 'Pick a product on every line';
      if (!Number(l.quantity_delta)) return `Quantity delta required for ${l.product_name || 'item'}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ title: 'Cannot create adjustment', description: err, variant: 'destructive' }); return; }
    try {
      const created = await createAdj.mutateAsync({
        adjustment_date: adjustmentDate,
        reason,
        notes: notes || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id,
          product_name: l.product_name,
          quantity_delta: Number(l.quantity_delta),
          unit_cost: Number(l.unit_cost) || undefined,
          adjustment_type: l.adjustment_type,
          notes: l.notes || undefined,
        })),
      });
      if (approveOnSubmit) {
        await approveAdj.mutateAsync(created.id);
        toast({ title: 'Adjustment posted', description: `${created.adjustment_number} — inventory & journal updated.` });
      } else {
        toast({ title: 'Draft adjustment created', description: created.adjustment_number });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Adjustment failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const isPending = createAdj.isPending || approveAdj.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Stock Adjustment</DialogTitle>
          <DialogDescription>
            Record damaged / expired / write-off / recount changes. Auto-posts inventory_adjustment journal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Adjustment Date</Label>
              <Input type="date" value={adjustmentDate} onChange={(e) => setAdjustmentDate(e.target.value)} />
            </div>
            <div>
              <Label>Reason *</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. monthly recount, fire loss" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add line</Button>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="w-28">Qty Delta (±)</TableHead>
                    <TableHead className="w-28">Unit Cost</TableHead>
                    <TableHead className="w-36">Type</TableHead>
                    <TableHead className="text-right">Value Delta</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No lines yet. Click "Add line".</TableCell></TableRow>
                  ) : lines.map((l, idx) => {
                    const v = (Number(l.quantity_delta) || 0) * (Number(l.unit_cost) || 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell>
                          <Select value={l.product_id} onValueChange={(v) => onPickProduct(idx, v)}>
                            <SelectTrigger><SelectValue placeholder="Pick item" /></SelectTrigger>
                            <SelectContent className="max-h-[260px]">
                              {goodsItems.map((it: any) => (
                                <SelectItem key={it.id} value={it.id}>
                                  {it.product_name} (stock: {Number(it.stock_quantity || 0)})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" step="any" value={l.quantity_delta} onChange={(e) => updateLine(idx, { quantity_delta: e.target.value })} placeholder="e.g. -5 or 3" />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="any" value={l.unit_cost} onChange={(e) => updateLine(idx, { unit_cost: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Select value={l.adjustment_type} onValueChange={(v) => updateLine(idx, { adjustment_type: v as AdjustmentLineType })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="damaged">Damaged</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                              <SelectItem value="write_off">Write-off</SelectItem>
                              <SelectItem value="found">Found</SelectItem>
                              <SelectItem value="recount">Recount</SelectItem>
                              <SelectItem value="manual">Manual</SelectItem>
                              <SelectItem value="opening">Opening</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className={`text-right ${v < 0 ? 'text-red-600' : v > 0 ? 'text-green-700' : ''}`}>
                          ₹{v.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Button size="icon" variant="ghost" onClick={() => removeLine(idx)}><Trash2 className="h-3 w-3" /></Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-4 bg-muted/30 rounded-md p-4">
            <div className="flex items-center gap-3">
              <input type="checkbox" id="approve-now-adj" checked={approveOnSubmit} onChange={(e) => setApproveOnSubmit(e.target.checked)} />
              <Label htmlFor="approve-now-adj" className="cursor-pointer">Approve & post immediately</Label>
            </div>
            <div className="text-right space-y-1 text-sm">
              <div className="text-base">Net Value Delta: <span className={`font-semibold ${totals.val < 0 ? 'text-red-600' : totals.val > 0 ? 'text-green-700' : ''}`}>
                ₹{totals.val.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="orange" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Processing…' : approveOnSubmit ? 'Create & Post' : 'Save as Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateStockAdjustmentDialog;

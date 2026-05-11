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
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId } from '@/lib/userUtils';
import {
  useCreateWarehouseTransfer,
  useApproveWarehouseTransfer,
} from '@/hooks/useWarehouseTransfers';
import { Plus, Trash2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LineState {
  product_id: string;
  product_name: string;
  quantity: string;
  unit_cost: string;
  uom: string;
  notes: string;
}

const useWarehouses = () => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery({
    queryKey: ['warehouses', uid],
    queryFn: async () => {
      const { data } = await supabase
        .from('warehouses' as any)
        .select('id, name, code, is_default')
        .eq('user_id', uid!)
        .eq('is_active', true)
        .order('is_default', { ascending: false });
      return (data || []) as any[];
    },
    enabled: !!user,
  });
};

const CreateWarehouseTransferDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const { data: warehouses = [] } = useWarehouses();
  const { data: inventory = [] } = useInventory();
  const createTransfer = useCreateWarehouseTransfer();
  const approveTransfer = useApproveWarehouseTransfer();

  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineState[]>([]);
  const [approveOnSubmit, setApproveOnSubmit] = useState(true);

  useEffect(() => {
    if (open) {
      setFromId(''); setToId(''); setReason(''); setNotes('');
      setTransferDate(new Date().toISOString().split('T')[0]);
      setLines([]);
      setApproveOnSubmit(true);
    }
  }, [open]);

  const goodsItems = useMemo(
    () => inventory.filter((i: any) => i.type === 'goods'),
    [inventory],
  );

  const addLine = () => setLines((prev) => [...prev, { product_id: '', product_name: '', quantity: '', unit_cost: '', uom: 'pcs', notes: '' }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));
  const updateLine = (idx: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  const onPickProduct = (idx: number, productId: string) => {
    const item: any = goodsItems.find((i: any) => i.id === productId);
    if (!item) return;
    updateLine(idx, {
      product_id: productId,
      product_name: item.product_name,
      unit_cost: String(item.average_cost ?? item.purchase_price ?? 0),
      uom: item.uom ?? 'pcs',
    });
  };

  const totals = useMemo(() => {
    let qty = 0, val = 0;
    for (const l of lines) {
      const q = Number(l.quantity) || 0;
      const c = Number(l.unit_cost) || 0;
      qty += q;
      val += q * c;
    }
    return { qty, val: Number(val.toFixed(2)) };
  }, [lines]);

  const validate = (): string | null => {
    if (!fromId) return 'Source warehouse required';
    if (!toId) return 'Destination warehouse required';
    if (fromId === toId) return 'Source and destination must differ';
    if (lines.length === 0) return 'Add at least one line';
    for (const l of lines) {
      if (!l.product_id) return 'Pick a product on every line';
      if (!Number(l.quantity) || Number(l.quantity) <= 0) return `Invalid quantity for ${l.product_name || 'item'}`;
    }
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) { toast({ title: 'Cannot create transfer', description: err, variant: 'destructive' }); return; }
    try {
      const created = await createTransfer.mutateAsync({
        from_warehouse_id: fromId,
        to_warehouse_id: toId,
        transfer_date: transferDate,
        reason: reason || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({
          product_id: l.product_id,
          product_name: l.product_name,
          quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost),
          uom: l.uom,
          notes: l.notes || undefined,
        })),
      });
      if (approveOnSubmit) {
        await approveTransfer.mutateAsync(created.id);
        toast({ title: 'Transfer received', description: `${created.transfer_number} — stock moved between warehouses.` });
      } else {
        toast({ title: 'Draft transfer created', description: created.transfer_number });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Transfer failed', description: e?.message || 'Unknown error', variant: 'destructive' });
    }
  };

  const isPending = createTransfer.isPending || approveTransfer.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Warehouse Transfer</DialogTitle>
          <DialogDescription>Move stock between warehouses. No P&L impact for same-GSTIN transfers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>From Warehouse</Label>
              <Select value={fromId} onValueChange={setFromId}>
                <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Warehouse</Label>
              <Select value={toId} onValueChange={setToId}>
                <SelectTrigger><SelectValue placeholder="Destination" /></SelectTrigger>
                <SelectContent>
                  {warehouses.filter((w: any) => w.id !== fromId).map((w: any) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Transfer Date</Label>
              <Input type="date" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. branch rebalance, restock" />
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
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-28">Unit Cost</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No lines yet. Click "Add line".</TableCell></TableRow>
                  ) : lines.map((l, idx) => {
                    const total = (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0);
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
                          <Input type="number" min={0} step="any" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: e.target.value })} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="any" value={l.unit_cost} onChange={(e) => updateLine(idx, { unit_cost: e.target.value })} />
                        </TableCell>
                        <TableCell className="text-right">₹{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TableCell>
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
              <input type="checkbox" id="approve-now-wt" checked={approveOnSubmit} onChange={(e) => setApproveOnSubmit(e.target.checked)} />
              <Label htmlFor="approve-now-wt" className="cursor-pointer">Mark as received immediately (book the movements now)</Label>
            </div>
            <div className="text-right space-y-1 text-sm">
              <div>Qty: <span className="font-medium">{totals.qty}</span></div>
              <div className="text-base">Value: <span className="font-semibold">₹{totals.val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button variant="orange" onClick={handleSubmit} disabled={isPending}>
            {isPending ? 'Processing…' : approveOnSubmit ? 'Create & Receive' : 'Save as Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWarehouseTransferDialog;

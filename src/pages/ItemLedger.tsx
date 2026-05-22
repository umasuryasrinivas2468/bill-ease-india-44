import React, { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ArrowLeft, ArrowDown, ArrowUp, Boxes } from 'lucide-react';
import { useItemMovementLedger } from '@/hooks/useInventoryMIS';
import { useInventory } from '@/hooks/useInventory';
import { useAssetCategories } from '@/hooks/useFixedAssets';
import { useConvertInventoryToAsset } from '@/hooks/useInventoryToAsset';
import type { DepreciationMethod } from '@/types/fixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const movementColour = (t: string) => {
  const inward = ['purchase', 'sales_return', 'adjustment_in', 'transfer_in', 'opening'];
  return inward.includes(t) ? 'text-green-700' : 'text-red-600';
};

const ItemLedger: React.FC = () => {
  const { itemId } = useParams<{ itemId: string }>();
  const navigate = useNavigate();
  const { data: rows = [], isLoading } = useItemMovementLedger(itemId ?? null);
  const { data: inventory = [] } = useInventory();
  const { data: categories = [] } = useAssetCategories();
  const convertToAsset = useConvertInventoryToAsset();

  const item = useMemo(
    () => inventory.find((i: any) => i.id === itemId),
    [inventory, itemId],
  );

  const [convertOpen, setConvertOpen] = useState(false);
  const [convert, setConvert] = useState({
    quantity: 1,
    asset_name: '',
    category_id: '',
    depreciation_method: 'SLM' as DepreciationMethod,
    useful_life_years: 5,
    salvage_value: 0,
    location: '',
    custodian: '',
    serial_number: '',
    notes: '',
    unit_cost_override: '',
  });
  React.useEffect(() => {
    if (item && convertOpen && !convert.asset_name) {
      setConvert((c) => ({ ...c, asset_name: (item as any).product_name || '' }));
    }
  }, [item, convertOpen]);

  const submitConvert = () => {
    if (!itemId) return;
    convertToAsset.mutate(
      {
        item_id: itemId,
        quantity: Number(convert.quantity || 0),
        asset_name: convert.asset_name || undefined,
        category_id: convert.category_id || undefined,
        depreciation_method: convert.depreciation_method,
        useful_life_years: Number(convert.useful_life_years) || undefined,
        salvage_value: Number(convert.salvage_value) || 0,
        location: convert.location || undefined,
        custodian: convert.custodian || undefined,
        serial_number: convert.serial_number || undefined,
        notes: convert.notes || undefined,
        unit_cost_override: convert.unit_cost_override === ''
          ? undefined
          : Number(convert.unit_cost_override),
      },
      {
        onSuccess: (result) => {
          setConvertOpen(false);
          navigate(`/assets/${result.asset.id}`);
        },
      },
    );
  };

  const currentStock = Number((item as any)?.stock_quantity || 0);
  const avgCost = Number((item as any)?.average_cost || 0);
  const previewCost = Number(convert.unit_cost_override || avgCost);
  const previewTotal = previewCost * Number(convert.quantity || 0);

  const summary = useMemo(() => {
    let totalIn = 0, totalOut = 0;
    for (const r of rows) {
      totalIn += Number(r.quantity_in || 0);
      totalOut += Number(r.quantity_out || 0);
    }
    const last = rows[rows.length - 1];
    return {
      totalIn,
      totalOut,
      runningQty: last?.running_qty ?? 0,
      runningValue: last?.running_value ?? 0,
      txnCount: rows.length,
    };
  }, [rows]);

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <Button asChild variant="ghost" size="sm">
          <Link to="/inventory/dashboard"><ArrowLeft className="h-4 w-4 mr-2" />Back to Inventory MIS</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">{(item as any)?.product_name || 'Item Ledger'}</h1>
          <p className="text-muted-foreground">
            {(item as any)?.sku && <span className="font-mono">SKU: {(item as any).sku}</span>}
            {(item as any)?.category && <span> · {(item as any).category}</span>}
            {(item as any)?.hsn_sac && <span> · HSN {(item as any).hsn_sac}</span>}
          </p>
        </div>
        {currentStock > 0 && (
          <Button variant="outline" onClick={() => setConvertOpen(true)}>
            <Boxes className="h-4 w-4 mr-2" />
            Convert to Fixed Asset
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Movements</div>
          <div className="text-2xl font-semibold">{summary.txnCount}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Total In</div>
          <div className="text-2xl font-semibold text-green-700">{summary.totalIn}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Total Out</div>
          <div className="text-2xl font-semibold text-red-600">{summary.totalOut}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Current Stock</div>
          <div className="text-2xl font-semibold">{Number(summary.runningQty)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Stock Value</div>
          <div className="text-2xl font-semibold">{inr(summary.runningValue)}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Movement Ledger</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No movements yet for this item.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Party</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right">In</TableHead>
                    <TableHead className="text-right">Out</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Running Qty</TableHead>
                    <TableHead className="text-right">Running Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap">{r.movement_date}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${movementColour(r.movement_type)}`}>
                          {Number(r.quantity_in || 0) > 0 ? <ArrowDown className="h-3 w-3 inline mr-1" /> : <ArrowUp className="h-3 w-3 inline mr-1" />}
                          {String(r.movement_type).replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.source_number || '—'}</TableCell>
                      <TableCell>{r.party_name || '—'}</TableCell>
                      <TableCell>{r.warehouse_name || '—'}</TableCell>
                      <TableCell className="text-right text-green-700">
                        {Number(r.quantity_in || 0) > 0 ? Number(r.quantity_in) : ''}
                      </TableCell>
                      <TableCell className="text-right text-red-600">
                        {Number(r.quantity_out || 0) > 0 ? Number(r.quantity_out) : ''}
                      </TableCell>
                      <TableCell className="text-right">{inr(r.unit_cost)}</TableCell>
                      <TableCell className="text-right font-medium">{Number(r.running_qty || 0)}</TableCell>
                      <TableCell className="text-right">{inr(r.running_value)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Convert inventory to fixed asset</DialogTitle>
            <DialogDescription>
              Move units out of stock and capitalize them into the Fixed Asset register.
              The conversion posts <strong>Dr Fixed Asset / Cr Inventory</strong> at the
              valued cost. GST already booked on the original purchase isn't touched.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Current stock</span><strong>{currentStock} {(item as any)?.unit || 'units'}</strong></div>
              <div className="flex justify-between"><span>Average cost</span><span>{inr(avgCost)}</span></div>
              <div className="flex justify-between"><span>Stock value</span><span>{inr((item as any)?.stock_value || 0)}</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantity to convert</Label>
                <Input
                  type="number"
                  min={0.0001}
                  step="0.0001"
                  max={currentStock}
                  value={convert.quantity || ''}
                  onChange={(e) => setConvert({ ...convert, quantity: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Unit cost (defaults to avg)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={convert.unit_cost_override}
                  onChange={(e) => setConvert({ ...convert, unit_cost_override: e.target.value })}
                  placeholder={String(avgCost.toFixed(2))}
                />
              </div>
            </div>

            <div>
              <Label>Asset name</Label>
              <Input
                value={convert.asset_name}
                onChange={(e) => setConvert({ ...convert, asset_name: e.target.value })}
                placeholder={(item as any)?.product_name || 'Asset name'}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={convert.category_id || 'none'}
                  onValueChange={(v) => setConvert({ ...convert, category_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Depreciation</Label>
                <Select
                  value={convert.depreciation_method}
                  onValueChange={(v) => setConvert({ ...convert, depreciation_method: v as DepreciationMethod })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SLM">SLM</SelectItem>
                    <SelectItem value="WDV">WDV</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Useful life (yrs)</Label>
                <Input
                  type="number"
                  min={0}
                  value={convert.useful_life_years || ''}
                  onChange={(e) => setConvert({ ...convert, useful_life_years: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Salvage value</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={convert.salvage_value || ''}
                  onChange={(e) => setConvert({ ...convert, salvage_value: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input
                  value={convert.location}
                  onChange={(e) => setConvert({ ...convert, location: e.target.value })}
                  placeholder="Office / Branch"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Custodian (optional)</Label>
                <Input
                  value={convert.custodian}
                  onChange={(e) => setConvert({ ...convert, custodian: e.target.value })}
                  placeholder="Employee name"
                />
              </div>
              <div>
                <Label>Serial number</Label>
                <Input
                  value={convert.serial_number}
                  onChange={(e) => setConvert({ ...convert, serial_number: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={convert.notes}
                onChange={(e) => setConvert({ ...convert, notes: e.target.value })}
              />
            </div>

            <div className="rounded-md bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span>Capitalized value</span>
                <span>{inr(previewTotal)}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">
                {convert.quantity} × {inr(previewCost)} = {inr(previewTotal)}
              </div>
            </div>

            {Number(convert.quantity) > currentStock && (
              <div className="text-xs text-red-600">
                Quantity exceeds available stock ({currentStock}).
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button
              onClick={submitConvert}
              disabled={
                convertToAsset.isPending ||
                Number(convert.quantity) <= 0 ||
                Number(convert.quantity) > currentStock ||
                previewTotal <= 0
              }
            >
              {convertToAsset.isPending ? 'Converting…' : 'Capitalize as asset'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ItemLedger;

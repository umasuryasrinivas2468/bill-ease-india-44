import React, { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ArrowLeft, ArrowDown, ArrowUp } from 'lucide-react';
import { useItemMovementLedger } from '@/hooks/useInventoryMIS';
import { useInventory } from '@/hooks/useInventory';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const movementColour = (t: string) => {
  const inward = ['purchase', 'sales_return', 'adjustment_in', 'transfer_in', 'opening'];
  return inward.includes(t) ? 'text-green-700' : 'text-red-600';
};

const ItemLedger: React.FC = () => {
  const { itemId } = useParams<{ itemId: string }>();
  const { data: rows = [], isLoading } = useItemMovementLedger(itemId ?? null);
  const { data: inventory = [] } = useInventory();

  const item = useMemo(
    () => inventory.find((i: any) => i.id === itemId),
    [inventory, itemId],
  );

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
    </div>
  );
};

export default ItemLedger;

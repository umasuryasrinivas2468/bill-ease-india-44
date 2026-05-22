import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Receipt, FileText, Layers, AlertCircle, CheckCircle2, X } from 'lucide-react';
import {
  useUncapitalizedBills,
  useCapitalizationPreview,
  useCapitalizeBillLines,
  useMarkBillSkipped,
  useUnskipBill,
} from '@/hooks/useAssetCapitalization';
import { useAssetCategories } from '@/hooks/useFixedAssets';
import type { CapitalizationLineInput } from '@/services/assetCapitalizationService';
import type { DepreciationMethod } from '@/types/fixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-IN') : '—');

interface RowDraft extends CapitalizationLineInput {
  selected: boolean;
}

const CapitalizationDialog: React.FC<{
  billId: string | null;
  onClose: () => void;
}> = ({ billId, onClose }) => {
  const { data, isLoading } = useCapitalizationPreview(billId || undefined);
  const { data: categories = [] } = useAssetCategories();
  const capitalize = useCapitalizeBillLines();

  const [drafts, setDrafts] = React.useState<RowDraft[]>([]);

  React.useEffect(() => {
    if (!data?.lines) return;
    setDrafts(
      data.lines.map(line => ({
        line_id: line.line_id,
        line_index: line.line_index,
        name: line.proposed_name,
        purchase_value: line.proposed_purchase_value,
        gst_amount: line.proposed_gst_share,
        useful_life_years: line.proposed_useful_life_years,
        depreciation_method: line.proposed_depreciation_method,
        salvage_value: line.proposed_salvage_value,
        selected: !line.already_capitalized,
      })),
    );
  }, [data?.lines]);

  if (!billId) return null;

  const updateDraft = (idx: number, patch: Partial<RowDraft>) =>
    setDrafts(prev => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));

  const selectedDrafts = drafts.filter(d => d.selected);
  const totalCapitalize = selectedDrafts.reduce((s, d) => s + Number(d.purchase_value || 0), 0);

  const onConfirm = async () => {
    if (selectedDrafts.length === 0) return;
    const payload: CapitalizationLineInput[] = selectedDrafts.map(({ selected: _s, ...rest }) => rest);
    await capitalize.mutateAsync({ billId, lines: payload });
    onClose();
  };

  const bill = data?.bill;

  return (
    <Dialog open={!!billId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capitalize bill {bill?.bill_number}</DialogTitle>
          <DialogDescription>
            Each asset-classified line becomes a separate entry in the Fixed Asset register.
            The bill's existing journal stays intact — we post a reclassification journal that
            moves the debit from the generic Fixed Assets account to per-asset leaf accounts.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : drafts.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <AlertCircle className="h-6 w-6 mx-auto mb-2" />
            No asset-classified lines on this bill.
          </div>
        ) : (
          <div className="space-y-4">
            {bill && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border rounded p-3 bg-muted/30">
                <div><span className="text-muted-foreground">Vendor:</span> <strong>{bill.vendor_name || '—'}</strong></div>
                <div><span className="text-muted-foreground">Date:</span> {fmt(bill.bill_date)}</div>
                <div><span className="text-muted-foreground">Asset amount:</span> <strong>{inr(bill.asset_amount)}</strong></div>
                <div><span className="text-muted-foreground">GST on bill:</span> {inr(bill.gst_amount)}</div>
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Asset name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Value (₹)</TableHead>
                  <TableHead className="text-right">GST share</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Life (yrs)</TableHead>
                  <TableHead className="text-right">Salvage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d, idx) => {
                  const line = data?.lines[idx];
                  const isLocked = line?.already_capitalized;
                  return (
                    <TableRow key={d.line_id} className={isLocked ? 'opacity-50' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={d.selected}
                          disabled={isLocked}
                          onChange={(e) => updateDraft(idx, { selected: e.target.checked })}
                          className="h-4 w-4"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={d.name}
                          onChange={(e) => updateDraft(idx, { name: e.target.value })}
                          disabled={isLocked}
                          className="min-w-[200px]"
                        />
                        {isLocked && (
                          <Badge variant="outline" className="mt-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Already capitalized
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.category_id || 'none'}
                          onValueChange={(v) => updateDraft(idx, { category_id: v === 'none' ? undefined : v })}
                          disabled={isLocked}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">— None —</SelectItem>
                            {categories.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={d.purchase_value}
                          onChange={(e) => updateDraft(idx, { purchase_value: Number(e.target.value) })}
                          disabled={isLocked}
                          className="w-28 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {inr(d.gst_amount)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={d.depreciation_method || 'SLM'}
                          onValueChange={(v) => updateDraft(idx, { depreciation_method: v as DepreciationMethod })}
                          disabled={isLocked}
                        >
                          <SelectTrigger className="w-[100px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="SLM">SLM</SelectItem>
                            <SelectItem value="WDV">WDV</SelectItem>
                            <SelectItem value="None">None</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={d.useful_life_years || 0}
                          onChange={(e) => updateDraft(idx, { useful_life_years: Number(e.target.value) })}
                          disabled={isLocked}
                          className="w-16 text-right"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          value={d.salvage_value || 0}
                          onChange={(e) => updateDraft(idx, { salvage_value: Number(e.target.value) })}
                          disabled={isLocked}
                          className="w-20 text-right"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex justify-between items-center text-sm border-t pt-3">
              <div className="text-muted-foreground">
                {selectedDrafts.length} of {drafts.length} line{drafts.length === 1 ? '' : 's'} selected
              </div>
              <div>
                Total to capitalize: <strong>{inr(totalCapitalize)}</strong>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={onConfirm}
            disabled={selectedDrafts.length === 0 || capitalize.isPending}
          >
            {capitalize.isPending
              ? 'Capitalizing…'
              : `Capitalize ${selectedDrafts.length} line${selectedDrafts.length === 1 ? '' : 's'}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CapitalizationQueue: React.FC = () => {
  const { data: bills = [], isLoading } = useUncapitalizedBills();
  const markSkipped = useMarkBillSkipped();
  const unskip = useUnskipBill();
  const [activeBillId, setActiveBillId] = React.useState<string | null>(null);

  const pending  = bills.filter(b => b.capitalization_status === 'pending');
  const partial  = bills.filter(b => b.capitalization_status === 'partial');
  const totalPendingValue = pending.reduce((s, b) => s + Number(b.asset_amount || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Capitalization Queue</h1>
          <p className="text-sm text-muted-foreground">
            Purchase bills with asset lines awaiting entry in the Fixed Asset register.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/assets/register">Open register</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Receipt className="h-3.5 w-3.5" /> Bills pending
            </div>
            <div className="text-2xl font-bold">{pending.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> Bills partially done
            </div>
            <div className="text-2xl font-bold text-amber-600">{partial.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Total value awaiting</div>
            <div className="text-2xl font-bold">{inr(totalPendingValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Assets created so far</div>
            <div className="text-2xl font-bold">
              {bills.reduce((s, b) => s + Number(b.assets_created_count || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bills awaiting capitalization
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : bills.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-6 w-6 mx-auto mb-2" />
              No bills waiting. Every asset bill is in the register.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Bill total</TableHead>
                  <TableHead className="text-right">Asset amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Lines / Done</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map(b => (
                  <TableRow key={b.bill_id}>
                    <TableCell className="font-medium">{b.bill_number}</TableCell>
                    <TableCell>{fmt(b.bill_date)}</TableCell>
                    <TableCell>{b.vendor_name || '—'}</TableCell>
                    <TableCell className="text-right">{inr(b.total_amount)}</TableCell>
                    <TableCell className="text-right font-medium">{inr(b.asset_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={
                        b.capitalization_status === 'partial' ? 'secondary' :
                        b.capitalization_status === 'capitalized' ? 'default' :
                        b.capitalization_status === 'skipped' ? 'outline' :
                        'destructive'
                      }>
                        {b.capitalization_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {Number(b.assets_created_count || 0)} created
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => setActiveBillId(b.bill_id)}>
                          Capitalize
                        </Button>
                        {b.capitalization_status === 'skipped' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => unskip.mutate(b.bill_id)}
                          >
                            Restore
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => markSkipped.mutate(b.bill_id)}
                            title="Remove from queue without capitalizing"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CapitalizationDialog billId={activeBillId} onClose={() => setActiveBillId(null)} />
    </div>
  );
};

export default CapitalizationQueue;

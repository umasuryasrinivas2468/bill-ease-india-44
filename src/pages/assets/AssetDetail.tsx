import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, AlertCircle, ArrowDownToLine, CheckCircle2, History, FileText, IndianRupee } from 'lucide-react';
import {
  useFixedAsset, useAssetTransactions, useAssetDepreciationSchedule, useDisposeAsset,
} from '@/hooks/useFixedAssets';
import { usePostDepreciationPeriod, useRegenerateSchedule } from '@/hooks/useDepreciation';
import MaintenanceTab from '@/components/assets/MaintenanceTab';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const AssetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: asset, isLoading } = useFixedAsset(id);
  const { data: transactions = [] } = useAssetTransactions(id);
  const { data: schedule = [] } = useAssetDepreciationSchedule(id);
  const postPeriod = usePostDepreciationPeriod();
  const regenerate = useRegenerateSchedule();
  const dispose = useDisposeAsset();

  const [disposalOpen, setDisposalOpen] = useState(false);
  const [disposal, setDisposal] = useState({
    sale_proceeds: 0,
    disposal_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'bank' as 'bank' | 'cash',
    write_off: false,
    reason: '',
    notes: '',
  });

  const dueRows = useMemo(
    () => schedule.filter((r) => r.status === 'planned' && new Date(r.period_end) <= new Date()),
    [schedule],
  );

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!asset) return <div className="p-6 text-sm text-red-600">Asset not found.</div>;

  const isDisposed = asset.status === 'disposed' || asset.status === 'written_off';

  const submitDisposal = () => {
    dispose.mutate({
      asset_id: asset.id,
      disposal_date: disposal.disposal_date,
      sale_proceeds: disposal.write_off ? 0 : disposal.sale_proceeds,
      payment_mode: disposal.payment_mode,
      write_off: disposal.write_off,
      reason: disposal.reason,
      notes: disposal.notes,
    }, {
      onSuccess: () => setDisposalOpen(false),
    });
  };

  const profitLossPreview = useMemo(() => {
    if (disposal.write_off) return -Number(asset.book_value);
    return Number(disposal.sale_proceeds || 0) - Number(asset.book_value);
  }, [disposal.sale_proceeds, disposal.write_off, asset.book_value]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link to="/assets/register"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
              <Badge variant={isDisposed ? 'secondary' : 'default'} className="capitalize text-[10px]">{asset.status.replace('_', ' ')}</Badge>
            </div>
            <div className="text-sm text-muted-foreground font-mono">{asset.asset_code} • {asset.category_name || 'Uncategorised'}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {!isDisposed && (
            <Button variant="outline" onClick={() => setDisposalOpen(true)}>
              <ArrowDownToLine className="h-4 w-4 mr-2" />Dispose / Write-off
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Gross</div><div className="text-xl font-bold">{inr(asset.total_capitalised_value)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Accum Dep</div><div className="text-xl font-bold text-amber-600">{inr(asset.accumulated_depreciation)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Book value</div><div className="text-xl font-bold text-emerald-600">{inr(asset.book_value)}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs uppercase text-muted-foreground">Method</div><div className="text-xl font-bold">{asset.depreciation_method}{asset.depreciation_method === 'WDV' && asset.depreciation_rate ? ` @ ${asset.depreciation_rate}%` : ''}</div><div className="text-xs text-muted-foreground">{asset.useful_life_years} years</div></CardContent></Card>
      </div>

      {dueRows.length > 0 && !isDisposed && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <span><strong>{dueRows.length}</strong> depreciation period{dueRows.length > 1 ? 's' : ''} due to be posted.</span>
            </div>
            <Button size="sm" onClick={() => dueRows.forEach((r) => postPeriod.mutate(r.id))} disabled={postPeriod.isPending}>
              Post all due
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="details">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="schedule">Depreciation schedule</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4 pt-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Asset details</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Row label="Purchase date" value={asset.purchase_date} />
              <Row label="Vendor" value={asset.vendor_name || '—'} />
              <Row label="Purchase value (excl. GST)" value={inr(asset.purchase_value)} />
              <Row label="GST amount" value={inr(asset.gst_amount)} />
              <Row label="ITC eligible" value={asset.itc_eligible ? 'Yes' : 'No'} />
              <Row label="Salvage value" value={inr(asset.salvage_value)} />
              <Row label="Location" value={asset.location || '—'} />
              <Row label="Custodian" value={asset.custodian || '—'} />
              <Row label="Serial / VIN" value={asset.serial_number || '—'} />
              <Row label="Source" value={asset.source_type.replace('_', ' ')} />
              {asset.disposed_at && <Row label="Disposed on" value={asset.disposed_at} />}
              {asset.profit_loss_on_disposal != null && (
                <Row
                  label={asset.profit_loss_on_disposal >= 0 ? 'Profit on disposal' : 'Loss on disposal'}
                  value={inr(Math.abs(asset.profit_loss_on_disposal))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="schedule" className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{schedule.length} periods • {schedule.filter(r => r.status === 'posted').length} posted</div>
            <Button variant="outline" size="sm" onClick={() => regenerate.mutate(asset.id)} disabled={regenerate.isPending}>
              Regenerate
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">Opening BV</TableHead>
                    <TableHead className="text-right">Depreciation</TableHead>
                    <TableHead className="text-right">Closing BV</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.period_index}</TableCell>
                      <TableCell className="text-xs">{r.period_start} → {r.period_end}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.opening_book_value)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.depreciation_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.closing_book_value)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'posted' ? 'default' : r.status === 'planned' ? 'outline' : 'secondary'} className="capitalize text-[10px]">{r.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {r.status === 'planned' && (
                          <Button size="sm" variant="ghost" onClick={() => postPeriod.mutate(r.id)} disabled={postPeriod.isPending}>
                            Post
                          </Button>
                        )}
                        {r.status === 'posted' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                      </TableCell>
                    </TableRow>
                  ))}
                  {schedule.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center py-6 text-sm text-muted-foreground">No schedule generated.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="maintenance" className="pt-2">
          <MaintenanceTab assetId={asset.id} assetName={asset.name} />
        </TabsContent>

        <TabsContent value="history" className="pt-2">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Journal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{t.transaction_date}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px] capitalize">{t.transaction_type.replace('_', ' ')}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{t.amount != null ? inr(t.amount) : '—'}</TableCell>
                      <TableCell className="text-xs">{t.notes || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{t.journal_id ? <Link to={`/accounting/manual-journals`} className="text-primary hover:underline">view</Link> : '—'}</TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-sm text-muted-foreground">No events yet.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Disposal dialog */}
      <Dialog open={disposalOpen} onOpenChange={setDisposalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{disposal.write_off ? 'Write off asset' : 'Dispose asset'}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="wf" checked={disposal.write_off} onChange={(e) => setDisposal({ ...disposal, write_off: e.target.checked })} />
              <Label htmlFor="wf" className="font-normal">Full write-off (no proceeds)</Label>
            </div>
            <div>
              <Label>Disposal date</Label>
              <Input type="date" value={disposal.disposal_date} onChange={(e) => setDisposal({ ...disposal, disposal_date: e.target.value })} />
            </div>
            {!disposal.write_off && (
              <>
                <div>
                  <Label>Sale proceeds</Label>
                  <Input type="number" min={0} step="0.01" value={disposal.sale_proceeds || ''} onChange={(e) => setDisposal({ ...disposal, sale_proceeds: Number(e.target.value) })} />
                </div>
                <div>
                  <Label>Received via</Label>
                  <Select value={disposal.payment_mode} onValueChange={(v) => setDisposal({ ...disposal, payment_mode: v as 'bank' | 'cash' })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">Bank</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div>
              <Label>Reason</Label>
              <Input value={disposal.reason} onChange={(e) => setDisposal({ ...disposal, reason: e.target.value })} placeholder="Sold to..., damaged, end of life..." />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={disposal.notes} onChange={(e) => setDisposal({ ...disposal, notes: e.target.value })} />
            </div>
            <Separator />
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Current book value</span><span>{inr(asset.book_value)}</span></div>
              <div className="flex justify-between"><span>{disposal.write_off ? 'Write-off amount' : 'Proceeds'}</span><span>{inr(disposal.write_off ? 0 : disposal.sale_proceeds)}</span></div>
              <div className={`flex justify-between font-semibold ${profitLossPreview >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                <span>{profitLossPreview >= 0 ? 'Profit on disposal' : 'Loss on disposal'}</span>
                <span>{inr(Math.abs(profitLossPreview))}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalOpen(false)}>Cancel</Button>
            <Button onClick={submitDisposal} disabled={dispose.isPending}>{dispose.isPending ? 'Posting…' : 'Confirm & post journal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex justify-between border-b border-dashed border-border/50 pb-1.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="font-medium">{value}</span>
  </div>
);

export default AssetDetail;

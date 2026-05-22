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
  useRequestDisposal,
} from '@/hooks/useFixedAssets';
import { usePostDepreciationPeriod, useRegenerateSchedule } from '@/hooks/useDepreciation';
import MaintenanceTab from '@/components/assets/MaintenanceTab';
import CoverageTab from '@/components/assets/CoverageTab';
import TransferTab from '@/components/assets/TransferTab';
import AllocationTab from '@/components/assets/AllocationTab';
import RevaluationTab from '@/components/assets/RevaluationTab';
import AssetQrCode from '@/components/assets/AssetQrCode';

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
  const requestDispose = useRequestDisposal();

  const [disposalOpen, setDisposalOpen] = useState(false);
  const [disposal, setDisposal] = useState({
    sale_proceeds: 0,
    disposal_date: new Date().toISOString().slice(0, 10),
    payment_mode: 'bank' as 'bank' | 'cash' | 'credit',
    write_off: false,
    reason: '',
    notes: '',
    // Module 9 additions
    disposal_type: 'sale' as 'sale' | 'scrap' | 'donation' | 'trade_in' | 'write_off' | 'damage',
    gst_rate: 18,
    gst_amount: 0,
    scrap_value: 0,
    buyer_name: '',
    via_approval: false,
    // Module 22 — AR + GST split
    buyer_gstin: '',
    place_of_supply: '',
    customer_id: '',
  });

  const dueRows = useMemo(
    () => schedule.filter((r) => r.status === 'planned' && new Date(r.period_end) <= new Date()),
    [schedule],
  );

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!asset) return <div className="p-6 text-sm text-red-600">Asset not found.</div>;

  const isDisposed = asset.status === 'disposed' || asset.status === 'written_off';

  const submitDisposal = () => {
    if (disposal.via_approval) {
      requestDispose.mutate({
        asset_id: asset.id,
        disposal_type: disposal.write_off ? 'write_off' : disposal.disposal_type,
        reason: disposal.reason || 'No reason provided',
        proposed_disposal_date: disposal.disposal_date,
        proposed_sale_proceeds: disposal.write_off ? 0 : disposal.sale_proceeds,
        proposed_scrap_value: disposal.scrap_value,
        proposed_gst_rate: disposal.gst_rate,
        proposed_gst_amount: disposal.write_off ? 0 : disposal.gst_amount,
        payment_mode: disposal.payment_mode,
        buyer_name: disposal.buyer_name,
        buyer_gstin: disposal.buyer_gstin || undefined,
        place_of_supply: disposal.place_of_supply || undefined,
        customer_id: disposal.customer_id || undefined,
        notes: disposal.notes,
      }, {
        onSuccess: () => setDisposalOpen(false),
      });
    } else {
      dispose.mutate({
        asset_id: asset.id,
        disposal_date: disposal.disposal_date,
        sale_proceeds: disposal.write_off ? 0 : disposal.sale_proceeds,
        payment_mode: disposal.payment_mode,
        write_off: disposal.write_off,
        reason: disposal.reason,
        notes: disposal.notes,
        disposal_type: disposal.write_off ? 'write_off' : disposal.disposal_type,
        gst_amount: disposal.write_off ? 0 : disposal.gst_amount,
        gst_rate: disposal.gst_rate,
        scrap_value: disposal.scrap_value,
        buyer_name: disposal.buyer_name,
        buyer_gstin: disposal.buyer_gstin || undefined,
        place_of_supply: disposal.place_of_supply || undefined,
        customer_id: disposal.customer_id || undefined,
      }, {
        onSuccess: () => setDisposalOpen(false),
      });
    }
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
          <AssetQrCode assetCode={asset.asset_code} assetName={asset.name} assetId={asset.id} />
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
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="allocations">Allocations</TabsTrigger>
          <TabsTrigger value="revaluation">Revaluation</TabsTrigger>
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

        <TabsContent value="coverage" className="pt-2">
          <CoverageTab assetId={asset.id} assetName={asset.name} />
        </TabsContent>

        <TabsContent value="transfers" className="pt-2">
          <TransferTab assetId={asset.id} assetName={asset.name} />
        </TabsContent>

        <TabsContent value="allocations" className="pt-2">
          <AllocationTab assetId={asset.id} assetName={asset.name} />
        </TabsContent>

        <TabsContent value="revaluation" className="pt-2">
          <RevaluationTab assetId={asset.id} assetName={asset.name} />
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{disposal.write_off ? 'Write off asset' : 'Dispose asset'}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="wf" checked={disposal.write_off} onChange={(e) => setDisposal({ ...disposal, write_off: e.target.checked, gst_amount: e.target.checked ? 0 : disposal.gst_amount })} />
              <Label htmlFor="wf" className="font-normal">Full write-off (no proceeds, no GST)</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Disposal date</Label>
                <Input type="date" value={disposal.disposal_date} onChange={(e) => setDisposal({ ...disposal, disposal_date: e.target.value })} />
              </div>
              {!disposal.write_off && (
                <div>
                  <Label>Disposal type</Label>
                  <Select value={disposal.disposal_type} onValueChange={(v) => setDisposal({ ...disposal, disposal_type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sale">Sale</SelectItem>
                      <SelectItem value="scrap">Scrap</SelectItem>
                      <SelectItem value="donation">Donation</SelectItem>
                      <SelectItem value="trade_in">Trade-in</SelectItem>
                      <SelectItem value="damage">Damaged / lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!disposal.write_off && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Sale proceeds (excl. GST)</Label>
                    <Input type="number" min={0} step="0.01" value={disposal.sale_proceeds || ''} onChange={(e) => setDisposal({ ...disposal, sale_proceeds: Number(e.target.value) })} />
                  </div>
                  <div>
                    <Label>Received via</Label>
                    <Select value={disposal.payment_mode} onValueChange={(v) => setDisposal({ ...disposal, payment_mode: v as 'bank' | 'cash' | 'credit' })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bank">Bank</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="credit">Credit (AR — buyer pays later)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>GST rate (%)</Label>
                    <Input type="number" min={0} step="0.01" value={disposal.gst_rate || ''} onChange={(e) => {
                      const r = Number(e.target.value);
                      setDisposal({ ...disposal, gst_rate: r, gst_amount: Math.round(disposal.sale_proceeds * r) / 100 });
                    }} />
                  </div>
                  <div>
                    <Label>GST amount</Label>
                    <Input type="number" min={0} step="0.01" value={disposal.gst_amount || ''} onChange={(e) => setDisposal({ ...disposal, gst_amount: Number(e.target.value) })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Buyer name</Label>
                    <Input value={disposal.buyer_name} onChange={(e) => setDisposal({ ...disposal, buyer_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Scrap value recovered</Label>
                    <Input type="number" min={0} step="0.01" value={disposal.scrap_value || ''} onChange={(e) => setDisposal({ ...disposal, scrap_value: Number(e.target.value) })} placeholder="Parts salvaged" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Buyer GSTIN (optional)</Label>
                    <Input
                      value={disposal.buyer_gstin}
                      onChange={(e) => setDisposal({ ...disposal, buyer_gstin: e.target.value.toUpperCase() })}
                      placeholder="22AAAAA0000A1Z5"
                      maxLength={15}
                    />
                    <div className="text-[10px] text-muted-foreground mt-0.5">Drives CGST+SGST vs IGST split.</div>
                  </div>
                  <div>
                    <Label>Place of supply</Label>
                    <Input
                      value={disposal.place_of_supply}
                      onChange={(e) => setDisposal({ ...disposal, place_of_supply: e.target.value })}
                      placeholder="State name (used if no GSTIN)"
                    />
                  </div>
                </div>
              </>
            )}

            <div>
              <Label>Reason</Label>
              <Input value={disposal.reason} onChange={(e) => setDisposal({ ...disposal, reason: e.target.value })} placeholder="End of life / sold to vendor / damaged in transit..." />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea rows={2} value={disposal.notes} onChange={(e) => setDisposal({ ...disposal, notes: e.target.value })} />
            </div>

            <div className="flex items-center gap-2 border-t pt-2">
              <input type="checkbox" id="approval" checked={disposal.via_approval} onChange={(e) => setDisposal({ ...disposal, via_approval: e.target.checked })} />
              <Label htmlFor="approval" className="font-normal">
                Submit for approval (no journal until approved)
              </Label>
            </div>

            <Separator />
            <div className="rounded-md bg-muted p-3 text-xs space-y-1">
              <div className="flex justify-between"><span>Current book value</span><span>{inr(asset.book_value)}</span></div>
              <div className="flex justify-between"><span>{disposal.write_off ? 'Write-off amount' : 'Proceeds (excl. GST)'}</span><span>{inr(disposal.write_off ? 0 : disposal.sale_proceeds)}</span></div>
              {!disposal.write_off && disposal.gst_amount > 0 && (() => {
                const gstinState = disposal.buyer_gstin && disposal.buyer_gstin.length >= 2 ? disposal.buyer_gstin.slice(0, 2) : null;
                const knownIntra = gstinState ? null : disposal.place_of_supply ? null : true;
                const intra = knownIntra;
                const half = Math.round((disposal.gst_amount / 2) * 100) / 100;
                return (
                  <>
                    <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-1">
                      <span>GST split</span>
                      <span>
                        {intra === false
                          ? `IGST ${inr(disposal.gst_amount)}`
                          : `CGST ${inr(half)} + SGST ${inr(disposal.gst_amount - half)}`}
                      </span>
                    </div>
                    {!disposal.buyer_gstin && !disposal.place_of_supply && (
                      <div className="text-[10px] text-amber-600">
                        Add buyer GSTIN or place of supply for accurate split — defaulting to intra-state.
                      </div>
                    )}
                  </>
                );
              })()}
              {!disposal.write_off && disposal.payment_mode === 'credit' && (
                <div className="flex justify-between text-[10px] text-muted-foreground border-t pt-1">
                  <span>Settlement</span>
                  <span>Posts to Accounts Receivable</span>
                </div>
              )}
              <div className={`flex justify-between font-semibold ${profitLossPreview >= 0 ? 'text-emerald-600' : 'text-red-600'} border-t pt-1`}>
                <span>{profitLossPreview >= 0 ? 'Profit on disposal' : 'Loss on disposal'}</span>
                <span>{inr(Math.abs(profitLossPreview))}</span>
              </div>
              {disposal.via_approval && (
                <div className="pt-1 text-amber-600 border-t mt-1">Submits as a pending request — no journal until an approver clicks Approve.</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDisposalOpen(false)}>Cancel</Button>
            <Button onClick={submitDisposal} disabled={dispose.isPending || requestDispose.isPending}>
              {disposal.via_approval
                ? (requestDispose.isPending ? 'Submitting…' : 'Submit for approval')
                : (dispose.isPending ? 'Posting…' : 'Confirm & post journal')}
            </Button>
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

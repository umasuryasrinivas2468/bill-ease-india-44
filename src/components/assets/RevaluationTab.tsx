import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Scale, Plus, FileText } from 'lucide-react';
import {
  useAssetRevaluations,
  useRevalueAsset,
} from '@/hooks/useAssetRevaluation';
import { computeRevaluationSplit } from '@/services/assetRevaluationService';
import { useFixedAsset } from '@/hooks/useFixedAssets';
import type { RevalueAssetInput, RevaluationMethod } from '@/types/assetRevaluation';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  assetId: string;
  assetName: string;
}

const RevaluationTab: React.FC<Props> = ({ assetId, assetName }) => {
  const { data: asset } = useFixedAsset(assetId);
  const { data: revaluations = [] } = useAssetRevaluations(assetId);
  const revalue = useRevalueAsset();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<RevalueAssetInput>({
    asset_id: assetId,
    revaluation_date: today(),
    new_fair_value: 0,
  });

  useEffect(() => {
    if (asset && open) {
      setDraft((d) => ({
        ...d,
        asset_id: assetId,
        new_fair_value: d.new_fair_value || asset.book_value,
        remaining_useful_life_years: d.remaining_useful_life_years ?? asset.useful_life_years,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, asset?.id]);

  const reserveBalance = Number((asset as any)?.revaluation_reserve_balance || 0);
  const cumulativeLoss = Number((asset as any)?.cumulative_revaluation_loss || 0);

  const preview = asset && draft.new_fair_value
    ? computeRevaluationSplit(
        Number(asset.book_value || 0),
        draft.new_fair_value,
        reserveBalance,
        cumulativeLoss,
      )
    : null;

  const submit = () => {
    revalue.mutate(draft, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Current book value</div>
            <div className="text-xl font-bold">{inr(asset?.book_value)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground flex items-center gap-1">
              <Scale className="h-3.5 w-3.5" /> Revaluation reserve
            </div>
            <div className="text-xl font-bold text-emerald-600">{inr(reserveBalance)}</div>
            <div className="text-xs text-muted-foreground">Equity bucket on this asset</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Cumulative loss (P&L)</div>
            <div className="text-xl font-bold text-amber-600">{inr(cumulativeLoss)}</div>
            <div className="text-xs text-muted-foreground">Reversible by upward reval</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="text-xs uppercase text-muted-foreground">Last revalued</div>
            <div className="text-sm font-bold">{(asset as any)?.last_revalued_on || '—'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Revaluation history</CardTitle>
          <Button size="sm" onClick={() => setOpen(true)} disabled={!asset || asset.status === 'disposed' || asset.status === 'written_off'}>
            <Plus className="h-4 w-4 mr-1" /> New revaluation
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead className="text-right">Prev book</TableHead>
                <TableHead className="text-right">New FV</TableHead>
                <TableHead className="text-right">Reserve impact</TableHead>
                <TableHead className="text-right">P&L impact</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Doc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {revaluations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{r.revaluation_date}</TableCell>
                  <TableCell>
                    <Badge
                      variant={r.direction === 'upward' ? 'default' : 'destructive'}
                      className="text-[10px] capitalize flex items-center gap-1 w-fit"
                    >
                      {r.direction === 'upward' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {r.direction}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.prev_book_value)}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(r.new_fair_value)}</TableCell>
                  <TableCell className={`text-right tabular-nums ${r.reserve_impact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.reserve_impact >= 0 ? '+' : ''}{inr(r.reserve_impact)}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums ${r.pl_impact >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.pl_impact >= 0 ? '+' : ''}{inr(r.pl_impact)}
                  </TableCell>
                  <TableCell className="text-xs capitalize">{r.method || '—'}</TableCell>
                  <TableCell>
                    {r.document_url && (
                      <a href={r.document_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /></Button>
                      </a>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {revaluations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-6 text-sm text-muted-foreground">
                    No revaluations recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* New revaluation dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revalue {assetName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Revaluation date</Label>
                <Input
                  type="date"
                  value={draft.revaluation_date}
                  onChange={(e) => setDraft({ ...draft, revaluation_date: e.target.value })}
                />
              </div>
              <div>
                <Label>New fair value</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft.new_fair_value || ''}
                  onChange={(e) => setDraft({ ...draft, new_fair_value: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Remaining useful life (yrs)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.25"
                  value={draft.remaining_useful_life_years ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, remaining_useful_life_years: Number(e.target.value) })
                  }
                  placeholder={`Current: ${asset?.useful_life_years}`}
                />
              </div>
              <div>
                <Label>Method</Label>
                <Select
                  value={draft.method || ''}
                  onValueChange={(v) => setDraft({ ...draft, method: v as RevaluationMethod })}
                >
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Market</SelectItem>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="cost">Cost / replacement</SelectItem>
                    <SelectItem value="dcf">DCF</SelectItem>
                    <SelectItem value="independent">Independent valuer</SelectItem>
                    <SelectItem value="internal">Internal estimate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valuer name</Label>
                <Input
                  value={draft.valuer_name || ''}
                  onChange={(e) => setDraft({ ...draft, valuer_name: e.target.value })}
                />
              </div>
              <div>
                <Label>Valuer contact</Label>
                <Input
                  value={draft.valuer_contact || ''}
                  onChange={(e) => setDraft({ ...draft, valuer_contact: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Reason</Label>
              <Input
                value={draft.reason || ''}
                onChange={(e) => setDraft({ ...draft, reason: e.target.value })}
                placeholder="Annual revaluation / market shift / impairment trigger"
              />
            </div>

            <div>
              <Label>Document URL</Label>
              <Input
                value={draft.document_url || ''}
                onChange={(e) => setDraft({ ...draft, document_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea
                rows={2}
                value={draft.notes || ''}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>

            {preview && Math.abs(preview.delta) > 0.01 && (
              <div className="rounded-md border border-border bg-muted p-3 text-xs space-y-1">
                <div className="font-semibold uppercase text-[10px] text-muted-foreground">Journal preview</div>
                <div className="flex justify-between">
                  <span>Book value change</span>
                  <span className={`font-semibold ${preview.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {preview.delta >= 0 ? '+' : ''}{inr(preview.delta)}
                  </span>
                </div>
                {preview.reserve_impact !== 0 && (
                  <div className="flex justify-between">
                    <span>{preview.reserve_impact > 0 ? 'Cr Revaluation Reserve (Equity)' : 'Dr Revaluation Reserve (Equity)'}</span>
                    <span>{inr(Math.abs(preview.reserve_impact))}</span>
                  </div>
                )}
                {preview.pl_impact !== 0 && (
                  <div className="flex justify-between">
                    <span>{preview.pl_impact > 0 ? 'Cr Revaluation Gain (Income reversal)' : 'Dr Revaluation Loss (Expense)'}</span>
                    <span>{inr(Math.abs(preview.pl_impact))}</span>
                  </div>
                )}
                <div className="flex justify-between border-t pt-1 mt-1">
                  <span>Accumulated depreciation</span>
                  <span>Reset to zero</span>
                </div>
                <div className="flex justify-between">
                  <span>Depreciation schedule</span>
                  <span>Regenerated</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={submit}
              disabled={
                revalue.isPending ||
                !draft.new_fair_value ||
                !preview ||
                Math.abs(preview.delta) < 0.01
              }
            >
              {revalue.isPending ? 'Posting…' : 'Revalue & post'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RevaluationTab;

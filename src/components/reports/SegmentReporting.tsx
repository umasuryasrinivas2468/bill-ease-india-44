import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Layers3, Plus, Trash2, Loader2, RefreshCw, AlertCircle, TrendingUp, BarChart3, Map,
} from 'lucide-react';
import {
  listSegments, upsertSegment, deleteSegment, fetchSegmentPerformance,
  BusinessSegment, SegmentPerformance,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props { financialYear: string; }

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

const SegmentReporting: React.FC<Props> = ({ financialYear }) => {
  const { user } = useUser();
  const [segments, setSegments] = useState<BusinessSegment[]>([]);
  const [perf, setPerf] = useState<SegmentPerformance | null>(null);
  const [loading, setLoading] = useState(false);

  // New segment dialog
  const [openDialog, setOpenDialog] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<'business' | 'geographical'>('business');
  const [driver, setDriver] = useState<'cost_center' | 'project' | 'branch' | 'department'>('cost_center');
  const [driverValue, setDriverValue] = useState('');
  const [description, setDescription] = useState('');

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [segs, pf] = await Promise.all([
      listSegments(user.id),
      fetchSegmentPerformance(user.id, financialYear),
    ]);
    setSegments(segs); setPerf(pf);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const handleSave = async () => {
    if (!user?.id || !code.trim() || !name.trim() || !driverValue.trim()) {
      toast.error('Code, name, and driver value are required');
      return;
    }
    try {
      await upsertSegment(user.id, {
        segment_code: code.trim(),
        segment_name: name.trim(),
        segment_type: type,
        driver,
        driver_value: driverValue.trim(),
        description: description.trim() || null,
      });
      toast.success('Segment saved');
      setOpenDialog(false);
      setCode(''); setName(''); setDriverValue(''); setDescription('');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save segment');
    }
  };

  const handleDelete = async (id?: string) => {
    if (!id) return;
    if (!confirm('Delete this segment? Performance data will be recomputed.')) return;
    try {
      await deleteSegment(id);
      toast.success('Segment removed');
      await load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers3 className="h-4 w-4" /> Segment Reporting (AS 17 / Ind AS 108)
          </CardTitle>
          <CardDescription>
            Per-segment Revenue · Profit · Assets · Liabilities · CapEx · Depreciation —
            driven by cost-center / project / branch / department tags on journal lines.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1.5 hidden sm:inline">Refresh</span>
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="performance">
          <TabsList>
            <TabsTrigger value="performance"><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Performance</TabsTrigger>
            <TabsTrigger value="config"><Layers3 className="h-3.5 w-3.5 mr-1.5" />Segments ({segments.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-3 pt-3">
            {loading && !perf ? (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Computing segment performance…
              </div>
            ) : !perf || perf.segments.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                {segments.length === 0
                  ? <>No segments defined. Go to <strong>Segments</strong> tab to set them up.</>
                  : <>Segments defined but no journal entries match their driver tags.
                       Verify that journals carry <code>cost_center_id</code> / <code>project_id</code> / <code>branch_id</code>.</>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Total Revenue</div>
                    <div className="text-base font-semibold tabular-nums">₹ {formatINR(perf.totals.revenue)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Total Profit</div>
                    <div className={cn('text-base font-semibold tabular-nums',
                      perf.totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      ₹ {formatINR(perf.totals.profit)}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">Segment Assets</div>
                    <div className="text-base font-semibold tabular-nums">₹ {formatINR(perf.totals.segment_assets)}</div>
                  </div>
                  <div className="rounded-lg border bg-muted/20 p-3">
                    <div className="text-[10px] uppercase text-muted-foreground">CapEx</div>
                    <div className="text-base font-semibold tabular-nums">₹ {formatINR(perf.totals.capex)}</div>
                  </div>
                </div>

                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Segment</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Revenue</th>
                        <th className="px-3 py-2 text-right font-medium">Expenses</th>
                        <th className="px-3 py-2 text-right font-medium">Profit</th>
                        <th className="px-3 py-2 text-right font-medium">Assets</th>
                        <th className="px-3 py-2 text-right font-medium">Liabs</th>
                        <th className="px-3 py-2 text-right font-medium">CapEx</th>
                        <th className="px-3 py-2 text-right font-medium">Depreciation</th>
                        <th className="px-3 py-2 text-center font-medium">Rev %</th>
                        <th className="px-3 py-2 text-center font-medium">Reportable</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perf.segments.map(s => (
                        <tr key={s.segment_id} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-1.5">
                            <div className="font-medium">{s.segment_name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{s.segment_code} · driver: {s.driver}</div>
                          </td>
                          <td className="px-3 py-1.5">
                            {s.segment_type === 'business'
                              ? <Badge variant="outline" className="text-[10px]">Business</Badge>
                              : <Badge variant="secondary" className="text-[10px]"><Map className="h-3 w-3 mr-1" />Geo</Badge>}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.revenue)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.expenses)}</td>
                          <td className={cn('px-3 py-1.5 text-right tabular-nums font-medium',
                            s.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatINR(s.profit)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.segment_assets)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.segment_liabilities)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.capex)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(s.depreciation)}</td>
                          <td className="px-3 py-1.5 text-center tabular-nums text-xs">{s.revenue_pct.toFixed(1)}%</td>
                          <td className="px-3 py-1.5 text-center">
                            {s.is_reportable_threshold
                              ? <Badge variant="default" className="text-[10px]">Reportable</Badge>
                              : <Badge variant="secondary" className="text-[10px]">Other</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-muted/40 font-semibold">
                      <tr className="border-t">
                        <td colSpan={2} className="px-3 py-2 text-right">TOTAL</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.revenue)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.expenses)}</td>
                        <td className={cn('px-3 py-2 text-right tabular-nums',
                          perf.totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600')}>{formatINR(perf.totals.profit)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.segment_assets)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.segment_liabilities)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.capex)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatINR(perf.totals.depreciation)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  Per AS 17 / Ind AS 108: a segment is reportable if its revenue, absolute profit, or assets is ≥ 10% of combined total.
                  Non-reportable segments are typically aggregated as "Others" in the published statements.
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="config" className="space-y-3 pt-3">
            <div className="flex justify-end">
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="h-4 w-4 mr-1.5" />New Segment</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Define business segment</DialogTitle>
                    <DialogDescription>
                      Map a segment to one of your tagging dimensions. The RPC will sum journal-line
                      values where the chosen driver matches the driver value.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="s-code">Segment code *</Label>
                        <Input id="s-code" placeholder="SEG-MFG" value={code} onChange={(e) => setCode(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Type</Label>
                        <Select value={type} onValueChange={(v) => setType(v as 'business' | 'geographical')}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="business">Business</SelectItem>
                            <SelectItem value="geographical">Geographical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="s-name">Segment name *</Label>
                      <Input id="s-name" placeholder="Manufacturing Division" value={name}
                             onChange={(e) => setName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Driver *</Label>
                        <Select value={driver} onValueChange={(v) => setDriver(v as any)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cost_center">Cost Center</SelectItem>
                            <SelectItem value="project">Project</SelectItem>
                            <SelectItem value="branch">Branch</SelectItem>
                            <SelectItem value="department">Department</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="s-driver-value">Driver value *</Label>
                        <Input id="s-driver-value"
                               placeholder={driver === 'department' ? 'e.g. Engineering' : 'UUID of cost-center/project/branch'}
                               value={driverValue} onChange={(e) => setDriverValue(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="s-desc">Description</Label>
                      <Input id="s-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancel</Button>
                    <Button onClick={handleSave}>Save</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {segments.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No segments defined. Click <strong>New Segment</strong> to set up your first one.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Code</th>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium">Driver</th>
                      <th className="px-3 py-2 text-left font-medium">Value</th>
                      <th className="px-3 py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map(s => (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-1.5 font-mono text-xs">{s.segment_code}</td>
                        <td className="px-3 py-1.5">{s.segment_name}</td>
                        <td className="px-3 py-1.5">
                          <Badge variant="outline" className="text-[10px]">{s.segment_type}</Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{s.driver}</td>
                        <td className="px-3 py-1.5 font-mono text-[11px] text-muted-foreground">{s.driver_value}</td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default SegmentReporting;

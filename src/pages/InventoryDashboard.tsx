import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useToast } from '@/hooks/use-toast';
import {
  useInventoryReconciliation,
  useHsnSummary,
  useInventoryKpi,
  useReorderSuggestions,
  useInventoryAnomalies,
  useRunInventoryDetectors,
} from '@/hooks/useInventoryMIS';
import { AlertTriangle, CheckCircle2, RefreshCw, TrendingUp, TrendingDown, Search, Eye } from 'lucide-react';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
    .format(Number(n) || 0);

const movementClassBadge = (cls: string) => {
  const map: Record<string, string> = {
    fast: 'bg-green-100 text-green-800',
    normal: 'bg-blue-100 text-blue-800',
    slow: 'bg-yellow-100 text-yellow-800',
    dead: 'bg-red-100 text-red-800',
  };
  return <Badge className={map[cls] || ''}>{cls}</Badge>;
};

const InventoryDashboard: React.FC = () => {
  const { toast } = useToast();
  const { data: rec } = useInventoryReconciliation();
  const { data: hsn = [] } = useHsnSummary();
  const { data: kpi = [] } = useInventoryKpi();
  const { data: suggestions = [] } = useReorderSuggestions();
  const { data: anomalies = [] } = useInventoryAnomalies();
  const runDetectors = useRunInventoryDetectors();

  const [search, setSearch] = useState('');

  const kpiFiltered = useMemo(() => {
    const lower = search.toLowerCase();
    if (!lower) return kpi;
    return kpi.filter((k) =>
      k.product_name.toLowerCase().includes(lower) ||
      (k.sku || '').toLowerCase().includes(lower) ||
      (k.category || '').toLowerCase().includes(lower),
    );
  }, [kpi, search]);

  const dashSummary = useMemo(() => {
    let revenue = 0, cogs = 0, stockValue = 0;
    let fast = 0, slow = 0, dead = 0;
    for (const k of kpi) {
      revenue += Number(k.revenue_last_90 || 0);
      cogs += Number(k.cogs_last_90 || 0);
      stockValue += Number(k.stock_value || 0);
      if (k.movement_class === 'fast') fast++;
      if (k.movement_class === 'slow') slow++;
      if (k.movement_class === 'dead') dead++;
    }
    const margin = revenue - cogs;
    return { revenue, cogs, stockValue, margin, fast, slow, dead, marginPct: revenue > 0 ? (margin / revenue) * 100 : 0 };
  }, [kpi]);

  const runDetect = async () => {
    try {
      const out = await runDetectors.mutateAsync();
      toast({
        title: 'Detectors ran',
        description: `${out.abnormalCount} abnormal movements, ${out.duplicateGroups} duplicate groups`,
      });
    } catch (e: any) {
      toast({ title: 'Detector run failed', description: e?.message, variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Inventory MIS</h1>
            <p className="text-muted-foreground">Real-time KPIs, GL tie-out, HSN summary, reorder suggestions.</p>
          </div>
        </div>
        <Button variant="outline" onClick={runDetect} disabled={runDetectors.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${runDetectors.isPending ? 'animate-spin' : ''}`} />
          Run Detectors
        </Button>
      </div>

      {/* Reconciliation banner */}
      {rec && (
        <Card className={
          rec.status === 'reconciled' ? 'border-green-500' :
          rec.status === 'minor_drift' ? 'border-yellow-500' : 'border-red-500'
        }>
          <CardContent className="p-4 flex flex-col md:flex-row gap-4 md:items-center justify-between">
            <div className="flex items-center gap-3">
              {rec.status === 'reconciled' ? (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              ) : (
                <AlertTriangle className={`h-6 w-6 ${rec.status === 'minor_drift' ? 'text-yellow-600' : 'text-red-600'}`} />
              )}
              <div>
                <div className="font-medium">
                  Inventory subledger ↔ GL: {rec.status === 'reconciled' ? 'reconciled' : 'variance detected'}
                </div>
                <div className="text-sm text-muted-foreground">
                  Subledger {inr(rec.subledger_value)} · GL {inr(rec.gl_value)} · Variance{' '}
                  <span className={Math.abs(Number(rec.variance) || 0) > 1 ? 'text-red-600 font-semibold' : ''}>
                    {inr(rec.variance)}
                  </span>
                </div>
              </div>
            </div>
            <Badge variant={rec.status === 'investigate' ? 'destructive' : 'outline'}>{rec.status}</Badge>
          </CardContent>
        </Card>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Stock on Hand</div>
          <div className="text-2xl font-semibold">{inr(dashSummary.stockValue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Revenue (90d)</div>
          <div className="text-2xl font-semibold">{inr(dashSummary.revenue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Gross Margin (90d)</div>
          <div className={`text-2xl font-semibold ${dashSummary.margin < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {inr(dashSummary.margin)}
          </div>
          <div className="text-xs text-muted-foreground">{dashSummary.marginPct.toFixed(1)}%</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Movement Mix</div>
          <div className="text-sm mt-1 space-y-0.5">
            <div className="flex justify-between"><span className="text-green-700">Fast</span><span>{dashSummary.fast}</span></div>
            <div className="flex justify-between"><span className="text-yellow-700">Slow</span><span>{dashSummary.slow}</span></div>
            <div className="flex justify-between"><span className="text-red-700">Dead</span><span>{dashSummary.dead}</span></div>
          </div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="kpi">
        <TabsList>
          <TabsTrigger value="kpi">Item KPIs</TabsTrigger>
          <TabsTrigger value="reorder">Reorder Suggestions ({suggestions.length})</TabsTrigger>
          <TabsTrigger value="hsn">HSN Summary</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies ({anomalies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="kpi">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Item Profitability & Turnover (last 90 days)</CardTitle>
                <div className="relative w-72">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search items…" className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead className="text-right">Revenue 90d</TableHead>
                      <TableHead className="text-right">COGS 90d</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                      <TableHead className="text-right">GMROI</TableHead>
                      <TableHead className="text-right">DoI</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpiFiltered.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No items.</TableCell></TableRow>
                    ) : kpiFiltered.slice(0, 200).map((k) => (
                      <TableRow key={k.item_id}>
                        <TableCell>
                          <div className="font-medium">{k.product_name}</div>
                          <div className="text-xs text-muted-foreground">{k.sku || ''} {k.category ? `· ${k.category}` : ''}</div>
                        </TableCell>
                        <TableCell className="text-right">{Number(k.stock_quantity || 0)}</TableCell>
                        <TableCell className="text-right">{inr(k.stock_value)}</TableCell>
                        <TableCell className="text-right">{inr(k.revenue_last_90)}</TableCell>
                        <TableCell className="text-right">{inr(k.cogs_last_90)}</TableCell>
                        <TableCell className={`text-right ${Number(k.gross_margin_last_90) < 0 ? 'text-red-600' : ''}`}>
                          {inr(k.gross_margin_last_90)}
                        </TableCell>
                        <TableCell className="text-right">{k.gmroi_last_90 != null ? Number(k.gmroi_last_90).toFixed(2) : '—'}</TableCell>
                        <TableCell className="text-right">{k.days_of_inventory != null ? Math.round(k.days_of_inventory) : '—'}</TableCell>
                        <TableCell>{movementClassBadge(k.movement_class)}</TableCell>
                        <TableCell>
                          <Button asChild size="sm" variant="ghost">
                            <Link to={`/inventory/items/${k.item_id}/ledger`}><Eye className="h-3 w-3" /></Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reorder">
          <Card>
            <CardHeader>
              <CardTitle>Reorder Suggestions (Moving Average)</CardTitle>
              <p className="text-sm text-muted-foreground">
                Based on 60-day demand window and {7}-day lead time. Refresh by running detectors.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">In stock</TableHead>
                    <TableHead className="text-right">Avg Daily Demand</TableHead>
                    <TableHead className="text-right">Reorder Point</TableHead>
                    <TableHead className="text-right">Safety Stock</TableHead>
                    <TableHead className="text-right">Suggested Qty</TableHead>
                    <TableHead className="text-right">Confidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No items below reorder point.</TableCell></TableRow>
                  ) : suggestions.map((s) => (
                    <TableRow key={s.item_id}>
                      <TableCell>
                        <div className="font-medium">{s.product_name}</div>
                        <div className="text-xs text-muted-foreground">{s.sku || ''}</div>
                      </TableCell>
                      <TableCell className="text-right">{s.stock_quantity}</TableCell>
                      <TableCell className="text-right">{s.avg_daily_demand.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{s.reorder_point.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{s.safety_stock.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold text-orange-700">{s.suggested_reorder_qty.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{s.confidence}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="hsn">
          <Card>
            <CardHeader><CardTitle>HSN-wise Outward + Inward</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HSN</TableHead>
                    <TableHead className="text-right">Qty Out</TableHead>
                    <TableHead className="text-right">Taxable Out</TableHead>
                    <TableHead className="text-right">GST Out</TableHead>
                    <TableHead className="text-right">Qty In</TableHead>
                    <TableHead className="text-right">Taxable In</TableHead>
                    <TableHead className="text-right">GST In</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsn.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No HSN-tagged movements yet.</TableCell></TableRow>
                  ) : hsn.map((h) => (
                    <TableRow key={h.hsn_sac}>
                      <TableCell className="font-mono">{h.hsn_sac}</TableCell>
                      <TableCell className="text-right">{Number(h.qty_out)}</TableCell>
                      <TableCell className="text-right">{inr(h.taxable_out)}</TableCell>
                      <TableCell className="text-right">{inr(h.gst_out)}</TableCell>
                      <TableCell className="text-right">{Number(h.qty_in)}</TableCell>
                      <TableCell className="text-right">{inr(h.taxable_in)}</TableCell>
                      <TableCell className="text-right">{inr(h.gst_in)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card>
            <CardHeader>
              <CardTitle>Unresolved Anomalies</CardTitle>
              <p className="text-sm text-muted-foreground">Run "Run Detectors" to refresh.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Detected At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalies.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No anomalies.</TableCell></TableRow>
                  ) : anomalies.map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="capitalize">{String(a.anomaly_type).replace('_', ' ')}</TableCell>
                      <TableCell>
                        <Badge className={
                          a.severity === 'critical' ? 'bg-red-100 text-red-800' :
                          a.severity === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-blue-100 text-blue-800'
                        }>{a.severity}</Badge>
                      </TableCell>
                      <TableCell>{a.title}</TableCell>
                      <TableCell>{new Date(a.detected_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default InventoryDashboard;

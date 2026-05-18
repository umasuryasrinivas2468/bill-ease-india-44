import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  IndianRupee, TrendingDown, Boxes, AlertTriangle, ArrowRight, Plus, CalendarClock, Receipt,
} from 'lucide-react';
import { useFixedAssets } from '@/hooks/useFixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const KpiCard: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; tone?: 'default'|'warn'|'ok'|'crit' }> = ({ icon, label, value, sub, tone = 'default' }) => {
  const toneClass = { default: 'text-foreground', warn: 'text-amber-600', ok: 'text-emerald-600', crit: 'text-red-600' }[tone];
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
            <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
            {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
          </div>
          <div className={`rounded-md bg-muted p-2 ${toneClass}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
};

const AssetsDashboard: React.FC = () => {
  const { data: assets = [], isLoading } = useFixedAssets();

  const kpi = useMemo(() => {
    const active = assets.filter((a) => a.status === 'active' || a.status === 'impaired');
    const disposed = assets.filter((a) => a.status === 'disposed' || a.status === 'written_off');
    const gross = active.reduce((s, a) => s + Number(a.total_capitalised_value || 0), 0);
    const accum = active.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0);
    const nbv = active.reduce((s, a) => s + Number(a.book_value || 0), 0);
    return {
      count: active.length,
      gross,
      accum,
      nbv,
      disposed: disposed.length,
      disposalPL: disposed.reduce((s, a) => s + Number(a.profit_loss_on_disposal || 0), 0),
    };
  }, [assets]);

  const recent = useMemo(() => assets.slice(0, 8), [assets]);
  const byCategory = useMemo(() => {
    const map = new Map<string, { count: number; nbv: number }>();
    for (const a of assets) {
      if (a.status !== 'active' && a.status !== 'impaired') continue;
      const k = a.category_name || 'Uncategorised';
      const prev = map.get(k) || { count: 0, nbv: 0 };
      map.set(k, { count: prev.count + 1, nbv: prev.nbv + Number(a.book_value || 0) });
    }
    return Array.from(map.entries()).sort((a, b) => b[1].nbv - a[1].nbv);
  }, [assets]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fixed Assets</h1>
          <p className="text-sm text-muted-foreground">Asset register, depreciation, and lifecycle — fully wired to your books.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/assets/depreciation"><Button variant="outline"><CalendarClock className="h-4 w-4 mr-2" />Depreciation run</Button></Link>
          <Link to="/assets/register"><Button variant="outline"><Boxes className="h-4 w-4 mr-2" />Open register</Button></Link>
          <Link to="/assets/create"><Button><Plus className="h-4 w-4 mr-2" />New asset</Button></Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={<Boxes className="h-5 w-5" />} label="Active assets" value={String(kpi.count)} sub={`${kpi.disposed} disposed`} />
        <KpiCard icon={<IndianRupee className="h-5 w-5" />} label="Gross block" value={inr(kpi.gross)} sub="Capitalised value" />
        <KpiCard icon={<TrendingDown className="h-5 w-5" />} label="Accumulated dep." value={inr(kpi.accum)} tone="warn" />
        <KpiCard icon={<IndianRupee className="h-5 w-5" />} label="Net book value" value={inr(kpi.nbv)} tone="ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent assets</CardTitle>
            <Link to="/assets/register" className="text-xs text-primary inline-flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent>
            {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : recent.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <Receipt className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No assets yet. <Link to="/assets/create" className="text-primary underline">Create the first one</Link>.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Book value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recent.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono text-xs">
                        <Link to={`/assets/${a.id}`} className="text-primary hover:underline">{a.asset_code}</Link>
                      </TableCell>
                      <TableCell>{a.name}</TableCell>
                      <TableCell><span className="text-xs">{a.category_name || '—'}</span></TableCell>
                      <TableCell className="text-right tabular-nums">{inr(a.book_value)}</TableCell>
                      <TableCell>
                        <Badge variant={a.status === 'active' ? 'default' : a.status === 'disposed' ? 'secondary' : 'outline'} className="capitalize text-[10px]">
                          {a.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">By category</CardTitle></CardHeader>
          <CardContent>
            {byCategory.length === 0 ? <div className="text-sm text-muted-foreground">No active assets.</div> : (
              <div className="space-y-2">
                {byCategory.map(([cat, agg]) => (
                  <div key={cat} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{cat}</div>
                      <div className="text-xs text-muted-foreground">{agg.count} asset{agg.count > 1 ? 's' : ''}</div>
                    </div>
                    <div className="text-right tabular-nums">{inr(agg.nbv)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {kpi.accum > kpi.gross * 0.8 && kpi.gross > 0 && (
        <Card className="border-amber-500/40">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Asset block is heavily depreciated</div>
              <div className="text-xs text-muted-foreground">
                Over 80% of gross block has been depreciated. Plan for replacement or impairment review.
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AssetsDashboard;

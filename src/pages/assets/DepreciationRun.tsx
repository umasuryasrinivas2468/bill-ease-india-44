import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, PlayCircle, CalendarClock } from 'lucide-react';
import { useRunDepreciationBatch } from '@/hooks/useDepreciation';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const lastDayOfThisMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

const DepreciationRun: React.FC = () => {
  const { user } = useUser();
  const uid = user && isValidUserId(user.id) ? normalizeUserId(user.id) : null;
  const [asOf, setAsOf] = useState(lastDayOfThisMonth());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const runBatch = useRunDepreciationBatch();

  const { data: due = [], isLoading } = useQuery({
    queryKey: ['depreciation-due', uid, asOf],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('asset_depreciation_schedule')
        .select('id, asset_id, period_index, period_end, depreciation_amount, opening_book_value, closing_book_value, fixed_assets!inner(name, asset_code, category_name)')
        .eq('user_id', uid)
        .eq('status', 'planned')
        .lte('period_end', asOf)
        .order('period_end');
      if (error) throw error;
      return data as any[];
    },
  });

  useEffect(() => {
    setSelected(new Set(due.map((r) => r.id)));
  }, [due]);

  const total = useMemo(
    () => due.filter((r) => selected.has(r.id)).reduce((s, r) => s + Number(r.depreciation_amount || 0), 0),
    [due, selected],
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === due.length) setSelected(new Set());
    else setSelected(new Set(due.map((r) => r.id)));
  };

  const run = () => {
    const assetIds = Array.from(new Set(due.filter((r) => selected.has(r.id)).map((r) => r.asset_id)));
    if (assetIds.length === 0) return;
    runBatch.mutate({ asOf, assetIds });
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center gap-2">
        <Link to="/assets"><Button variant="ghost" size="sm"><ChevronLeft className="h-4 w-4" /></Button></Link>
        <h1 className="text-2xl font-bold tracking-tight">Depreciation Run</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Run parameters</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <Label>Post all due as of</Label>
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
          <div className="md:col-span-2 flex items-end justify-end gap-3">
            <div className="text-sm text-right">
              <div className="text-xs text-muted-foreground">Selected total</div>
              <div className="text-2xl font-bold tabular-nums">{inr(total)}</div>
            </div>
            <Button onClick={run} disabled={runBatch.isPending || selected.size === 0}>
              <PlayCircle className="h-4 w-4 mr-2" />
              Post {selected.size} period{selected.size === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><CalendarClock className="h-4 w-4" />Pending depreciation periods</CardTitle>
          <div className="text-xs text-muted-foreground">{due.length} period{due.length === 1 ? '' : 's'} due</div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div> : due.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">No pending periods. Everything is up to date.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox checked={selected.size === due.length} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Period end</TableHead>
                  <TableHead className="text-right">Opening BV</TableHead>
                  <TableHead className="text-right">Depreciation</TableHead>
                  <TableHead className="text-right">Closing BV</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {due.map((r) => {
                  const a: any = r.fixed_assets;
                  return (
                    <TableRow key={r.id}>
                      <TableCell><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} /></TableCell>
                      <TableCell>
                        <Link to={`/assets/${r.asset_id}`} className="hover:underline">
                          <div className="font-medium">{a?.name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{a?.asset_code} • {a?.category_name || 'Uncategorised'}</div>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">{r.period_end}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.opening_book_value)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{inr(r.depreciation_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{inr(r.closing_book_value)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DepreciationRun;

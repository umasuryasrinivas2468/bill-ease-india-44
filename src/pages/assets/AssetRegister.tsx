import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Download, LayoutGrid, ListTree, MapPin, User as UserIcon } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useFixedAssets } from '@/hooks/useFixedAssets';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const AssetRegister: React.FC = () => {
  const { data: assets = [], isLoading } = useFixedAssets();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  const categories = useMemo(() => {
    const s = new Set<string>();
    assets.forEach((a) => { if (a.category_name) s.add(a.category_name); });
    return Array.from(s).sort();
  }, [assets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && a.category_name !== categoryFilter) return false;
      if (!q) return true;
      return (
        a.asset_code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.vendor_name || '').toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q)
      );
    });
  }, [assets, search, statusFilter, categoryFilter]);

  const totals = useMemo(() => ({
    gross: filtered.reduce((s, a) => s + Number(a.total_capitalised_value || 0), 0),
    accum: filtered.reduce((s, a) => s + Number(a.accumulated_depreciation || 0), 0),
    nbv: filtered.reduce((s, a) => s + Number(a.book_value || 0), 0),
  }), [filtered]);

  const downloadCsv = () => {
    const headers = ['Code', 'Name', 'Category', 'Purchase Date', 'Vendor', 'Gross', 'Accum Dep', 'Book Value', 'Method', 'Useful Life', 'Status'];
    const rows = filtered.map((a) => [
      a.asset_code, a.name, a.category_name || '', a.purchase_date,
      a.vendor_name || '', a.total_capitalised_value, a.accumulated_depreciation,
      a.book_value, a.depreciation_method, a.useful_life_years, a.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fixed-asset-register-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asset Register</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} of {assets.length} assets shown</p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-md border bg-background">
            <Button
              size="sm"
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              className="rounded-r-none"
              onClick={() => setViewMode('table')}
              title="Table view"
            >
              <ListTree className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              className="rounded-l-none"
              onClick={() => setViewMode('grid')}
              title="Card grid view"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={downloadCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
          <Link to="/assets/create"><Button><Plus className="h-4 w-4 mr-2" />New asset</Button></Link>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by code, name, vendor, location…" className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="impaired">Impaired</SelectItem>
                <SelectItem value="disposed">Disposed</SelectItem>
                <SelectItem value="written_off">Written off</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <div className="py-10 text-sm text-muted-foreground text-center">Loading…</div> : viewMode === 'table' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Purchased</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Accum Dep</TableHead>
                  <TableHead className="text-right">Book Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/40">
                    <TableCell className="font-mono text-xs">
                      <Link to={`/assets/${a.id}`} className="text-primary hover:underline">{a.asset_code}</Link>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate">{a.name}</TableCell>
                    <TableCell className="text-xs">{a.category_name || '—'}</TableCell>
                    <TableCell className="text-xs">{a.purchase_date}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{a.depreciation_method}</Badge></TableCell>
                    <TableCell className="text-right tabular-nums">{inr(a.total_capitalised_value)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(a.accumulated_depreciation)}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{inr(a.book_value)}</TableCell>
                    <TableCell>
                      <Badge variant={a.status === 'active' ? 'default' : a.status === 'disposed' ? 'secondary' : 'outline'} className="capitalize text-[10px]">
                        {a.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length > 0 && (
                  <TableRow className="font-semibold bg-muted/30">
                    <TableCell colSpan={5}>Totals</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(totals.gross)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(totals.accum)}</TableCell>
                    <TableCell className="text-right tabular-nums">{inr(totals.nbv)}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((a) => {
                const gross = Number(a.total_capitalised_value || 0);
                const accum = Number(a.accumulated_depreciation || 0);
                const pctDepreciated = gross > 0 ? Math.min(100, Math.round((accum / gross) * 100)) : 0;
                return (
                  <Link key={a.id} to={`/assets/${a.id}`} className="block group">
                    <div className="rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition p-4 h-full flex flex-col">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-mono text-[10px] text-muted-foreground">{a.asset_code}</div>
                        <Badge variant={a.status === 'active' ? 'default' : a.status === 'disposed' ? 'secondary' : 'outline'} className="capitalize text-[10px]">
                          {a.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="font-medium text-sm leading-tight mb-1 line-clamp-2 group-hover:text-primary">{a.name}</div>
                      <div className="text-[11px] text-muted-foreground mb-3">{a.category_name || 'Uncategorised'} · {a.depreciation_method}</div>

                      <div className="mt-auto space-y-1.5">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>Depreciated</span>
                          <span>{pctDepreciated}%</span>
                        </div>
                        <Progress value={pctDepreciated} className="h-1.5" />
                        <div className="flex justify-between items-baseline pt-1.5">
                          <span className="text-[10px] text-muted-foreground">Book value</span>
                          <span className="font-semibold tabular-nums">{inr(a.book_value)}</span>
                        </div>
                        {(a.location || a.custodian) && (
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground pt-1 border-t">
                            {a.location && (
                              <span className="flex items-center gap-1 truncate"><MapPin className="h-2.5 w-2.5 flex-shrink-0" />{a.location}</span>
                            )}
                            {a.custodian && (
                              <span className="flex items-center gap-1 truncate"><UserIcon className="h-2.5 w-2.5 flex-shrink-0" />{a.custodian}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-10 text-sm text-muted-foreground">No assets match the current filters.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetRegister;

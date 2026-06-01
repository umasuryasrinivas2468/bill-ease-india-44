import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchThreeWayReconciliation, fetchItcIntelligence, type ThreeWayStatus, type ThreeWayRow } from '@/services/financialStatementsService';
import { FileSpreadsheet, AlertTriangle, CheckCircle2 } from 'lucide-react';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const currentPeriod = () => new Date().toISOString().slice(0, 7);
const currentFy = () => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const startY = m >= 4 ? y : y - 1;
  return `${startY}-${(startY + 1).toString().slice(2)}`;
};

const STATUS_LABEL: Record<ThreeWayStatus, { label: string; tone: 'success' | 'danger' | 'warning' | 'info' }> = {
  MATCHED:            { label: 'Matched',            tone: 'success' },
  MISSING_IN_PORTAL:  { label: 'In Books, not in Portal', tone: 'danger' },
  MISSING_IN_BOOKS:   { label: 'In Portal, not in Books', tone: 'danger' },
  IN_2B_NOT_2A:       { label: 'In 2B, not in 2A',   tone: 'warning' },
  SUPPLIER_NOT_FILED: { label: 'Supplier not filed', tone: 'warning' },
  GST_MISMATCH:       { label: 'GST mismatch',       tone: 'danger' },
  VALUE_MISMATCH:     { label: 'Value mismatch',     tone: 'warning' },
  ITC_BLOCKED:        { label: 'ITC blocked',        tone: 'info' },
};

const toneClasses: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  danger:  'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info:    'bg-blue-100 text-blue-800 border-blue-200',
};

const GstReconciliation: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [fy, setFy] = useState<string>(currentFy());

  const { data: recon, isLoading } = useQuery({
    queryKey: ['three-way-recon', userId, period],
    queryFn: () => userId ? fetchThreeWayReconciliation(userId, period) : Promise.resolve(null),
    enabled: !!userId,
  });

  const { data: itc } = useQuery({
    queryKey: ['itc-intelligence', userId, fy],
    queryFn: () => userId ? fetchItcIntelligence(userId, fy) : Promise.resolve(null),
    enabled: !!userId,
  });

  const [statusFilter, setStatusFilter] = useState<ThreeWayStatus | 'ALL'>('ALL');
  const rows = useMemo(() => {
    if (!recon?.rows) return [];
    return statusFilter === 'ALL'
      ? recon.rows
      : recon.rows.filter(r => r.reco_status === statusFilter);
  }, [recon, statusFilter]);

  const exportCsv = () => {
    if (!recon?.rows?.length) return;
    const head = ['Status', 'GSTIN', 'Supplier', 'Invoice #', 'Books Date', '2A Date', '2B Date',
      'Books Taxable', '2A Taxable', '2B Taxable', 'Books GST', '2A GST', '2B GST', 'In Books', 'In 2A', 'In 2B'];
    const rs = recon.rows.map(r => [
      STATUS_LABEL[r.reco_status]?.label ?? r.reco_status,
      r.gstin, r.supplier, r.invoice_number,
      r.date_books ?? '', r.date_2a ?? '', r.date_2b ?? '',
      r.tv_books ?? '', r.tv_2a ?? '', r.tv_2b ?? '',
      r.gst_books ?? '', r.gst_2a ?? '', r.gst_2b ?? '',
      r.in_books ? 'Y' : 'N', r.in_2a ? 'Y' : 'N', r.in_2b ? 'Y' : 'N',
    ]);
    const csv = [head, ...rs].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GST_Reconciliation_${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const s = recon?.summary;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold">GST Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Three-way diff: Books (purchase register) vs GSTR-2A vs GSTR-2B. Surfaces missing invoices, mismatches, duplicates and supplier non-filers.
          </p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <Label>Period (Reconciliation)</Label>
            <Input type="month" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
          <div>
            <Label>FY (ITC)</Label>
            <Input value={fy} onChange={e => setFy(e.target.value)} placeholder="2025-26" />
          </div>
          <Button variant="outline" onClick={exportCsv} disabled={!recon?.rows?.length}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <Tabs defaultValue="reco">
        <TabsList>
          <TabsTrigger value="reco">Reconciliation</TabsTrigger>
          <TabsTrigger value="itc">ITC Intelligence</TabsTrigger>
        </TabsList>

        <TabsContent value="reco" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Total Rows</div><div className="text-2xl font-bold">{s?.total_rows ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Matched</div><div className="text-2xl font-bold text-emerald-700">{s?.matched ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Missing in Portal</div><div className="text-2xl font-bold text-red-700">{s?.missing_in_portal ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Missing in Books</div><div className="text-2xl font-bold text-red-700">{s?.missing_in_books ?? 0}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Duplicates in Books</div><div className="text-2xl font-bold text-amber-700">{s?.duplicate_invoices ?? 0}</div></CardContent></Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Books GST</div><div className="text-xl font-semibold">{fmtINR(s?.books_gst)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">GSTR-2A Total</div><div className="text-xl font-semibold">{fmtINR(s?.gst_2a_total)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">GSTR-2B Total</div><div className="text-xl font-semibold">{fmtINR(s?.gst_2b_total)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
              <CardTitle>Reconciliation Rows</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Button variant={statusFilter === 'ALL' ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter('ALL')}>All</Button>
                {(Object.keys(STATUS_LABEL) as ThreeWayStatus[]).map(k => {
                  const counts = (recon?.rows ?? []).filter(r => r.reco_status === k).length;
                  if (!counts) return null;
                  return (
                    <Button key={k} variant={statusFilter === k ? 'default' : 'outline'} size="sm" onClick={() => setStatusFilter(k)}>
                      {STATUS_LABEL[k].label} ({counts})
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Books GST</TableHead>
                      <TableHead className="text-right">2A GST</TableHead>
                      <TableHead className="text-right">2B GST</TableHead>
                      <TableHead>Where</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
                    )}
                    {!isLoading && rows.map((r: ThreeWayRow, idx) => {
                      const meta = STATUS_LABEL[r.reco_status];
                      return (
                        <TableRow key={`${r.gstin}-${r.invoice_number}-${idx}`}>
                          <TableCell>
                            <span className={`inline-block px-2 py-1 rounded-full border text-xs font-medium ${toneClasses[meta?.tone ?? 'info']}`}>
                              {meta?.label ?? r.reco_status}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.gstin}</TableCell>
                          <TableCell>{r.supplier}</TableCell>
                          <TableCell>{r.invoice_number}</TableCell>
                          <TableCell className="text-right">{fmtINR(r.gst_books)}</TableCell>
                          <TableCell className="text-right">{fmtINR(r.gst_2a)}</TableCell>
                          <TableCell className="text-right">{fmtINR(r.gst_2b)}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Badge variant={r.in_books ? 'default' : 'outline'}>Books</Badge>
                              <Badge variant={r.in_2a ? 'default' : 'outline'}>2A</Badge>
                              <Badge variant={r.in_2b ? 'default' : 'outline'}>2B</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {!isLoading && !rows.length && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No discrepancies for this filter. {s?.total_rows ? 'Try "All" to see matched rows.' : 'Upload 2A/2B and post books first.'}</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {!!(recon?.duplicates?.length) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /> Duplicate Invoices in Books</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead className="text-right">Occurrences</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recon.duplicates.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{d.gstin}</TableCell>
                        <TableCell>{d.invoice_number}</TableCell>
                        <TableCell className="text-right">{d.dup_count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="itc" className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Available (2B)</div><div className="text-2xl font-semibold">{fmtINR(itc?.available)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Claimed (Books)</div><div className="text-2xl font-semibold text-emerald-700">{fmtINR(itc?.claimed)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Unclaimed</div><div className="text-2xl font-semibold text-amber-700">{fmtINR(itc?.unclaimed)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Blocked</div><div className="text-2xl font-semibold text-red-700">{fmtINR(itc?.blocked)}</div></CardContent></Card>
            <Card><CardContent className="p-4"><div className="text-xs uppercase text-muted-foreground">Leakage</div><div className="text-2xl font-semibold text-red-700">{fmtINR(itc?.leakage)}</div></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>What these numbers mean</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2 leading-relaxed">
              <p><b>Available</b> — total GST credit reflected in your GSTR-2B uploads for the FY.</p>
              <p><b>Claimed</b> — ITC actually debited to your Input GST / ITC ledger accounts via journals.</p>
              <p><b>Unclaimed</b> — Available − Claimed − Blocked. Sitting on the table; review GSTR-3B.</p>
              <p><b>Blocked</b> — 2B rows flagged ineligible (Sec 17(5) — motor vehicles, food, etc.).</p>
              <p><b>Leakage</b> — books carry GST that never showed up in 2B (vendor non-filers, fake invoices).</p>
              {itc && itc.unclaimed > 0 && (
                <div className="flex items-start gap-2 text-amber-700 bg-amber-50 p-3 rounded border border-amber-200 mt-3">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  You have {fmtINR(itc.unclaimed)} of unclaimed ITC for {itc.fiscal_year}. Make sure your next GSTR-3B picks it up.
                </div>
              )}
              {itc && itc.leakage > 0 && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 p-3 rounded border border-red-200">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  {fmtINR(itc.leakage)} of GST in books is missing from 2B. Chase non-filing suppliers.
                </div>
              )}
              {itc && itc.unclaimed === 0 && itc.leakage === 0 && (itc.available > 0 || itc.claimed > 0) && (
                <div className="flex items-start gap-2 text-emerald-700 bg-emerald-50 p-3 rounded border border-emerald-200">
                  <CheckCircle2 className="h-4 w-4 mt-0.5" /> Clean — books and portal agree, no leakage.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GstReconciliation;

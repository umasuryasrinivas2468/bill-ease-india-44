import React, { useEffect, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Loader2, RefreshCw, Upload, Wand2, CheckCircle2, AlertTriangle, FileText, Link2, Unlink2,
} from 'lucide-react';
import {
  refreshTDSBookEntries, autoMatchTDS, fetchTDSReconciliation, import26ASBatch,
  manuallyMatchTDS, unmatchTDS,
  TDSReconciliation as Recon, TDS26ASImportRow,
} from '@/services/financialStatementsService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props { financialYear: string; assesseePan?: string; }

const formatINR = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return '';
  if (n === 0) return '-';
  const abs = Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  return n < 0 ? `(${abs})` : abs;
};

// Parse a Form 26AS CSV (simple, comma-separated)
const parseCSV = (csv: string): TDS26ASImportRow[] => {
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const idx = {
    q:        col('quarter'),
    name:     col('deductor_name'),
    tan:      col('deductor_tan'),
    section:  col('tds_section'),
    date:     col('date_of_payment'),
    amount:   col('amount_paid'),
    tds:      col('tds_amount'),
    status:   col('status'),
  };
  const rows: TDS26ASImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const q = (cols[idx.q] || 'Q1').toUpperCase();
    if (!['Q1','Q2','Q3','Q4'].includes(q)) continue;
    rows.push({
      quarter:      q as 'Q1' | 'Q2' | 'Q3' | 'Q4',
      deductor_name: cols[idx.name] || '',
      deductor_tan:  (cols[idx.tan] || '').toUpperCase(),
      tds_section:   cols[idx.section] || undefined,
      date_of_payment: cols[idx.date] || undefined,
      amount_paid:   parseFloat(cols[idx.amount] || '0') || 0,
      tds_amount:    parseFloat(cols[idx.tds] || '0') || 0,
      deductor_return_status: cols[idx.status] || undefined,
    });
  }
  return rows;
};

const TDSReconciliation: React.FC<Props> = ({ financialYear, assesseePan }) => {
  const { user } = useUser();
  const [recon, setRecon] = useState<Recon | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Import dialog
  const [openImport, setOpenImport] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [pan, setPan] = useState(assesseePan ?? '');

  // Manual match dialog
  const [openManualMatch, setOpenManualMatch] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [selected26asId, setSelected26asId] = useState<string | null>(null);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    setRecon(await fetchTDSReconciliation(user.id, financialYear));
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user?.id, financialYear]);

  const handleRefreshBookEntries = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const n = await refreshTDSBookEntries(user.id, financialYear);
      toast.success(`Pulled ${n} TDS book entry(s) from payments`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to refresh');
    } finally { setBusy(false); }
  };

  const handleAutoMatch = async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const n = await autoMatchTDS(user.id, financialYear);
      toast.success(`Auto-matched ${n} entry(s)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Auto-match failed');
    } finally { setBusy(false); }
  };

  const handleImport = async () => {
    if (!user?.id || !pan.trim() || !csvText.trim()) {
      toast.error('PAN + CSV body required'); return;
    }
    const rows = parseCSV(csvText);
    if (rows.length === 0) {
      toast.error('No valid rows parsed. Expected columns: quarter, deductor_name, deductor_tan, tds_section, date_of_payment, amount_paid, tds_amount, status');
      return;
    }
    setBusy(true);
    try {
      const result = await import26ASBatch(user.id, financialYear, pan.trim().toUpperCase(), rows);
      toast.success(`Imported ${result?.rows_imported ?? rows.length} 26AS entries`);
      setOpenImport(false);
      setCsvText('');
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Import failed');
    } finally { setBusy(false); }
  };

  const handleManualMatch = async () => {
    if (!user?.id || !selectedBookId || !selected26asId) return;
    try {
      await manuallyMatchTDS(user.id, selectedBookId, selected26asId, 'Manually matched');
      toast.success('Matched');
      setSelectedBookId(null); setSelected26asId(null);
      setOpenManualMatch(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? 'Match failed');
    }
  };

  const handleUnmatch = async (matchId: string) => {
    if (!confirm('Unmatch this pair? They will return to the unmatched buckets.')) return;
    try {
      await unmatchTDS(matchId);
      toast.success('Unmatched');
      await load();
    } catch {
      toast.error('Failed to unmatch');
    }
  };

  if (loading && !recon) {
    return (
      <Card><CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading TDS reconciliation…
      </CardContent></Card>
    );
  }

  const diff = (recon?.book_total ?? 0) - (recon?.['26as_total'] ?? 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" /> TDS Reconciliation with Form 26AS
          </CardTitle>
          <CardDescription>
            FY {financialYear} · Match TDS receivable in books against ITD's Form 26AS
            to surface deductor-side filing gaps before ITR processing.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 flex-shrink-0">
          <Button size="sm" variant="outline" onClick={handleRefreshBookEntries} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            <span className="ml-1.5 hidden sm:inline">Pull from Payments</span>
          </Button>
          <Dialog open={openImport} onOpenChange={setOpenImport}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Upload className="h-4 w-4 mr-1.5" />Import 26AS</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Import Form 26AS</DialogTitle>
                <DialogDescription>
                  Paste a CSV with columns: <code>quarter, deductor_name, deductor_tan, tds_section, date_of_payment, amount_paid, tds_amount, status</code>.
                  Get this from the TRACES portal → Form 26AS download.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label htmlFor="i-pan">Assessee PAN *</Label>
                  <Input id="i-pan" placeholder="ABCDE1234F" maxLength={10}
                         value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="i-csv">CSV body *</Label>
                  <textarea id="i-csv" rows={12}
                    className="w-full rounded-md border px-3 py-2 text-xs font-mono"
                    placeholder="quarter,deductor_name,deductor_tan,tds_section,date_of_payment,amount_paid,tds_amount,status&#10;Q1,ABC Corp Pvt Ltd,DELA12345E,194J,2025-05-15,100000,10000,matched_with_oltas"
                    value={csvText} onChange={(e) => setCsvText(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenImport(false)}>Cancel</Button>
                <Button onClick={handleImport} disabled={busy || !pan.trim() || !csvText.trim()}>Import</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button size="sm" onClick={handleAutoMatch} disabled={busy}>
            <Wand2 className="h-4 w-4 mr-1.5" />Auto-match
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!recon ? null : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Books — Total TDS</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(recon.book_total)}</div>
                <div className="text-[10px] text-muted-foreground">{recon.book_count} entry(s)</div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">26AS — Total TDS</div>
                <div className="text-base font-semibold tabular-nums">₹ {formatINR(recon['26as_total'])}</div>
                <div className="text-[10px] text-muted-foreground">{recon['26as_count']} entry(s)</div>
              </div>
              <div className={cn('rounded-lg border p-3',
                Math.abs(diff) > 1 ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800' : 'bg-muted/20')}>
                <div className="text-[10px] uppercase text-muted-foreground">Difference</div>
                <div className={cn('text-base font-semibold tabular-nums',
                  Math.abs(diff) > 1 ? 'text-amber-600' : 'text-emerald-600')}>
                  ₹ {formatINR(diff)}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-3">
                <div className="text-[10px] uppercase text-muted-foreground">Matched</div>
                <div className="text-base font-semibold tabular-nums text-emerald-600">
                  {recon.matched_count} pair(s)
                </div>
                <div className="text-[10px] text-muted-foreground">₹ {formatINR(recon.matched_book_total)}</div>
              </div>
            </div>

            <Tabs defaultValue="matched">
              <TabsList>
                <TabsTrigger value="matched">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Matched ({recon.matched_count})
                </TabsTrigger>
                <TabsTrigger value="book_only">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />Books Only ({recon.book_only_count})
                </TabsTrigger>
                <TabsTrigger value="as26_only">
                  <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />26AS Only ({recon['26as_only_count']})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="matched" className="pt-3">
                {!recon.matched || recon.matched.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">No matches yet. Try Auto-match.</div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Type</th>
                          <th className="px-3 py-2 text-left font-medium">Customer (Books)</th>
                          <th className="px-3 py-2 text-left font-medium">Deductor (26AS)</th>
                          <th className="px-3 py-2 text-center font-medium">TAN</th>
                          <th className="px-3 py-2 text-right font-medium">Book TDS</th>
                          <th className="px-3 py-2 text-right font-medium">26AS TDS</th>
                          <th className="px-3 py-2 text-right font-medium">Diff</th>
                          <th className="px-3 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.matched.map(m => (
                          <tr key={m.id} className="border-t">
                            <td className="px-3 py-1.5">
                              <Badge variant={m.match_type === 'manual' ? 'default' : 'outline'} className="text-[10px]">
                                {m.match_type}
                              </Badge>
                            </td>
                            <td className="px-3 py-1.5">{m.customer_name}</td>
                            <td className="px-3 py-1.5 text-xs">{m.deductor_name}</td>
                            <td className="px-3 py-1.5 text-center font-mono text-[10px]">{m.deductor_tan}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(m.book_tds)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(m.as26_tds)}</td>
                            <td className={cn('px-3 py-1.5 text-right tabular-nums',
                              Math.abs(m.amount_diff) > 0.01 ? 'text-amber-600' : 'text-emerald-600')}>
                              {formatINR(m.amount_diff)}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <Button size="sm" variant="ghost" onClick={() => handleUnmatch(m.id)} title="Unmatch">
                                <Unlink2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="book_only" className="pt-3">
                {!recon.book_only || recon.book_only.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">All book entries matched.</div>
                ) : (
                  <>
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 mb-3 text-sm dark:bg-amber-950/20 dark:border-amber-800">
                      <strong>Risk:</strong> TDS deducted by your customer but NOT appearing in 26AS.
                      Likely cause: deductor hasn't filed their TDS return. Follow up with the customer.
                    </div>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Q</th>
                            <th className="px-3 py-2 text-left font-medium">Customer</th>
                            <th className="px-3 py-2 text-left font-medium">TAN</th>
                            <th className="px-3 py-2 text-right font-medium">TDS Amount</th>
                            <th className="px-3 py-2 text-left font-medium">Invoice Date</th>
                            <th className="px-3 py-2 text-center font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recon.book_only.map(b => (
                            <tr key={b.id} className={cn('border-t', selectedBookId === b.id && 'bg-blue-50 dark:bg-blue-950/20')}>
                              <td className="px-3 py-1.5"><Badge variant="outline" className="text-[10px]">{b.quarter}</Badge></td>
                              <td className="px-3 py-1.5">{b.customer_name}</td>
                              <td className="px-3 py-1.5 font-mono text-[10px]">{b.customer_tan ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(b.tds_amount)}</td>
                              <td className="px-3 py-1.5 text-xs">{b.invoice_date ? new Date(b.invoice_date).toLocaleDateString('en-IN') : '—'}</td>
                              <td className="px-3 py-1.5 text-center">
                                <Button size="sm" variant={selectedBookId === b.id ? 'default' : 'ghost'}
                                        onClick={() => { setSelectedBookId(b.id); setOpenManualMatch(true); }}>
                                  <Link2 className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </TabsContent>

              <TabsContent value="as26_only" className="pt-3">
                {!recon['26as_only'] || recon['26as_only'].length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">All 26AS entries matched.</div>
                ) : (
                  <>
                    <div className="rounded-md border border-sky-300 bg-sky-50 p-3 mb-3 text-sm dark:bg-sky-950/20 dark:border-sky-800">
                      <strong>Opportunity:</strong> TDS credit available in 26AS but no matching book entry.
                      Likely cause: invoice not yet recorded, or TDS section/amount on the invoice differs.
                      Verify and either add the missing invoice or manually link to an existing book entry.
                    </div>
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Q</th>
                            <th className="px-3 py-2 text-left font-medium">Deductor</th>
                            <th className="px-3 py-2 text-left font-medium">TAN</th>
                            <th className="px-3 py-2 text-left font-medium">Section</th>
                            <th className="px-3 py-2 text-right font-medium">TDS Amount</th>
                            <th className="px-3 py-2 text-left font-medium">Payment Date</th>
                            <th className="px-3 py-2 text-center font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recon['26as_only'].map(a => (
                            <tr key={a.id} className="border-t">
                              <td className="px-3 py-1.5"><Badge variant="outline" className="text-[10px]">{a.quarter}</Badge></td>
                              <td className="px-3 py-1.5 text-xs">{a.deductor_name}</td>
                              <td className="px-3 py-1.5 font-mono text-[10px]">{a.deductor_tan}</td>
                              <td className="px-3 py-1.5 text-xs">{a.tds_section ?? '—'}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{formatINR(a.tds_amount)}</td>
                              <td className="px-3 py-1.5 text-xs">{a.date_of_payment ? new Date(a.date_of_payment).toLocaleDateString('en-IN') : '—'}</td>
                              <td className="px-3 py-1.5 text-center">
                                {a.deductor_return_status === 'matched_with_oltas'
                                  ? <Badge variant="default" className="text-[10px]">OLTAS</Badge>
                                  : <Badge variant="secondary" className="text-[10px]">{a.deductor_return_status ?? '—'}</Badge>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>

            {/* Manual Match Dialog */}
            <Dialog open={openManualMatch} onOpenChange={setOpenManualMatch}>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Manually match this book entry</DialogTitle>
                  <DialogDescription>Select a 26AS entry to link this book entry to.</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
                  {(recon['26as_only'] ?? []).map(a => (
                    <div key={a.id}
                         onClick={() => setSelected26asId(a.id)}
                         className={cn(
                           'rounded border p-2 text-xs cursor-pointer hover:bg-muted/50',
                           selected26asId === a.id && 'border-primary bg-primary/5')}>
                      <div className="flex justify-between">
                        <div>
                          <div className="font-medium">{a.deductor_name}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">{a.deductor_tan} · {a.quarter} · {a.tds_section}</div>
                        </div>
                        <div className="text-right tabular-nums">₹ {formatINR(a.tds_amount)}</div>
                      </div>
                    </div>
                  ))}
                  {(recon['26as_only']?.length ?? 0) === 0 && (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      No unmatched 26AS entries — import 26AS first.
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => { setOpenManualMatch(false); setSelectedBookId(null); setSelected26asId(null); }}>Cancel</Button>
                  <Button onClick={handleManualMatch} disabled={!selectedBookId || !selected26asId}>Match</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default TDSReconciliation;

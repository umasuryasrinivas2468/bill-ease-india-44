import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, ArrowLeft, ArrowRight, FileSpreadsheet } from 'lucide-react';
import { useInvoiceRegister } from '@/hooks/useInvoiceRegister';
import { useARAging, useARAgingSummary } from '@/hooks/useARAging';
import { useCustomerProfitability } from '@/hooks/useARDashboard';
import { useCustomerBalances } from '@/hooks/useCustomerLedger';
import { useSalesReturns } from '@/hooks/useSalesReturns';

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);

const downloadCSV = (rows: any[], filename: string) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r =>
      headers.map(h => {
        const v = r[h];
        if (v === null || v === undefined) return '';
        if (typeof v === 'object') return `"${JSON.stringify(v).replace(/"/g, '""')}"`;
        const s = String(v);
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    ),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
};

const AR_TAB_VALUES = new Set(['register', 'aging', 'outstanding', 'profitability', 'balances', 'returns']);

const ARReports: React.FC = () => {
  const today = new Date().toISOString().split('T')[0];
  const monthStart = new Date();
  monthStart.setDate(1);

  const [from, setFrom] = useState<string>(monthStart.toISOString().split('T')[0]);
  const [to, setTo] = useState<string>(today);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab');
  const activeTab = tabFromUrl && AR_TAB_VALUES.has(tabFromUrl) ? tabFromUrl : 'register';
  const handleTabChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  const { data: register = [] } = useInvoiceRegister({ from, to, withJournal: true });
  const { data: aging = [] } = useARAging();
  const { data: agingSummary = [] } = useARAgingSummary();
  const { data: profitability = [] } = useCustomerProfitability();
  const { data: balances = [] } = useCustomerBalances();
  const { data: salesReturns = [] } = useSalesReturns();

  const returnsInRange = useMemo(
    () => salesReturns.filter(r => r.return_date >= from && r.return_date <= to),
    [salesReturns, from, to]
  );
  const returnsTotals = useMemo(() =>
    returnsInRange.reduce((acc, r) => ({
      subtotal: acc.subtotal + Number(r.subtotal || 0),
      gst:      acc.gst      + Number(r.gst_amount || 0),
      total:    acc.total    + Number(r.total_amount || 0),
      count:    acc.count    + 1,
    }), { subtotal: 0, gst: 0, total: 0, count: 0 }),
    [returnsInRange]
  );

  // GSTR-1 totals
  const gstrTotals = useMemo(() => {
    return register.reduce((acc, r) => ({
      taxable_value: acc.taxable_value + Number(r.taxable_value || 0),
      cgst:          acc.cgst          + Number(r.cgst_amount || 0),
      sgst:          acc.sgst          + Number(r.sgst_amount || 0),
      igst:          acc.igst          + Number(r.igst_amount || 0),
      cess:          acc.cess          + Number(r.cess_amount || 0),
      total:         acc.total         + Number(r.total_amount || 0),
    }), { taxable_value: 0, cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });
  }, [register]);

  const profitSorted = useMemo(
    () => [...profitability].sort((a, b) => (b.gross_margin || 0) - (a.gross_margin || 0)),
    [profitability]
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/ar-dashboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to AR Dashboard</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold">AR Reports</h1>
          <p className="text-muted-foreground">Invoice Register, Aging, Outstanding, Customer Profitability.</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="register">Invoice Register (GSTR-1)</TabsTrigger>
          <TabsTrigger value="aging">Aging</TabsTrigger>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="profitability">Customer Profitability</TabsTrigger>
          <TabsTrigger value="balances">Customer Balances</TabsTrigger>
          <TabsTrigger value="returns">Sales Returns</TabsTrigger>
        </TabsList>

        {/* ── Invoice Register / GSTR-1 ── */}
        <TabsContent value="register">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Invoice Register — {from} to {to}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(register, `invoice-register-${from}_${to}.csv`)}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Taxable</div>
                  <div className="mt-1 font-semibold">{inr(gstrTotals.taxable_value)}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">CGST</div>
                  <div className="mt-1 font-semibold">{inr(gstrTotals.cgst)}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">SGST</div>
                  <div className="mt-1 font-semibold">{inr(gstrTotals.sgst)}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">IGST</div>
                  <div className="mt-1 font-semibold">{inr(gstrTotals.igst)}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Cess</div>
                  <div className="mt-1 font-semibold">{inr(gstrTotals.cess)}</div>
                </div>
                <div className="rounded-md border p-3 bg-primary/5">
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="mt-1 font-bold">{inr(gstrTotals.total)}</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>GSTIN</TableHead>
                      <TableHead>POS</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">CGST</TableHead>
                      <TableHead className="text-right">SGST</TableHead>
                      <TableHead className="text-right">IGST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Journal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {register.length === 0 && (
                      <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">No invoices in this range.</TableCell></TableRow>
                    )}
                    {register.map(r => (
                      <TableRow key={r.invoice_id}>
                        <TableCell className="whitespace-nowrap">{r.invoice_date}</TableCell>
                        <TableCell className="font-mono text-sm">{r.invoice_number}</TableCell>
                        <TableCell>{r.client_name}</TableCell>
                        <TableCell className="font-mono text-xs">{r.client_gst_number || '—'}</TableCell>
                        <TableCell className="text-xs">{r.place_of_supply || '—'}</TableCell>
                        <TableCell className="text-right">{inr(r.taxable_value)}</TableCell>
                        <TableCell className="text-right">{inr(r.cgst_amount)}</TableCell>
                        <TableCell className="text-right">{inr(r.sgst_amount)}</TableCell>
                        <TableCell className="text-right">{inr(r.igst_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{inr(r.total_amount)}</TableCell>
                        <TableCell className="text-xs">
                          {r.journal_number || <span className="text-muted-foreground">unposted</span>}
                          {r.is_reversed && <Badge variant="destructive" className="ml-1">reversed</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aging ── */}
        <TabsContent value="aging">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>AR Aging by Customer</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(agingSummary, `ar-aging-${today}.csv`)}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Not due</TableHead>
                      <TableHead className="text-right">0–30</TableHead>
                      <TableHead className="text-right">31–60</TableHead>
                      <TableHead className="text-right">61–90</TableHead>
                      <TableHead className="text-right">90+</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {agingSummary.length === 0 && (
                      <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No outstanding invoices.</TableCell></TableRow>
                    )}
                    {agingSummary.map(r => (
                      <TableRow key={r.customer_id || r.customer_name}>
                        <TableCell className="font-medium">{r.customer_name}</TableCell>
                        <TableCell className="text-right">{r.invoice_count}</TableCell>
                        <TableCell className="text-right">{inr(r.not_due)}</TableCell>
                        <TableCell className="text-right">{inr(r.overdue_0_30)}</TableCell>
                        <TableCell className="text-right text-amber-600">{inr(r.overdue_31_60)}</TableCell>
                        <TableCell className="text-right text-orange-600">{inr(r.overdue_61_90)}</TableCell>
                        <TableCell className="text-right text-red-600 font-semibold">{inr(r.overdue_90_plus)}</TableCell>
                        <TableCell className="text-right font-bold">{inr(r.total_outstanding)}</TableCell>
                        <TableCell>
                          {r.customer_id && (
                            <Button asChild variant="ghost" size="sm">
                              <Link to={`/customer-ledger?customer=${r.customer_id}`}>
                                Ledger <ArrowRight className="ml-1 h-3 w-3" />
                              </Link>
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Outstanding (per-invoice) ── */}
        <TabsContent value="outstanding">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Outstanding Invoices</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(aging, `outstanding-${today}.csv`)}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Days overdue</TableHead>
                      <TableHead>Bucket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aging.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nothing outstanding.</TableCell></TableRow>
                    )}
                    {aging.map(r => (
                      <TableRow key={r.invoice_id}>
                        <TableCell className="font-mono text-sm">{r.invoice_number}</TableCell>
                        <TableCell>{r.customer_name}</TableCell>
                        <TableCell>{r.due_date || '—'}</TableCell>
                        <TableCell className="text-right">{inr(r.total_amount)}</TableCell>
                        <TableCell className="text-right">{inr(r.paid_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{inr(r.outstanding)}</TableCell>
                        <TableCell className={`text-right ${r.days_overdue > 30 ? 'text-red-600' : r.days_overdue > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                          {r.days_overdue > 0 ? `${r.days_overdue}d` : 'not due'}
                        </TableCell>
                        <TableCell><Badge variant="outline">{r.bucket.replace(/_/g, ' ')}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customer Profitability ── */}
        <TabsContent value="profitability">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Customer Profitability</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(profitSorted, `customer-profitability-${today}.csv`)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">COGS</TableHead>
                    <TableHead className="text-right">Returns</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Margin %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profitSorted.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">Not enough data.</TableCell></TableRow>
                  )}
                  {profitSorted.map(p => (
                    <TableRow key={p.customer_id}>
                      <TableCell className="font-medium">{p.customer_name}</TableCell>
                      <TableCell className="text-right">{inr(p.revenue)}</TableCell>
                      <TableCell className="text-right">{inr(p.cogs)}</TableCell>
                      <TableCell className="text-right">{inr(p.returns_value)}</TableCell>
                      <TableCell className={`text-right font-semibold ${(p.gross_margin || 0) < 0 ? 'text-red-600' : ''}`}>
                        {inr(p.gross_margin)}
                      </TableCell>
                      <TableCell className="text-right">{(p.margin_pct || 0).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Customer Balances (CA tie-out) ── */}
        <TabsContent value="balances">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Customer Balances — control account tie-out</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(balances, `customer-balances-${today}.csv`)}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Sum of closing balances should equal the Accounts Receivable account in the trial balance.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Invoiced</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Credit Notes</TableHead>
                    <TableHead className="text-right">Adv. Adjusted</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No customers.</TableCell></TableRow>
                  )}
                  {balances.map(b => (
                    <TableRow key={b.customer_id}>
                      <TableCell className="font-medium">{b.customer_name}</TableCell>
                      <TableCell className="text-right">{inr(b.opening_balance)}</TableCell>
                      <TableCell className="text-right">{inr(b.total_invoiced)}</TableCell>
                      <TableCell className="text-right">{inr(b.total_received)}</TableCell>
                      <TableCell className="text-right">{inr(b.total_credit_notes)}</TableCell>
                      <TableCell className="text-right">{inr(b.total_advance_adjusted)}</TableCell>
                      <TableCell className={`text-right font-bold ${(b.closing_balance || 0) > 0 ? 'text-amber-600' : ''}`}>
                        {inr(b.closing_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Sales Returns Register ── */}
        <TabsContent value="returns">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Sales Returns Register — {from} to {to}</CardTitle>
              <Button variant="outline" size="sm" onClick={() => downloadCSV(returnsInRange, `sales-returns-${from}_${to}.csv`)}>
                <Download className="mr-2 h-4 w-4" />Export CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Returns</div>
                  <div className="mt-1 font-semibold">{returnsTotals.count}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">Taxable</div>
                  <div className="mt-1 font-semibold">{inr(returnsTotals.subtotal)}</div>
                </div>
                <div className="rounded-md border p-3 bg-muted/30">
                  <div className="text-xs text-muted-foreground">GST Reversed</div>
                  <div className="mt-1 font-semibold">{inr(returnsTotals.gst)}</div>
                </div>
                <div className="rounded-md border p-3 bg-primary/5">
                  <div className="text-xs text-muted-foreground">Total Credit</div>
                  <div className="mt-1 font-bold">{inr(returnsTotals.total)}</div>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Return #</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Taxable</TableHead>
                      <TableHead className="text-right">GST</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">COGS Reversed</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnsInRange.length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">No sales returns in this range.</TableCell></TableRow>
                    )}
                    {returnsInRange.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.return_date}</TableCell>
                        <TableCell className="font-mono text-sm">{r.return_number}</TableCell>
                        <TableCell>{r.invoice_number}</TableCell>
                        <TableCell>{r.customer_name}</TableCell>
                        <TableCell className="capitalize">{r.outcome}</TableCell>
                        <TableCell className="text-right">{inr(r.subtotal)}</TableCell>
                        <TableCell className="text-right">{inr(r.gst_amount)}</TableCell>
                        <TableCell className="text-right font-semibold">{inr(r.total_amount)}</TableCell>
                        <TableCell className="text-right">{inr(r.cogs_reversed)}</TableCell>
                        <TableCell className="capitalize">{r.status}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ARReports;

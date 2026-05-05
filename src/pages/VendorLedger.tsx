import React, { useState, useMemo } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, FileText, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useVendors } from '@/hooks/useVendors';
import { useVendorLedger } from '@/hooks/useVendorLedger';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(n || 0);

const VendorLedger: React.FC = () => {
  const params = useParams<{ vendorId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [vendorId, setVendorId] = useState<string>(params.vendorId || searchParams.get('vendor') || '');

  const { data: vendors = [] } = useVendors();
  const { data: rows = [], isLoading } = useVendorLedger(vendorId || undefined);

  const vendor = vendors.find(v => v.id === vendorId);

  const summary = useMemo(() => {
    const totalDebit = rows.reduce((s, r) => s + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((s, r) => s + Number(r.credit || 0), 0);
    const balance = totalCredit - totalDebit;
    const billCount = rows.filter(r => r.txn_type === 'bill').length;
    const paymentCount = rows.filter(r => r.txn_type === 'payment').length;
    return { totalDebit, totalCredit, balance, billCount, paymentCount };
  }, [rows]);

  const onExport = () => {
    if (!rows.length) return;
    const csv = [
      ['Date', 'Type', 'Reference', 'Narration', 'Debit', 'Credit', 'Balance'].join(','),
      ...rows.map(r => [
        r.txn_date,
        r.txn_type,
        r.reference || '',
        `"${(r.narration || '').replace(/"/g, '""')}"`,
        r.debit || 0,
        r.credit || 0,
        r.running_balance || 0,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vendor-ledger-${vendor?.name || vendorId}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/payables"><ArrowLeft className="mr-2 h-4 w-4" />Back to Payables</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold md:text-3xl">Vendor Ledger</h1>
          <p className="text-muted-foreground">Chronological bills, payments and advance adjustments with running balance.</p>
        </div>
        <Button variant="outline" onClick={onExport} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Vendor</span>
            <Select value={vendorId} onValueChange={(v) => { setVendorId(v); setSearchParams({ vendor: v }); }}>
              <SelectTrigger className="w-[320px]"><SelectValue placeholder="Choose a vendor" /></SelectTrigger>
              <SelectContent>
                {vendors.map(v => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vendor?.gst_number && <Badge variant="outline">GSTIN: {vendor.gst_number}</Badge>}
          </div>
        </CardContent>
      </Card>

      {vendorId && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Total Bills (Cr)</p>
              <p className="text-2xl font-bold text-red-600">{inr(summary.totalCredit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{summary.billCount} bills</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Settled (Dr)</p>
              <p className="text-2xl font-bold text-green-600">{inr(summary.totalDebit)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{summary.paymentCount} txns</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className={`text-2xl font-bold ${summary.balance > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {inr(summary.balance)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-muted-foreground">Entries</p>
              <p className="text-2xl font-bold">{rows.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Ledger</CardTitle></CardHeader>
        <CardContent>
          {!vendorId ? (
            <p className="text-sm text-muted-foreground">Pick a vendor above to view their ledger.</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No bill or payment activity for this vendor yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Narration</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.source_id}-${i}`}>
                      <TableCell className="whitespace-nowrap">{r.txn_date}</TableCell>
                      <TableCell>
                        <Badge variant={r.txn_type === 'bill' ? 'default' : 'secondary'} className="gap-1">
                          {r.txn_type === 'bill' ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                          {r.txn_type.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{r.reference}</TableCell>
                      <TableCell className="max-w-md text-sm text-muted-foreground">
                        <FileText className="mr-1 inline h-3 w-3" />
                        {r.narration}
                      </TableCell>
                      <TableCell className="text-right font-mono text-green-700">
                        {r.debit > 0 ? inr(r.debit) : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-700">
                        {r.credit > 0 ? inr(r.credit) : ''}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {inr(r.running_balance || 0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VendorLedger;

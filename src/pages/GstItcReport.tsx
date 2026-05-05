import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Receipt } from 'lucide-react';
import { useGstItc } from '@/hooks/useVendorLedger';

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0);

const monthLabel = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
};

const GstItcReport: React.FC = () => {
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString().slice(0, 10);
  const defaultTo = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const { data: rows = [], isLoading } = useGstItc({ from, to });

  const totals = useMemo(() => ({
    taxable: rows.reduce((s, r) => s + Number(r.taxable_value || 0), 0),
    itc: rows.reduce((s, r) => s + Number(r.itc_available || 0), 0),
    gross: rows.reduce((s, r) => s + Number(r.gross_value || 0), 0),
    bills: rows.reduce((s, r) => s + Number(r.bill_count || 0), 0),
  }), [rows]);

  const onExport = () => {
    if (!rows.length) return;
    const csv = [
      ['Period', 'Vendor', 'GSTIN', 'Bills', 'Taxable Value', 'ITC Available', 'Gross Value'].join(','),
      ...rows.map(r => [
        monthLabel(r.period_month),
        `"${r.vendor_name}"`,
        r.vendor_gst_number || '',
        r.bill_count,
        r.taxable_value,
        r.itc_available,
        r.gross_value,
      ].join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gst-itc-${from}-to-${to}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">GST Input Tax Credit (ITC) Report</h1>
          <p className="text-muted-foreground">Monthly ITC available from vendor purchase bills.</p>
        </div>
        <Button variant="outline" onClick={onExport} disabled={!rows.length}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label>From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <Label>To</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Bills</p>
          <p className="text-2xl font-bold">{totals.bills}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Taxable Value</p>
          <p className="text-2xl font-bold">{inr(totals.taxable)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">ITC Available</p>
          <p className="text-2xl font-bold text-green-600">{inr(totals.itc)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Gross Value</p>
          <p className="text-2xl font-bold">{inr(totals.gross)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />ITC by Month & Vendor</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No GST-bearing bills in the selected window.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>GSTIN</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">ITC</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={`${r.period_month}-${r.vendor_name}-${i}`}>
                    <TableCell>{monthLabel(r.period_month)}</TableCell>
                    <TableCell className="font-medium">{r.vendor_name}</TableCell>
                    <TableCell>
                      {r.vendor_gst_number
                        ? <Badge variant="outline" className="font-mono">{r.vendor_gst_number}</Badge>
                        : <span className="text-xs text-muted-foreground">— no GSTIN —</span>}
                    </TableCell>
                    <TableCell className="text-right">{r.bill_count}</TableCell>
                    <TableCell className="text-right font-mono">{inr(r.taxable_value)}</TableCell>
                    <TableCell className="text-right font-mono text-green-700">{inr(r.itc_available)}</TableCell>
                    <TableCell className="text-right font-mono">{inr(r.gross_value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default GstItcReport;

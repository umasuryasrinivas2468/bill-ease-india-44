import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { FileSpreadsheet, Download, FileText } from 'lucide-react';
import { useGST1Data, GST1Row, HSNSummaryRow } from '@/hooks/useGST1Data';
import { DateRangePicker } from '@/components/DateRangePicker';
import { formatINR, round2 } from '@/lib/gst';

// GSTR-1 ready report (Feature #21).
// Tabbed: B2B / B2C / CDNR / CDN-UR / HSN Summary.
// Downloads: CSV per section, or JSON for the whole return.
const GSTR1Report: React.FC = () => {
  const { b2b, b2c, cdnr, cdnur, hsn_summary, totals } = useGST1Data();
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const inRange = (d: string) => {
    const dt = new Date(d);
    if (startDate && dt < startDate) return false;
    if (endDate && dt > endDate) return false;
    return true;
  };

  const filtered = useMemo(() => {
    const filterRows = (rows: GST1Row[]) => rows.filter((r) => inRange(r.invoice_date));
    return {
      b2b: filterRows(b2b),
      b2c: filterRows(b2c),
      cdnr: filterRows(cdnr),
      cdnur: filterRows(cdnur),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b2b, b2c, cdnr, cdnur, startDate, endDate]);

  const summary = useMemo(() => {
    const sum = (rows: GST1Row[]) => ({
      taxable: round2(rows.reduce((s, r) => s + r.taxable_value, 0)),
      tax: round2(rows.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    });
    return {
      b2b: sum(filtered.b2b),
      b2c: sum(filtered.b2c),
      cdnr: sum(filtered.cdnr),
      cdnur: sum(filtered.cdnur),
    };
  }, [filtered]);

  const downloadCSV = (rows: string[][], headers: string[], name: string) => {
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const exportB2B = () =>
    downloadCSV(
      filtered.b2b.map((r) => [
        r.invoice_number,
        r.invoice_date,
        r.client_gst_number || '',
        r.client_name,
        r.place_of_supply || '',
        r.taxable_value.toFixed(2),
        r.igst.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
      ]),
      ['Invoice', 'Date', 'GSTIN', 'Client', 'POS', 'Taxable', 'IGST', 'CGST', 'SGST'],
      'gstr1_b2b',
    );

  const exportB2C = () =>
    downloadCSV(
      filtered.b2c.map((r) => [
        r.invoice_number,
        r.invoice_date,
        r.client_name,
        r.place_of_supply || '',
        r.taxable_value.toFixed(2),
        r.igst.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
      ]),
      ['Invoice', 'Date', 'Client', 'POS', 'Taxable', 'IGST', 'CGST', 'SGST'],
      'gstr1_b2c',
    );

  const exportCDN = (rows: GST1Row[], label: 'cdnr' | 'cdnur') =>
    downloadCSV(
      rows.map((r) => [
        r.invoice_number,
        r.invoice_date,
        r.client_gst_number || '',
        r.client_name,
        r.taxable_value.toFixed(2),
        r.igst.toFixed(2),
        r.cgst.toFixed(2),
        r.sgst.toFixed(2),
      ]),
      ['CN No', 'Date', 'GSTIN', 'Client', 'Taxable', 'IGST', 'CGST', 'SGST'],
      `gstr1_${label}`,
    );

  const exportHSN = () =>
    downloadCSV(
      hsn_summary.map((h) => [
        h.hsn_sac,
        h.description,
        h.uqc,
        h.quantity.toString(),
        h.rate.toString(),
        h.taxable_value.toFixed(2),
        h.igst.toFixed(2),
        h.cgst.toFixed(2),
        h.sgst.toFixed(2),
      ]),
      ['HSN/SAC', 'Desc', 'UQC', 'Qty', 'Rate %', 'Taxable', 'IGST', 'CGST', 'SGST'],
      'gstr1_hsn',
    );

  const exportJSON = () => {
    const payload = {
      returnType: 'GSTR-1',
      period: {
        start: startDate ? startDate.toISOString().split('T')[0] : null,
        end: endDate ? endDate.toISOString().split('T')[0] : null,
      },
      b2b: filtered.b2b,
      b2c: filtered.b2c,
      cdnr: filtered.cdnr,
      cdnur: filtered.cdnur,
      hsn_summary,
      totals,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gstr1_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            GSTR-1 Ready Sales Summary
          </CardTitle>
          <CardDescription>
            B2B, B2C, credit notes and HSN summary — ready for upload
          </CardDescription>
        </div>
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={({ startDate: s, endDate: e }) => {
            setStartDate(s);
            setEndDate(e);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section totals */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SumTile label="B2B" taxable={summary.b2b.taxable} tax={summary.b2b.tax} />
          <SumTile label="B2C" taxable={summary.b2c.taxable} tax={summary.b2c.tax} />
          <SumTile label="CDNR" taxable={summary.cdnr.taxable} tax={summary.cdnr.tax} />
          <SumTile label="CDNUR" taxable={summary.cdnur.taxable} tax={summary.cdnur.tax} />
        </div>

        <Tabs defaultValue="b2b">
          <TabsList className="grid grid-cols-5 max-w-2xl">
            <TabsTrigger value="b2b">B2B ({filtered.b2b.length})</TabsTrigger>
            <TabsTrigger value="b2c">B2C ({filtered.b2c.length})</TabsTrigger>
            <TabsTrigger value="cdnr">CDNR ({filtered.cdnr.length})</TabsTrigger>
            <TabsTrigger value="cdnur">CDNUR ({filtered.cdnur.length})</TabsTrigger>
            <TabsTrigger value="hsn">HSN ({hsn_summary.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="b2b" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={exportB2B}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <RowsTable rows={filtered.b2b} showGstin />
          </TabsContent>

          <TabsContent value="b2c" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={exportB2C}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <RowsTable rows={filtered.b2c} />
          </TabsContent>

          <TabsContent value="cdnr" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => exportCDN(filtered.cdnr, 'cdnr')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <RowsTable rows={filtered.cdnr} showGstin />
          </TabsContent>

          <TabsContent value="cdnur" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={() => exportCDN(filtered.cdnur, 'cdnur')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <RowsTable rows={filtered.cdnur} />
          </TabsContent>

          <TabsContent value="hsn" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={exportHSN}>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
            <HSNTable rows={hsn_summary} />
          </TabsContent>
        </Tabs>

        <div className="flex gap-2">
          <Button variant="outline" onClick={exportJSON}>
            <Download className="h-4 w-4 mr-2" />
            Full GSTR-1 JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const SumTile: React.FC<{ label: string; taxable: number; tax: number }> = ({
  label,
  taxable,
  tax,
}) => (
  <div className="rounded border p-3">
    <div className="text-xs uppercase text-muted-foreground">{label}</div>
    <div className="text-lg font-bold">{formatINR(taxable)}</div>
    <div className="text-[11px] text-muted-foreground">GST {formatINR(tax)}</div>
  </div>
);

const RowsTable: React.FC<{ rows: GST1Row[]; showGstin?: boolean }> = ({
  rows,
  showGstin,
}) => (
  <div className="w-full overflow-auto max-h-96">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Date</TableHead>
          {showGstin && <TableHead>GSTIN</TableHead>}
          <TableHead>Client</TableHead>
          <TableHead>POS</TableHead>
          <TableHead className="text-right">Taxable</TableHead>
          <TableHead className="text-right">IGST</TableHead>
          <TableHead className="text-right">CGST</TableHead>
          <TableHead className="text-right">SGST</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showGstin ? 9 : 8} className="text-center text-muted-foreground">
              No records in range
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.invoice_number}</TableCell>
              <TableCell>{r.invoice_date}</TableCell>
              {showGstin && (
                <TableCell className="text-xs">{r.client_gst_number || '—'}</TableCell>
              )}
              <TableCell>{r.client_name}</TableCell>
              <TableCell className="text-xs">{r.place_of_supply || '—'}</TableCell>
              <TableCell className="text-right">₹{r.taxable_value.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.igst.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.cgst.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.sgst.toFixed(2)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);

const HSNTable: React.FC<{ rows: HSNSummaryRow[] }> = ({ rows }) => (
  <div className="w-full overflow-auto max-h-96">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>HSN/SAC</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>UQC</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Rate %</TableHead>
          <TableHead className="text-right">Taxable</TableHead>
          <TableHead className="text-right">IGST</TableHead>
          <TableHead className="text-right">CGST</TableHead>
          <TableHead className="text-right">SGST</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground">
              No HSN data yet — add HSN/SAC codes on invoice items
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">{r.hsn_sac}</TableCell>
              <TableCell className="text-xs max-w-[200px] truncate">{r.description}</TableCell>
              <TableCell className="text-xs">{r.uqc}</TableCell>
              <TableCell className="text-right">{r.quantity}</TableCell>
              <TableCell className="text-right">{r.rate}%</TableCell>
              <TableCell className="text-right">₹{r.taxable_value.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.igst.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.cgst.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{r.sgst.toFixed(2)}</TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);

export default GSTR1Report;

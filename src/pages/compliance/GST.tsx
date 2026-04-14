import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useGST2AData, useGST2BData } from '@/hooks/useGST2Data';
import { useGST3Data } from '@/hooks/useGST3Data';
import { useGST1Data } from '@/hooks/useGST1Data';
import { useGST9Data } from '@/hooks/useGST9Data';
import { Scale } from 'lucide-react';

const formatCurrency = (amount: number) => `₹${amount.toFixed(2)}`;

const arrayToCSV = (rows: string[][], headers?: string[]) => {
  const lines: string[] = [];
  if (headers && headers.length) lines.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
  for (const r of rows) {
    lines.push(r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
};

const downloadCSV = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

const ComplianceGST: React.FC = () => {
  const { rows: gst2aRows } = useGST2AData();
  const { totals: gst2bTotals } = useGST2BData();
  const { gst3Data, totals } = useGST3Data();

  const exportGST2A = () => {
    const headers = ['vendor_name', 'vendor_gst_number', 'bill_number', 'bill_date', 'taxable_value', 'gst_amount', 'itc_eligible'];
    const rows = gst2aRows.map(r => [r.vendor_name, r.vendor_gst_number || '', r.bill_number, r.bill_date, r.taxable_value.toFixed(2), r.gst_amount.toFixed(2), r.itc_eligible ? 'yes' : 'no']);
    const csv = arrayToCSV(rows, headers);
    downloadCSV('gst2a_purchases.csv', csv);
  };

  const exportGST2B = () => {
    const headers = ['igst', 'cgst', 'sgst', 'cess'];
    const rows = [[gst2bTotals.integratedTax.toFixed(2), gst2bTotals.centralTax.toFixed(2), gst2bTotals.stateUTTax.toFixed(2), gst2bTotals.cessTax.toFixed(2)]];
    const csv = arrayToCSV(rows, headers);
    downloadCSV('gst2b_itc_summary.csv', csv);
  };

  const { rows: gst1Rows } = useGST1Data();
  const { months: gst9Months } = useGST9Data();

  const exportGST1 = () => {
    const headers = ['invoice_number','invoice_date','client_gst_number','client_name','taxable_value','igst','cgst','sgst','cess'];
    const rows = gst1Rows.map(r => [r.invoice_number, r.invoice_date, r.client_gst_number || '', r.client_name, r.taxable_value.toFixed(2), r.igst.toFixed(2), r.cgst.toFixed(2), r.sgst.toFixed(2), r.cess.toFixed(2)]);
    const csv = arrayToCSV(rows, headers);
    downloadCSV('gst1_outwards.csv', csv);
  };

  const exportGST9 = () => {
    const headers = ['month','taxableValue','integratedTax','centralTax','stateUTTax','cessTax'];
    const rows = gst9Months.map(m => [String(m.month), m.taxableValue.toFixed(2), m.integratedTax.toFixed(2), m.centralTax.toFixed(2), m.stateUTTax.toFixed(2), m.cessTax.toFixed(2)]);
    const csv = arrayToCSV(rows, headers);
    downloadCSV('gst9_annual.csv', csv);
  };

  const exportGST3Summary = () => {
    const headers = ['taxableValue','integratedTax','centralTax','stateUTTax','cessTax'];
    const rows = [[totals.taxableValue.toFixed(2), totals.integratedTax.toFixed(2), totals.centralTax.toFixed(2), totals.stateUTTax.toFixed(2), totals.cessTax.toFixed(2)]];
    const csv = arrayToCSV(rows, headers);
    downloadCSV('gst3_summary.csv', csv);
  };

  return (
    <div className="p-6">
      <div className="flex items-start gap-4 mb-6">
        <div className="rounded-full bg-muted/20 p-3">
          <Scale className="h-7 w-7 text-primary" />
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Aczen</div>
          <h1 className="text-3xl font-bold">GST Compliance</h1>
          <p className="text-sm text-muted-foreground mt-1">GST summary, GSTR-3B filing data, and monthly GST calendar</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={exportGST3Summary}>Download GST-3</Button>
          <Button onClick={exportGST2A}>GST-2A CSV</Button>
          <Button onClick={exportGST2B}>GST-2B CSV</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="inline-flex rounded-lg bg-muted/30 p-1">
          <button className="px-4 py-2 bg-background rounded-md text-sm font-medium">GST Summary</button>
          <button className="px-4 py-2 text-sm font-medium text-muted-foreground">GSTR-3B</button>
          <button className="px-4 py-2 text-sm font-medium text-muted-foreground">Monthly</button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="bg-white/5 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-2">GST Summary</h2>
        <p className="text-sm text-muted-foreground mb-4">Output GST – Input GST = Net GST Payable (including RCM)</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4 bg-gradient-to-r from-white/3 to-white/2">
            <div className="text-sm text-muted-foreground">Output (Liability)</div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(totals.integratedTax + totals.centralTax + totals.stateUTTax)}</div>
            <div className="text-xs text-muted-foreground mt-2">Output GST (Sales)</div>
          </div>

          <div className="rounded-lg border p-4 bg-gradient-to-r from-white/3 to-white/2">
            <div className="text-sm text-muted-foreground">Input (Credit)</div>
            <div className="text-2xl font-bold mt-2">{formatCurrency(gst2bTotals.integratedTax + gst2bTotals.centralTax + gst2bTotals.stateUTTax)}</div>
            <div className="text-xs text-muted-foreground mt-2">Input GST (ITC Eligible)</div>
          </div>

          <div className="rounded-lg border p-4 bg-gradient-to-r from-white/3 to-white/2">
            <div className="text-sm text-muted-foreground">Net GST Payable</div>
            <div className="text-2xl font-bold mt-2">{formatCurrency((totals.integratedTax + totals.centralTax + totals.stateUTTax) - (gst2bTotals.integratedTax + gst2bTotals.centralTax + gst2bTotals.stateUTTax))}</div>
            <div className="text-xs text-muted-foreground mt-2">Output − Input</div>
          </div>
        </div>
      </div>

      {/* Detailed sections: GST-2A list and GST-2B summary below */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>GST-2A Purchases</CardTitle>
              <CardDescription className="text-sm">Supplier-wise purchase details</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="text-left">Vendor</th>
                      <th className="text-left">GSTIN</th>
                      <th className="text-right">Taxable</th>
                      <th className="text-right">GST</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gst2aRows.map((r, i) => (
                      <tr key={i}>
                        <td>{r.vendor_name}</td>
                        <td>{r.vendor_gst_number || '—'}</td>
                        <td className="text-right">{formatCurrency(r.taxable_value)}</td>
                        <td className="text-right">{formatCurrency(r.gst_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>GST-2B (Auto ITC)</CardTitle>
              <CardDescription className="text-sm">ITC totals from purchases</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">IGST: {formatCurrency(gst2bTotals.integratedTax)}</p>
              <p className="text-sm">CGST: {formatCurrency(gst2bTotals.centralTax)}</p>
              <p className="text-sm">SGST: {formatCurrency(gst2bTotals.stateUTTax)}</p>
              <p className="text-sm">CESS: {formatCurrency(gst2bTotals.cessTax)}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default ComplianceGST;

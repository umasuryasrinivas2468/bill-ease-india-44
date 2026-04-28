import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, AlertTriangle } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { formatINR } from '@/lib/gst';

interface RiskFlag {
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  total: number;
  flag: string;
  severity: 'low' | 'medium' | 'high';
  detail: string;
}

// #4 Invoice Risk Detector — flags duplicates, wrong GST rate, negative
// margin, repeated edits, wrong GSTIN. Computed live from the loaded
// invoice list — no batch job required.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const STANDARD_RATES = [0, 0.1, 3, 5, 12, 18, 28];

const InvoiceRiskDetector: React.FC = () => {
  const { data: invoices = [] } = useInvoices();

  const flags = useMemo<RiskFlag[]>(() => {
    const out: RiskFlag[] = [];
    const numberMap = new Map<string, any[]>();
    invoices.forEach((i: any) => {
      const key = (i.invoice_number || '').toUpperCase();
      if (!key) return;
      const arr = numberMap.get(key) || [];
      arr.push(i);
      numberMap.set(key, arr);
    });

    invoices.forEach((i: any) => {
      // Duplicate invoice number
      const dupes = numberMap.get((i.invoice_number || '').toUpperCase()) || [];
      if (dupes.length > 1) {
        out.push({
          invoiceId: i.id, invoiceNumber: i.invoice_number,
          customer: i.client_name, total: Number(i.total_amount || 0),
          flag: 'duplicate_number', severity: 'high',
          detail: `Number used on ${dupes.length} invoices`,
        });
      }
      // Wrong GSTIN
      if (i.client_gst_number && !GSTIN_RE.test(i.client_gst_number)) {
        out.push({
          invoiceId: i.id, invoiceNumber: i.invoice_number,
          customer: i.client_name, total: Number(i.total_amount || 0),
          flag: 'wrong_gstin', severity: 'high',
          detail: `Invalid GSTIN format: ${i.client_gst_number}`,
        });
      }
      // Wrong GST rate
      const taxable = Number(i.taxable_value || i.amount || 0);
      const tax = Number(i.gst_amount || 0);
      if (taxable > 0) {
        const inferred = (tax / taxable) * 100;
        const closest = STANDARD_RATES.reduce(
          (best, r) => Math.abs(r - inferred) < Math.abs(best - inferred) ? r : best,
          STANDARD_RATES[0],
        );
        if (Math.abs(closest - inferred) > 0.5) {
          out.push({
            invoiceId: i.id, invoiceNumber: i.invoice_number,
            customer: i.client_name, total: Number(i.total_amount || 0),
            flag: 'wrong_gst_rate', severity: 'medium',
            detail: `Implied rate ${inferred.toFixed(2)}% — not a standard slab`,
          });
        }
      }
      // Repeated manual edits (≥ 3 edits)
      if ((i.edit_count || 0) >= 3) {
        out.push({
          invoiceId: i.id, invoiceNumber: i.invoice_number,
          customer: i.client_name, total: Number(i.total_amount || 0),
          flag: 'repeated_edits', severity: 'low',
          detail: `${i.edit_count} manual edits`,
        });
      }
      // Negative margin (taxable < discount)
      if (Number(i.discount || 0) > taxable && taxable > 0) {
        out.push({
          invoiceId: i.id, invoiceNumber: i.invoice_number,
          customer: i.client_name, total: Number(i.total_amount || 0),
          flag: 'negative_margin', severity: 'high',
          detail: `Discount ${formatINR(i.discount)} exceeds taxable ${formatINR(taxable)}`,
        });
      }
    });
    return out;
  }, [invoices]);

  const counts = useMemo(() => ({
    high: flags.filter(f => f.severity === 'high').length,
    medium: flags.filter(f => f.severity === 'medium').length,
    low: flags.filter(f => f.severity === 'low').length,
  }), [flags]);

  const FLAG_LABEL: Record<string, string> = {
    duplicate_number: 'Duplicate invoice number',
    wrong_gst_rate: 'Wrong GST rate',
    negative_margin: 'Negative margin',
    repeated_edits: 'Repeated manual edits',
    wrong_gstin: 'Invalid customer GSTIN',
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-500" /> Invoice Risk Detector
        </CardTitle>
        <CardDescription>
          Continuous checks for duplicates, wrong GST, invalid GSTIN, repeated edits, negative margin.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card className="bg-red-50 border-red-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">High</div>
            <div className="text-xl font-semibold text-red-600">{counts.high}</div>
          </CardContent></Card>
          <Card className="bg-amber-50 border-amber-200"><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Medium</div>
            <div className="text-xl font-semibold text-amber-600">{counts.medium}</div>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Low</div>
            <div className="text-xl font-semibold">{counts.low}</div>
          </CardContent></Card>
        </div>

        {flags.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No risk flags detected. Records look clean.
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Severity</TableHead>
                  <TableHead>Flag</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((f, idx) => (
                  <TableRow key={`${f.invoiceId}-${f.flag}-${idx}`}>
                    <TableCell>
                      <Badge variant={
                        f.severity === 'high' ? 'destructive' :
                        f.severity === 'medium' ? 'secondary' : 'outline'
                      }>{f.severity}</Badge>
                    </TableCell>
                    <TableCell className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> {FLAG_LABEL[f.flag] || f.flag}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{f.invoiceNumber}</TableCell>
                    <TableCell>{f.customer}</TableCell>
                    <TableCell className="text-right">{formatINR(f.total)}</TableCell>
                    <TableCell className="text-xs">{f.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default InvoiceRiskDetector;

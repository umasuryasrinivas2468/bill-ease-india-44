import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, Wand2 } from 'lucide-react';
import { determineTaxUnified, GST_STATES, type UnifiedTaxResult } from '@/services/taxComplianceService';
import { toast } from '@/hooks/use-toast';

const fmtINR = (n: number | null | undefined) =>
  n == null ? '—' : `₹${Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const TREATMENT_TONE: Record<string, string> = {
  intra_state: 'bg-blue-100 text-blue-800 border-blue-200',
  inter_state: 'bg-violet-100 text-violet-800 border-violet-200',
  export:      'bg-emerald-100 text-emerald-800 border-emerald-200',
  unknown:     'bg-amber-100 text-amber-800 border-amber-200',
};

const UnifiedTaxDeterminationPanel: React.FC = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [form, setForm] = useState({
    transactionType: 'sale' as 'sale' | 'purchase',
    amount: 100000,
    hsn: '8703',
    isService: false,
    isCapital: false,
    supplierState: '27',  // Maharashtra
    billingState: '29',   // Karnataka
    shippingState: '29',
    recipientCountry: 'India',
    tdsSection: '',
    tcsSection: '',
    gstOverride: '',
  });
  const [result, setResult] = useState<UnifiedTaxResult | null>(null);

  const stateName = (code: string) => GST_STATES.find(s => s.code === code)?.name ?? code;

  const determine = useMutation({
    mutationFn: async () => {
      if (!userId) return null;
      return determineTaxUnified({
        userId,
        transactionType: form.transactionType,
        amount: form.amount,
        hsn: form.hsn || null,
        isService: form.isService,
        isCapital: form.isCapital,
        supplierState: stateName(form.supplierState),
        billingState: stateName(form.billingState),
        shippingState: stateName(form.shippingState),
        recipientCountry: form.recipientCountry,
        tdsSection: form.tdsSection || null,
        tcsSection: form.tcsSection || null,
        gstOverride: form.gstOverride ? parseFloat(form.gstOverride) : null,
        log: false,
      });
    },
    onSuccess: r => setResult(r),
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Wand2 className="h-4 w-4 text-emerald-600"/>Unified Tax Determination</CardTitle>
          <CardDescription>
            One-call resolution of GST (POS + rate + CGST/SGST/IGST split) + TDS + TCS + ITC eligibility + RCM. Use this in invoice/bill UIs so users never compute tax manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>Transaction Type</Label>
              <Select value={form.transactionType} onValueChange={v => setForm({...form, transactionType: v as any})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale (customer invoice)</SelectItem>
                  <SelectItem value="purchase">Purchase (vendor bill)</SelectItem>
                </SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Taxable Value</Label>
              <Input type="number" value={form.amount} onChange={e => setForm({...form, amount: parseFloat(e.target.value) || 0})}/></div>
            <div className="space-y-1.5"><Label>HSN / SAC</Label>
              <Input value={form.hsn} onChange={e => setForm({...form, hsn: e.target.value})}/></div>
            <div className="space-y-1.5"><Label>GST Rate Override (%)</Label>
              <Input value={form.gstOverride} onChange={e => setForm({...form, gstOverride: e.target.value})} placeholder="auto from HSN"/></div>

            <div className="space-y-1.5"><Label>Supplier State</Label>
              <Select value={form.supplierState} onValueChange={v => setForm({...form, supplierState: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{GST_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Billing State</Label>
              <Select value={form.billingState} onValueChange={v => setForm({...form, billingState: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{GST_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Shipping State</Label>
              <Select value={form.shippingState} onValueChange={v => setForm({...form, shippingState: v})}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{GST_STATES.map(s => <SelectItem key={s.code} value={s.code}>{s.code} — {s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Recipient Country</Label>
              <Input value={form.recipientCountry} onChange={e => setForm({...form, recipientCountry: e.target.value})}/></div>

            <div className="space-y-1.5"><Label>TDS Section (if purchase)</Label>
              <Input value={form.tdsSection} onChange={e => setForm({...form, tdsSection: e.target.value})} placeholder="e.g. 194J"/></div>
            <div className="space-y-1.5"><Label>TCS Section (if sale)</Label>
              <Input value={form.tcsSection} onChange={e => setForm({...form, tcsSection: e.target.value})} placeholder="e.g. 206C(1H)"/></div>
            <div className="space-y-1.5 col-span-2 flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isService} onChange={e => setForm({...form, isService: e.target.checked})}/>
                Service (use billing state for POS)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isCapital} onChange={e => setForm({...form, isCapital: e.target.checked})}/>
                Capital goods
              </label>
            </div>
          </div>
          <Button onClick={() => determine.mutate()} disabled={determine.isPending} className="gap-2">
            <Sparkles className="h-4 w-4"/>{determine.isPending ? 'Computing…' : 'Determine All Taxes'}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Place of Supply Resolution</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 items-center">
                <Badge className={TREATMENT_TONE[result.place_of_supply.treatment] ?? TREATMENT_TONE.unknown}>
                  {result.place_of_supply.treatment.replace('_', ' ')}
                </Badge>
                <Badge variant="outline">POS: {result.place_of_supply.pos_state ?? '—'}</Badge>
                <Badge variant="outline">{result.place_of_supply.reason}</Badge>
                {result.place_of_supply.apply_cgst_sgst && <Badge variant="outline" className="bg-blue-50">CGST + SGST</Badge>}
                {result.place_of_supply.apply_igst && <Badge variant="outline" className="bg-violet-50">IGST</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Tax Breakup</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <Row label="Taxable Value" value={result.totals.taxable_value} bold/>
                  <Row label={`GST Rate (${result.gst.rate_source})`} value={`${result.gst.rate}%`} isText/>
                  {result.gst.cgst > 0 && <Row label="CGST" value={result.gst.cgst}/>}
                  {result.gst.sgst > 0 && <Row label="SGST" value={result.gst.sgst}/>}
                  {result.gst.igst > 0 && <Row label="IGST" value={result.gst.igst}/>}
                  <Row label="GST Total" value={result.gst.total} bold/>
                  {result.tds && result.tds.tds_applicable && (
                    <>
                      <Row label={`TDS (${result.tds.section} @ ${result.tds.rate}%)`} value={-result.totals.tds_amount} tone="amber"/>
                    </>
                  )}
                  {result.tcs && result.tcs.tcs_applicable && (
                    <Row label={`TCS (${result.tcs.section} @ ${result.tcs.rate}%)`} value={result.totals.tcs_amount} tone="amber"/>
                  )}
                  {result.transaction_type === 'sale' && (
                    <Row label="Invoice Total (incl. GST + TCS)" value={result.totals.invoice_total_for_sale} bold tone="emerald"/>
                  )}
                  {result.transaction_type === 'purchase' && (
                    <Row label="Net Payable to Vendor (after TDS)" value={result.totals.gross_payable_for_purchase} bold tone="emerald"/>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {(result.itc || result.rcm) && (
            <Card>
              <CardHeader><CardTitle className="text-base">ITC + RCM</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.itc && (
                    <>
                      <Badge variant="outline">Classification: {result.itc.classification}</Badge>
                      {result.itc.blocked && <Badge className="bg-red-100 text-red-800">§17(5): {result.itc.block_reason}</Badge>}
                    </>
                  )}
                  {result.rcm && <Badge className="bg-orange-100 text-orange-800">RCM Applicable</Badge>}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

const Row: React.FC<{label: string; value: any; bold?: boolean; tone?: string; isText?: boolean}> = ({label, value, bold, tone, isText}) => (
  <TableRow>
    <TableCell className={bold ? 'font-semibold' : ''}>{label}</TableCell>
    <TableCell className={`text-right font-mono ${bold ? 'font-semibold' : ''} ${
      tone === 'amber' ? 'text-amber-700' :
      tone === 'emerald' ? 'text-emerald-700' : ''
    }`}>
      {isText ? value : fmtINR(value)}
    </TableCell>
  </TableRow>
);

export default UnifiedTaxDeterminationPanel;

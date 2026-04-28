import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Undo2, Receipt, MinusCircle } from 'lucide-react';
import { useInvoices } from '@/hooks/useInvoices';
import { useBusinessData } from '@/hooks/useBusinessData';
import { useClients } from '@/hooks/useClients';
import {
  computeCreditNoteReversal,
  formatINR,
} from '@/lib/gst';

// Shows: pick an original invoice → enter the return amount → see the tax
// that gets reversed (CGST/SGST or IGST), proportional to the original mix.
// This is the pre-flight calculator. Issuing the actual credit note happens
// in the credit-note form, which can carry these numbers over.
const CreditNoteReversalCalculator: React.FC = () => {
  const { data: invoices = [] } = useInvoices();
  const { data: clients = [] } = useClients();
  const { getBusinessInfo } = useBusinessData();
  const sellerState = getBusinessInfo()?.state || '';

  const [invoiceId, setInvoiceId] = useState<string>('');
  const [returnTaxable, setReturnTaxable] = useState<number>(0);

  const selected = useMemo(
    () => invoices.find((i) => i.id === invoiceId),
    [invoices, invoiceId],
  );

  const buyerState = useMemo(() => {
    if (!selected) return '';
    const client = clients.find((c: any) => c.name === selected.client_name);
    return client?.place_of_supply || '';
  }, [clients, selected]);

  const result = useMemo(() => {
    if (!selected) return null;
    return computeCreditNoteReversal(
      {
        original_taxable: Number(selected.amount) || 0,
        original_tax: Number(selected.gst_amount) || 0,
        return_taxable: returnTaxable,
      },
      sellerState,
      buyerState,
    );
  }, [selected, returnTaxable, sellerState, buyerState]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Undo2 className="h-5 w-5 text-blue-600" />
          Credit Note Reversal Calculator
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Preview the GST liability reduction before issuing a credit note. Picks
          up CGST/SGST vs IGST from the original invoice's state mix.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Original Invoice</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick an invoice" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {invoices.slice(0, 200).map((inv) => (
                  <SelectItem key={inv.id} value={inv.id}>
                    {inv.invoice_number} — {inv.client_name} — ₹
                    {Number(inv.total_amount).toLocaleString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Return Taxable Amount (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={returnTaxable}
              onChange={(e) => setReturnTaxable(Number(e.target.value) || 0)}
              disabled={!selected}
              placeholder={
                selected
                  ? `Max ₹${Number(selected.amount).toFixed(2)}`
                  : 'Select an invoice first'
              }
            />
          </div>
        </div>

        {selected && (
          <div className="bg-muted/30 border rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span>Original Taxable</span>
              <span>{formatINR(Number(selected.amount) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Original GST</span>
              <span>{formatINR(Number(selected.gst_amount) || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Original Total</span>
              <span>{formatINR(Number(selected.total_amount) || 0)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>
                Supply type: {buyerState && sellerState
                  ? `${sellerState} → ${buyerState}`
                  : '—'}
              </span>
              <span>{buyerState && sellerState === buyerState ? 'Intra-state' : 'Inter-state'}</span>
            </div>
          </div>
        )}

        {result && returnTaxable > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Stat
                label="Taxable Reversed"
                value={formatINR(result.reversal_taxable)}
                icon={<MinusCircle className="h-4 w-4" />}
                tone="text-blue-800 bg-blue-50 border-blue-200"
              />
              <Stat
                label="GST Reversed"
                value={formatINR(result.reversal_tax)}
                icon={<Receipt className="h-4 w-4" />}
                tone="text-emerald-800 bg-emerald-50 border-emerald-200"
              />
              <Stat
                label="Credit Note Total"
                value={formatINR(result.reversal_total)}
                icon={<Undo2 className="h-4 w-4" />}
                tone="text-violet-800 bg-violet-50 border-violet-200"
              />
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="border rounded p-2">
                <div className="text-muted-foreground">CGST</div>
                <div className="font-medium">{formatINR(result.cgst)}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">SGST</div>
                <div className="font-medium">{formatINR(result.sgst)}</div>
              </div>
              <div className="border rounded p-2">
                <div className="text-muted-foreground">IGST</div>
                <div className="font-medium">{formatINR(result.igst)}</div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              This value will be subtracted from your next GSTR-3B outward tax
              liability. Issue the actual credit note from the Credit Notes
              module to post it.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}> = ({ label, value, icon, tone }) => (
  <div className={`border rounded-lg p-4 ${tone}`}>
    <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
      {icon}
      {label}
    </div>
    <div className="text-xl font-bold mt-1">{value}</div>
  </div>
);

export default CreditNoteReversalCalculator;

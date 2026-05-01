import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Minus, FileText, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateInvoice } from '@/hooks/useInvoices';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import ClientSelector from '@/components/ClientSelector';
import { Client } from '@/hooks/useClients';
import InventoryItemSelector from '@/components/InventoryItemSelector';
import { CurrencySelector, CurrencyDisplay } from '@/components/CurrencySelector';
import { formatCurrencyAmount } from '@/utils/currencyUtils';
import { useInventory } from '@/hooks/useInventory';
import { useSettingsValidation } from '@/hooks/useSettingsValidation';
import SettingsPromptDialog from '@/components/SettingsPromptDialog';
import { postInvoiceJournal } from '@/utils/autoJournalEntry';
import { processSalesInventory } from '@/services/inventoryAutomationService';
import {
  computeMultiRateGST,
  extractTaxable,
  formatINR,
  roundInvoiceTotal,
  INDIAN_STATES,
  PricingMode,
} from '@/lib/gst';
import { useBusinessData } from '@/hooks/useBusinessData';
import GSTBreakdownDisplay from '@/components/GSTBreakdown';

interface InvoiceItem {
  description: string;
  product_id: string | null;
  hsn_sac: string;
  quantity: number;
  rate: number;
  amount: number;
  uom: string;
  gst_rate?: number; // per-item GST rate; falls back to invoice-level default when unset
}

const CreateInvoice = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  const createInvoiceMutation = useCreateInvoice();
  const { data: inventoryItems = [], refetch: refetchInventory } = useInventory();
  const { isAllSettingsComplete, missingFields } = useSettingsValidation();
  const { getBusinessInfo } = useBusinessData();
  const sellerState = getBusinessInfo()?.state || '';
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showSettingsPrompt, setShowSettingsPrompt] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [pricingMode, setPricingMode] = useState<PricingMode>('exclusive');
  const [placeOfSupplyOverride, setPlaceOfSupplyOverride] = useState<string>('');
  const [advance, setAdvance] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [roundoff, setRoundoff] = useState(0);
  const [autoRoundoff, setAutoRoundoff] = useState(true);
  const [currency, setCurrency] = useState('INR');
  const [shippingAddress, setShippingAddress] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', product_id: null, hsn_sac: '', quantity: 1, rate: 0, amount: 0, uom: 'pcs' }
  ]);

  const addItem = () => {
    setItems([...items, { description: '', product_id: null, hsn_sac: '', quantity: 1, rate: 0, amount: 0, uom: 'pcs' }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number | null) => {
    console.log(`Updating item ${index}, field ${field}, value:`, value);
    const updatedItems = [...items];
    
    // Update the specific field
    updatedItems[index] = { 
      ...updatedItems[index], 
      [field]: value 
    };
    
    // Recalculate amount if quantity or rate changed
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }
    
    console.log('Updated items:', updatedItems);
    setItems(updatedItems);
  };

  const updateItemMultiple = (index: number, updates: Partial<InvoiceItem>) => {
    console.log(`Updating multiple fields for item ${index}:`, updates);
    const updatedItems = [...items];
    
    // Apply all updates at once
    updatedItems[index] = { 
      ...updatedItems[index], 
      ...updates
    };
    
    // Recalculate amount if quantity or rate was updated
    if ('quantity' in updates || 'rate' in updates) {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }
    
    console.log('Updated items (multiple):', updatedItems);
    setItems(updatedItems);
  };

  // Per-item GST: fall back to invoice-level default if line has no rate.
  // Inclusive mode: each line's `amount` is gross (incl. GST) — extract the taxable.
  const perLineExtracts = items.map((item) => {
    const rate = item.gst_rate ?? gstRate;
    return extractTaxable(item.amount, rate, pricingMode);
  });

  const grossSubtotal = items.reduce((sum, item) => sum + item.amount, 0); // what the user typed
  const taxableSubtotal = perLineExtracts.reduce((sum, e) => sum + e.taxable, 0);

  // Discount applies to the taxable value. Scale each line's taxable by (1 - d%).
  const discountFactor = 1 - discountPercentage / 100;
  const discountAmount = taxableSubtotal * (discountPercentage / 100);
  const afterDiscountTaxable = taxableSubtotal - discountAmount;

  // Buyer state: explicit override > client's place_of_supply.
  const buyerState = placeOfSupplyOverride || selectedClient?.place_of_supply || '';

  // Build per-rate buckets using the discounted taxable amounts.
  const gstLines = items.map((item, idx) => ({
    taxable: perLineExtracts[idx].taxable * discountFactor,
    rate: item.gst_rate ?? gstRate,
  }));
  const gstResult = computeMultiRateGST(gstLines, sellerState, buyerState);

  // Back-compat shape for GSTBreakdownDisplay (expects a single-rate breakdown).
  // Use the first non-zero rate as display hint; numbers come from the multi-rate result.
  const displayRate =
    gstResult.buckets.find((b) => b.rate > 0)?.rate ??
    (items[0]?.gst_rate ?? gstRate);
  const gstBreakdown = {
    taxable: gstResult.taxable,
    rate: displayRate,
    cgst: gstResult.cgst,
    sgst: gstResult.sgst,
    igst: gstResult.igst,
    total_tax: gstResult.total_tax,
    total: gstResult.total,
    intraState: gstResult.intraState,
  };

  const gstAmount = gstResult.total_tax;
  const beforeRoundoff = afterDiscountTaxable + gstAmount - advance;
  // Auto-roundoff: round the final amount to the nearest rupee (CBIC practice).
  const autoDiff = autoRoundoff ? roundInvoiceTotal(beforeRoundoff).diff : 0;
  const effectiveRoundoff = autoRoundoff ? autoDiff : roundoff;
  const total = beforeRoundoff + effectiveRoundoff;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check if all required settings are complete
    if (!isAllSettingsComplete) {
      setShowSettingsPrompt(true);
      return;
    }
    
    if (!selectedClient) {
      toast({
        title: "Validation Error",
        description: "Please select a client.",
        variant: "destructive",
      });
      return;
    }

    if (!invoiceNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "Invoice number is required.",
        variant: "destructive",
      });
      return;
    }

    if (items.some(item => !item.description.trim())) {
      toast({
        title: "Validation Error",
        description: "All items must have a description.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Validate stock availability for inventory items before creating invoice (only for goods, not services)
      for (const item of items) {
        if (item.product_id) {
          const inventoryItem = inventoryItems.find(inv => inv.id === item.product_id);
          if (inventoryItem && inventoryItem.type === 'goods' && inventoryItem.stock_quantity < item.quantity) {
            toast({
              title: "Insufficient Stock",
              description: `Not enough stock for ${item.description}. Available: ${inventoryItem.stock_quantity}, Required: ${item.quantity}`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      // Tax breakdown persisted alongside the line items — dashboards read from this.
      const tax_meta = {
        __tax_meta: true,
        seller_state: sellerState,
        buyer_state: buyerState,
        intra_state: gstBreakdown.intraState,
        cgst_amount: gstBreakdown.cgst,
        sgst_amount: gstBreakdown.sgst,
        igst_amount: gstBreakdown.igst,
        // Feature #16/#17: persist the rate-wise buckets so GSTR-1 HSN summary
        // and period comparison can reconstruct the exact tax mix without re-deriving.
        pricing_mode: pricingMode,
        rate_buckets: gstResult.buckets,
      };

      const invoiceData = {
        invoice_number: invoiceNumber,
        client_name: selectedClient.name,
        client_email: selectedClient.email,
        client_gst_number: selectedClient.gst_number,
        client_address: selectedClient.address,
        shipping_address: shippingAddress || null,
        amount: gstResult.taxable,
        gst_amount: gstAmount,
        total_amount: total,
        advance: advance,
        discount: discountAmount,
        roundoff: effectiveRoundoff,
        gst_rate: displayRate,
        from_email: user?.emailAddresses?.[0]?.emailAddress || '',
        status: 'pending' as const,
        invoice_date: invoiceDate,
        due_date: dueDate,
        items: [...items, tax_meta],
        items_with_product_id: [...items, tax_meta],
        notes: notes,
      };

      const createdInvoice = await createInvoiceMutation.mutateAsync(invoiceData);
      
      // Auto-create journal entry for the invoice
      try {
        await postInvoiceJournal(user!.id, {
          invoice_number: invoiceNumber,
          invoice_date: invoiceDate,
          client_name: selectedClient.name,
          amount: gstResult.taxable,
          gst_amount: gstAmount,
          total_amount: total,
        });
      } catch (journalErr) {
        console.error('Auto journal creation failed (invoice still created):', journalErr);
      }

      await processSalesInventory(user!.id, {
        id: createdInvoice.id,
        document_number: invoiceNumber,
        date: invoiceDate,
        party_name: selectedClient.name,
        items: [...items, tax_meta],
        source_type: 'invoice',
      });

      // Refresh inventory data
      refetchInventory();
      
      toast({
        title: "Success",
        description: "Invoice created successfully, stock issued, and COGS posted!",
      });
      
      navigate('/invoices');
    } catch (error: any) {
      console.error('Error creating invoice:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  const generateInvoiceNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setInvoiceNumber(`INV-${year}${month}-${random}`);
  };

  const handleGoToSettings = () => {
    setShowSettingsPrompt(false);
    navigate('/settings');
    toast({
      title: "Complete Your Profile",
      description: "Please fill in all required business information, bank details, and upload your business logo.",
      variant: "default",
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="md:hidden" />
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Create Invoice</h1>
          <p className="text-muted-foreground">Generate a new invoice for your client</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ClientSelector 
                onClientSelect={setSelectedClient}
                selectedClientId={selectedClient?.id}
              />
              
              {selectedClient && (
                <div className="p-4 bg-gray-50 rounded-lg space-y-2">
                  <p><strong>Name:</strong> {selectedClient.name}</p>
                  {selectedClient.email && <p><strong>Email:</strong> {selectedClient.email}</p>}
                  {selectedClient.phone && <p><strong>Phone:</strong> {selectedClient.phone}</p>}
                  {selectedClient.gst_number && <p><strong>GST Number:</strong> {selectedClient.gst_number}</p>}
                  {selectedClient.address && <p><strong>Address:</strong> {selectedClient.address}</p>}
                  <div className="mt-2 space-y-1">
                    <Label htmlFor="shipping_address" className="text-xs">Shipping Address</Label>
                    <Input id="shipping_address" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} placeholder="Enter shipping / delivery address" className="h-8 text-sm" />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800">
                  From: {user?.emailAddresses?.[0]?.emailAddress || 'No email available'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invoiceNumber">Invoice Number</Label>
                <div className="flex gap-2">
                  <Input
                    id="invoiceNumber"
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    placeholder="INV-001"
                    required
                  />
                  <Button type="button" onClick={generateInvoiceNumber} variant="outline">
                    Generate
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gstRate">Default GST Rate (%)</Label>
                  <Select value={gstRate.toString()} onValueChange={(value) => setGstRate(Number(value))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select GST Rate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Nil-rated)</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="12">12%</SelectItem>
                      <SelectItem value="18">18%</SelectItem>
                      <SelectItem value="28">28%</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Lines can override this with their own rate (multi-rate invoice).
                  </p>
                </div>
                <CurrencySelector value={currency} onChange={setCurrency} label="Currency" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pricingMode">Pricing Mode</Label>
                  <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exclusive">Exclusive (₹100 + GST)</SelectItem>
                      <SelectItem value="inclusive">Inclusive (₹118 incl. GST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="posOverride">Place of Supply (override)</Label>
                  <Select
                    value={placeOfSupplyOverride || '__client'}
                    onValueChange={(v) => setPlaceOfSupplyOverride(v === '__client' ? '' : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="__client">
                        Use client default ({selectedClient?.place_of_supply || '—'})
                      </SelectItem>
                      {INDIAN_STATES.map((s) => (
                        <SelectItem key={s.code} value={s.name}>
                          {s.code} — {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => {
                const effectiveRate = item.gst_rate ?? gstRate;
                const extract = perLineExtracts[index];
                return (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-9 gap-3 p-4 border rounded-lg">
                    <div className="md:col-span-2">
                      <Label htmlFor={`description-${index}`}>Item from Inventory</Label>
                      <InventoryItemSelector
                        value={item.description}
                        onChange={(value, price, uom) => {
                          const selectedInventoryItem = inventoryItems.find(inv => inv.product_name === value);
                          const updates: Partial<InvoiceItem> = {
                            description: value,
                            product_id: selectedInventoryItem?.id || null,
                            uom: uom || 'pcs',
                          };
                          if (price && typeof price === 'number' && price > 0) {
                            updates.rate = price;
                          }
                          updateItemMultiple(index, updates);
                        }}
                        placeholder="Select from inventory"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`hsn-sac-${index}`}>HSN/SAC</Label>
                      <Input
                        id={`hsn-sac-${index}`}
                        value={item.hsn_sac}
                        onChange={(e) => updateItem(index, 'hsn_sac', e.target.value)}
                        placeholder="HSN"
                      />
                    </div>

                    <div>
                      <Label>UOM</Label>
                      <Input
                        value={item.uom || 'pcs'}
                        readOnly
                        className="bg-muted/50 uppercase text-xs"
                      />
                    </div>

                    <div>
                      <Label htmlFor={`quantity-${index}`}>Qty</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`rate-${index}`}>
                        Rate {pricingMode === 'inclusive' ? '(incl.)' : '(excl.)'}
                      </Label>
                      <Input
                        id={`rate-${index}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.rate}
                        onChange={(e) => updateItem(index, 'rate', Number(e.target.value))}
                        required
                      />
                    </div>

                    <div>
                      <Label htmlFor={`gst-${index}`}>GST %</Label>
                      <Select
                        value={String(effectiveRate)}
                        onValueChange={(v) => updateItem(index, 'gst_rate', Number(v))}
                      >
                        <SelectTrigger id={`gst-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">0%</SelectItem>
                          <SelectItem value="5">5%</SelectItem>
                          <SelectItem value="12">12%</SelectItem>
                          <SelectItem value="18">18%</SelectItem>
                          <SelectItem value="28">28%</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Amount</Label>
                      <Input
                        value={item.amount.toFixed(2)}
                        readOnly
                        className="bg-gray-100"
                      />
                    </div>

                    <div>
                      <Label className="text-[11px]">Taxable</Label>
                      <Input
                        value={extract.taxable.toFixed(2)}
                        readOnly
                        className="bg-muted/30 text-xs"
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              
              <Button type="button" onClick={addItem} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="advance">Advance (₹)</Label>
                <Input
                  id="advance"
                  type="number"
                  min="0"
                  step="0.01"
                  value={advance}
                  onChange={(e) => setAdvance(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="discount">Discount (%)</Label>
                <Input
                  id="discount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPercentage}
                  onChange={(e) => setDiscountPercentage(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="roundoff">Round Off (₹)</Label>
                <Input
                  id="roundoff"
                  type="number"
                  step="0.01"
                  value={autoRoundoff ? autoDiff : roundoff}
                  onChange={(e) => {
                    setAutoRoundoff(false);
                    setRoundoff(Number(e.target.value));
                  }}
                  placeholder="0.00"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRoundoff}
                    onChange={(e) => setAutoRoundoff(e.target.checked)}
                  />
                  Auto round to nearest rupee
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Gross Line Total {pricingMode === 'inclusive' ? '(incl. GST)' : '(excl. GST)'}:</span>
                <span>₹{grossSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxable Value:</span>
                <span>₹{taxableSubtotal.toFixed(2)}</span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({discountPercentage}%):</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Taxable after Discount:</span>
                <span>₹{afterDiscountTaxable.toFixed(2)}</span>
              </div>

              {/* Rate-wise breakdown (Feature #16) */}
              {gstResult.buckets.length > 0 && (
                <div className="rounded border p-2 space-y-1 text-xs bg-muted/20">
                  <div className="font-medium text-muted-foreground">Rate-wise GST</div>
                  {gstResult.buckets.map((b) => (
                    <div key={b.rate} className="flex justify-between">
                      <span>
                        {b.rate}% on ₹{b.taxable.toFixed(2)}
                        {gstResult.intraState
                          ? ` — CGST ₹${b.cgst.toFixed(2)} + SGST ₹${b.sgst.toFixed(2)}`
                          : ` — IGST ₹${b.igst.toFixed(2)}`}
                      </span>
                      <span>₹{b.total_tax.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}

              <GSTBreakdownDisplay
                breakdown={gstBreakdown}
                sellerState={sellerState}
                buyerState={buyerState}
              />
              {!sellerState && (
                <p className="text-xs text-amber-600">
                  Tip: Set your business state in Settings → Business for accurate CGST/SGST vs IGST split.
                </p>
              )}
              {sellerState && !buyerState && selectedClient && (
                <p className="text-xs text-amber-600">
                  Client has no Place of Supply set — defaulting to inter-state (IGST).
                </p>
              )}
              {advance > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Advance:</span>
                  <span>-₹{advance.toFixed(2)}</span>
                </div>
              )}
              {effectiveRoundoff !== 0 && (
                <div className="flex justify-between">
                  <span>Round Off{autoRoundoff ? ' (auto)' : ''}:</span>
                  <span>{effectiveRoundoff >= 0 ? '+' : ''}₹{effectiveRoundoff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes or terms..."
              rows={4}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button 
            type="submit" 
            size="lg"
            disabled={createInvoiceMutation.isPending}
          >
            {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
          </Button>
        </div>
      </form>

      <SettingsPromptDialog
        open={showSettingsPrompt}
        onOpenChange={setShowSettingsPrompt}
        onGoToSettings={handleGoToSettings}
        missingFields={missingFields}
      />
    </div>
  );
};

export default CreateInvoice;

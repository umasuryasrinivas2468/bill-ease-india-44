import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Minus, FileText, ArrowLeft, Upload } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import QuotationItemSelector from '@/components/QuotationItemSelector';
import ImportDialog from '@/components/ImportDialog';

interface QuotationItem {
  product_id?: string;
  name: string;
  description: string;
  quantity: number;
  price: number;
  amount: number;
}

const Quotations = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  
  // Form state
  const [quotationNumber, setQuotationNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientAddress, setClientAddress] = useState('');
  const [quotationDate, setQuotationDate] = useState(new Date().toISOString().split('T')[0]);
  const [validityPeriod, setValidityPeriod] = useState(30);
  const [termsConditions, setTermsConditions] = useState('');
  const [discount, setDiscount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [items, setItems] = useState<QuotationItem[]>([
    { product_id: '', name: '', description: '', quantity: 1, price: 0, amount: 0 }
  ]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const addItem = () => {
    setItems([...items, { product_id: '', name: '', description: '', quantity: 1, price: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof QuotationItem, value: string | number) => {
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    // Recalculate amount when quantity or price changes
    if (field === 'quantity' || field === 'price') {
      const qty = Number(updatedItems[index].quantity) || 0;
      const price = Number(updatedItems[index].price) || 0;
      updatedItems[index].amount = qty * price;
    }
    
    setItems(updatedItems);
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const discountAmount = subtotal * (discount / 100);
  const taxAmount = (subtotal - discountAmount) * 0.18; // 18% tax
  const total = subtotal - discountAmount + taxAmount;

  const generateQuotationNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setQuotationNumber(`QUOT-${year}${month}-${random}`);
  };

  const validateForm = () => {
    if (!quotationNumber.trim()) {
      toast({
        title: "Validation Error",
        description: "Quotation number is required.",
        variant: "destructive",
      });
      return false;
    }

    if (!clientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return false;
    }

    // Check if all items have names
    for (let i = 0; i < items.length; i++) {
      if (!items[i].name.trim()) {
        toast({
          title: "Validation Error",
          description: `Item ${i + 1} name is required.`,
          variant: "destructive",
        });
        return false;
      }
      if (items[i].quantity <= 0) {
        toast({
          title: "Validation Error",
          description: `Item ${i + 1} quantity must be greater than 0.`,
          variant: "destructive",
        });
        return false;
      }
      if (items[i].price <= 0) {
        toast({
          title: "Validation Error",
          description: `Item ${i + 1} price must be greater than 0.`,
          variant: "destructive",
        });
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (!user?.id) {
      toast({
        title: "Authentication Error",
        description: "You must be logged in to create a quotation.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Prepare items_with_product_id including product_id
      const itemsWithProductId = items.map((it) => ({
        product_id: it.product_id || null,
        name: it.name,
        description: it.description,
        quantity: it.quantity,
        price: it.price,
        amount: it.amount,
      }));

      const quotationData = {
        quotation_number: quotationNumber,
        client_name: clientName,
        client_email: clientEmail || null,
        client_phone: clientPhone || null,
        client_address: clientAddress || null,
        quotation_date: quotationDate,
        validity_period: validityPeriod,
        items: items, // keep legacy items array for compatibility
        items_with_product_id: itemsWithProductId, // new array with product_id
        discount: discount,
        subtotal: subtotal,
        tax_amount: taxAmount,
        total_amount: total,
        terms_conditions: termsConditions || null,
        status: 'draft',
        user_id: user.id,
      };

      console.log('Submitting quotation data:', quotationData);

      const { data, error } = await supabase
        .from('quotations')
        .insert([quotationData])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        throw error;
      }

      console.log('Quotation created successfully:', data);

      toast({
        title: "Success",
        description: "Quotation created successfully!",
      });
      
      // Navigate back to quotations list
      navigate('/quotations');
      
    } catch (error: any) {
      console.error('Error creating quotation:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create quotation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportQuotations = async (validRows: any[]) => {
    try {
      const quotationsToInsert = validRows.map((row) => ({
        quotation_number: row.quotation_number,
        quotation_date: row.quotation_date,
        client_name: row.client_name,
        client_email: row.client_email || '',
        client_phone: row.client_phone || '',
        client_address: row.client_address || '',
        amount: parseFloat(row.quantity || 0) * parseFloat(row.rate || 0),
        tax_amount: (parseFloat(row.quantity || 0) * parseFloat(row.rate || 0)) * (parseFloat(row.gst_rate || 18) / 100),
        total_amount: (parseFloat(row.quantity || 0) * parseFloat(row.rate || 0)) * (1 + parseFloat(row.gst_rate || 18) / 100),
        status: 'draft',
        notes: row.notes || '',
        items: [
          {
            name: row.item_description || '',
            description: row.hsn_sac || '',
            quantity: parseFloat(row.quantity || 1),
            price: parseFloat(row.rate || 0),
            amount: parseFloat(row.quantity || 1) * parseFloat(row.rate || 0),
          }
        ],
        user_id: user?.id,
      }));

      const { error } = await supabase.from('quotations').insert(quotationsToInsert);
      if (error) throw error;

      setIsImportDialogOpen(false);
      toast({
        title: 'Import Successful',
        description: `${validRows.length} quotations imported successfully.`,
      });
    } catch (err) {
      console.error('Import error:', err);
      toast({
        title: 'Import Failed',
        description: 'Failed to import quotations. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <Button
            variant="outline"
            size="sm" 
            onClick={() => navigate('/quotations')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quotations
          </Button>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Create Quotation</h1>
            <p className="text-muted-foreground">Generate a new quotation for your client</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="clientName">Client Name *</Label>
                <Input
                  id="clientName"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Enter client name"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientEmail">Client Email</Label>
                <Input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="client@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientPhone">Client Phone</Label>
                <Input
                  id="clientPhone"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="clientAddress">Client Address</Label>
                <Textarea
                  id="clientAddress"
                  value={clientAddress}
                  onChange={(e) => setClientAddress(e.target.value)}
                  placeholder="Enter client address"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Quotation Details */}
          <Card>
            <CardHeader>
              <CardTitle>Quotation Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="quotationNumber">Quotation Number *</Label>
                <div className="flex gap-2">
                  <Input
                    id="quotationNumber"
                    value={quotationNumber}
                    onChange={(e) => setQuotationNumber(e.target.value)}
                    placeholder="QUOT-001"
                    required
                  />
                  <Button type="button" onClick={generateQuotationNumber} variant="outline">
                    Generate
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="quotationDate">Quotation Date</Label>
                <Input
                  id="quotationDate"
                  type="date"
                  value={quotationDate}
                  onChange={(e) => setQuotationDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="validityPeriod">Validity Period (Days)</Label>
                <Input
                  id="validityPeriod"
                  type="number"
                  min="1"
                  value={validityPeriod}
                  onChange={(e) => setValidityPeriod(Number(e.target.value))}
                  required
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
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quotation Items */}
        <Card>
          <CardHeader>
            <CardTitle>Quotation Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 border rounded-lg">
                  <div className="md:col-span-2">
                    <Label htmlFor={`item-name-${index}`}>Item *</Label>
                    <QuotationItemSelector
                      value={item.product_id || ''}
                      onChange={(productId, meta) => {
                        // Update product_id, name, and price from selection
                        const updatedItems = [...items];
                        const current = { ...updatedItems[index] };
                        current.product_id = productId;
                        if (meta?.name) current.name = meta.name;
                        if (typeof meta?.price === 'number') current.price = meta.price;
                        // recalc amount
                        const qty = Number(current.quantity) || 0;
                        const price = Number(current.price) || 0;
                        current.amount = qty * price;
                        updatedItems[index] = current;
                        setItems(updatedItems);
                      }}
                      placeholder="Select an item from inventory"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor={`description-${index}`}>Description</Label>
                    <Input
                      id={`description-${index}`}
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      placeholder="Item description"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor={`quantity-${index}`}>Quantity *</Label>
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
                    <Label htmlFor={`price-${index}`}>Price (₹) *</Label>
                    <Input
                      id={`price-${index}`}
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.price}
                      onChange={(e) => updateItem(index, 'price', Number(e.target.value))}
                      required
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
              ))}
              
              <Button type="button" onClick={addItem} variant="outline" className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quotation Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Quotation Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({discount}%):</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax (18%):</span>
                <span>₹{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Terms and Conditions */}
        <Card>
          <CardHeader>
            <CardTitle>Terms and Conditions</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={termsConditions}
              onChange={(e) => setTermsConditions(e.target.value)}
              placeholder="Enter terms and conditions..."
              rows={4}
            />
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end">
          <Button 
            type="submit" 
            size="lg"
            disabled={isSubmitting}
          >
            <FileText className="h-4 w-4 mr-2" />
            {isSubmitting ? "Creating..." : "Create Quotation"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default Quotations;

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
import { useInventory } from '@/hooks/useInventory';
import { supabase } from '@/lib/supabase';

interface InvoiceItem {
  description: string;
  hsn_sac: string;
  quantity: number;
  rate: number;
  amount: number;
}

const CreateInvoice = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useUser();
  const createInvoiceMutation = useCreateInvoice();
  const { data: inventoryItems = [], refetch: refetchInventory } = useInventory();
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [advance, setAdvance] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [roundoff, setRoundoff] = useState(0);
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', hsn_sac: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  const addItem = () => {
    setItems([...items, { description: '', hsn_sac: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    console.log(`Updating item ${index}, field ${field}, value:`, value);
    const updatedItems = [...items];
    updatedItems[index] = { ...updatedItems[index], [field]: value };
    
    if (field === 'quantity' || field === 'rate') {
      updatedItems[index].amount = updatedItems[index].quantity * updatedItems[index].rate;
    }
    
    console.log('Updated items:', updatedItems);
    setItems(updatedItems);
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
  const discountAmount = subtotal * (discountPercentage / 100);
  const afterDiscount = subtotal - discountAmount;
  const gstAmount = afterDiscount * (gstRate / 100);
  const beforeRoundoff = afterDiscount + gstAmount - advance;
  const total = beforeRoundoff + roundoff;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
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
      // Validate stock availability for inventory items before creating invoice
      for (const item of items) {
        const inventoryItem = inventoryItems.find(inv => inv.product_name === item.description);
        if (inventoryItem) {
          if (inventoryItem.stock_quantity < item.quantity) {
            toast({
              title: "Insufficient Stock",
              description: `Not enough stock for ${item.description}. Available: ${inventoryItem.stock_quantity}, Required: ${item.quantity}`,
              variant: "destructive",
            });
            return;
          }
        }
      }

      const invoiceData = {
        invoice_number: invoiceNumber,
        client_name: selectedClient.name,
        client_email: selectedClient.email,
        client_gst_number: selectedClient.gst_number,
        client_address: selectedClient.address,
        amount: subtotal,
        gst_amount: gstAmount,
        total_amount: total,
        advance: advance,
        discount: discountAmount,
        roundoff: roundoff,
        gst_rate: gstRate,
        from_email: user?.emailAddresses?.[0]?.emailAddress || '',
        status: 'pending' as const,
        invoice_date: invoiceDate,
        due_date: dueDate,
        items: items,
        notes: notes,
      };

      await createInvoiceMutation.mutateAsync(invoiceData);
      
      // Update inventory stock for items that are in inventory
      for (const item of items) {
        const inventoryItem = inventoryItems.find(inv => inv.product_name === item.description);
        if (inventoryItem) {
          await updateInventoryStock(item.description, item.quantity);
        }
      }

      // Refresh inventory data
      refetchInventory();
      
      toast({
        title: "Success",
        description: "Invoice created successfully and inventory updated!",
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

  const updateInventoryStock = async (itemName: string, quantity: number) => {
    try {
      // Find the inventory item by name
      const inventoryItem = inventoryItems.find(item => item.product_name === itemName);
      if (!inventoryItem) {
        console.warn(`Inventory item "${itemName}" not found`);
        return;
      }

      // Check if there's enough stock
      if (inventoryItem.stock_quantity < quantity) {
        throw new Error(`Insufficient stock for ${itemName}. Available: ${inventoryItem.stock_quantity}, Required: ${quantity}`);
      }

      // Update the stock quantity
      const newStockQuantity = inventoryItem.stock_quantity - quantity;
      
      const { error } = await supabase
        .from('inventory')
        .update({ stock_quantity: newStockQuantity })
        .eq('id', inventoryItem.id);

      if (error) {
        throw error;
      }

      console.log(`Updated stock for ${itemName}: ${inventoryItem.stock_quantity} -> ${newStockQuantity}`);
    } catch (error) {
      console.error('Error updating inventory stock:', error);
      throw error;
    }
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
          {/* Client Information */}
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
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* From Email Display */}
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

              <div className="space-y-2">
                <Label htmlFor="gstRate">GST Rate (%)</Label>
                <Select value={gstRate.toString()} onValueChange={(value) => setGstRate(Number(value))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select GST Rate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Items */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-7 gap-4 p-4 border rounded-lg">
                  <div className="md:col-span-2">
                    <Label htmlFor={`description-${index}`}>Item from Inventory</Label>
                    <InventoryItemSelector
                      value={item.description}
                      onChange={(value, price) => {
                        try {
                          console.log('CreateInvoice - Inventory item selected:', value, price);
                          
                          // Validate the value
                          if (!value || typeof value !== 'string') {
                            console.warn('CreateInvoice - Invalid value received:', value);
                            return;
                          }
                          
                          updateItem(index, 'description', value);
                          if (price && typeof price === 'number' && price > 0) {
                            updateItem(index, 'rate', price);
                          }
                          
                          console.log('CreateInvoice - Item updated successfully');
                        } catch (error) {
                          console.error('CreateInvoice - Error updating item:', error);
                          toast({
                            title: "Error",
                            description: "Failed to update item. Please try again.",
                            variant: "destructive",
                          });
                        }
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
                      placeholder="HSN/SAC Code"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor={`quantity-${index}`}>Quantity</Label>
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
                    <Label htmlFor={`rate-${index}`}>Rate (₹)</Label>
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
                    <Label>Amount (₹)</Label>
                    <Input
                      value={item.amount.toFixed(2)}
                      readOnly
                      className="bg-gray-100"
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

        {/* Additional Charges and Discounts */}
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
                  value={roundoff}
                  onChange={(e) => setRoundoff(Number(e.target.value))}
                  placeholder="0.00"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Invoice Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Invoice Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              {discountPercentage > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Discount ({discountPercentage}%):</span>
                  <span>-₹{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>After Discount:</span>
                <span>₹{afterDiscount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST ({gstRate}%):</span>
                <span>₹{gstAmount.toFixed(2)}</span>
              </div>
              {advance > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Advance:</span>
                  <span>-₹{advance.toFixed(2)}</span>
                </div>
              )}
              {roundoff !== 0 && (
                <div className="flex justify-between">
                  <span>Round Off:</span>
                  <span>{roundoff >= 0 ? '+' : ''}₹{roundoff.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
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

        {/* Submit Button */}
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
    </div>
  );
};

export default CreateInvoice;

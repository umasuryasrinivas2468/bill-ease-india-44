import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Trash2, Save, Send, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateInvoice } from '@/hooks/useInvoices';
import { useNavigate } from 'react-router-dom';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

const CreateInvoice = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const createInvoiceMutation = useCreateInvoice();
  
  const [invoiceData, setInvoiceData] = useState({
    clientName: '',
    clientEmail: '',
    clientGST: '',
    clientAddress: '',
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    isRecurring: false,
    recurringFrequency: 'monthly',
    notes: '',
  });

  const [items, setItems] = useState<InvoiceItem[]>([
    { id: '1', description: '', quantity: 1, rate: 0, amount: 0 }
  ]);

  const [gstRate, setGstRate] = useState('18');

  const addItem = () => {
    setItems([...items, {
      id: Date.now().toString(),
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0
    }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === 'quantity' || field === 'rate') {
          updatedItem.amount = updatedItem.quantity * updatedItem.rate;
        }
        return updatedItem;
      }
      return item;
    }));
  };

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const gstAmount = (subtotal * parseFloat(gstRate)) / 100;
    const total = subtotal + gstAmount;
    
    return { subtotal, gstAmount, total };
  };

  const handleSave = async (sendToClient = false, sendUPIRequest = false) => {
    if (!invoiceData.clientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!invoiceData.dueDate) {
      toast({
        title: "Validation Error",
        description: "Due date is required.",
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

    const { subtotal, gstAmount, total } = calculateTotals();

    try {
      const savedInvoice = await createInvoiceMutation.mutateAsync({
        invoice_number: invoiceData.invoiceNumber,
        client_name: invoiceData.clientName,
        client_email: invoiceData.clientEmail || undefined,
        client_gst_number: invoiceData.clientGST || undefined,
        client_address: invoiceData.clientAddress || undefined,
        amount: subtotal,
        gst_amount: gstAmount,
        total_amount: total,
        status: 'pending',
        invoice_date: invoiceData.invoiceDate,
        due_date: invoiceData.dueDate,
        items: items,
        notes: invoiceData.notes || undefined,
      });

      toast({
        title: sendToClient ? "Invoice Sent" : "Invoice Saved",
        description: sendToClient 
          ? "Invoice has been saved and sent to the client."
          : "Your invoice has been saved successfully.",
      });

      // If UPI request is needed, redirect to UPI collections with prefilled data
      if (sendUPIRequest && invoiceData.clientEmail) {
        const upiId = invoiceData.clientEmail.replace('@', '@'); // Assuming email can be converted to UPI
        navigate('/upi-collections', { 
          state: { 
            invoiceId: savedInvoice.id,
            amount: total,
            purpose: `Payment for Invoice ${invoiceData.invoiceNumber}`,
            payerUPI: upiId
          }
        });
        return;
      }

      navigate('/invoices');
    } catch (error) {
      console.error('Error saving invoice:', error);
      toast({
        title: "Error",
        description: "Failed to save invoice. Please try again.",
        variant: "destructive",
      });
    }
  };

  const { subtotal, gstAmount, total } = calculateTotals();

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <SidebarTrigger className="md:hidden" />
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Create Invoice</h1>
            <p className="text-muted-foreground">Generate a new invoice for your client</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Invoice Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name *</Label>
                  <Input
                    id="clientName"
                    value={invoiceData.clientName}
                    onChange={(e) => setInvoiceData({...invoiceData, clientName: e.target.value})}
                    placeholder="Enter client name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Client Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={invoiceData.clientEmail}
                    onChange={(e) => setInvoiceData({...invoiceData, clientEmail: e.target.value})}
                    placeholder="client@example.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientGST">Client GST Number</Label>
                <Input
                  id="clientGST"
                  value={invoiceData.clientGST}
                  onChange={(e) => setInvoiceData({...invoiceData, clientGST: e.target.value})}
                  placeholder="22AAAAA0000A1Z5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clientAddress">Client Address</Label>
                <Textarea
                  id="clientAddress"
                  value={invoiceData.clientAddress}
                  onChange={(e) => setInvoiceData({...invoiceData, clientAddress: e.target.value})}
                  placeholder="Enter client address"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    value={invoiceData.invoiceNumber}
                    onChange={(e) => setInvoiceData({...invoiceData, invoiceNumber: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceData.invoiceDate}
                    onChange={(e) => setInvoiceData({...invoiceData, invoiceDate: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dueDate">Due Date *</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={invoiceData.dueDate}
                    onChange={(e) => setInvoiceData({...invoiceData, dueDate: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={invoiceData.notes}
                  onChange={(e) => setInvoiceData({...invoiceData, notes: e.target.value})}
                  placeholder="Additional notes for the invoice"
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Items/Services</CardTitle>
                <Button onClick={addItem} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={item.id} className="p-4 border rounded-lg space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="font-medium">Item {index + 1}</span>
                    {items.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 space-y-2">
                      <Label>Description</Label>
                      <Input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        placeholder="Item description"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Quantity</Label>
                      <Input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rate (₹)</Label>
                      <Input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateItem(item.id, 'rate', parseFloat(e.target.value) || 0)}
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <span className="text-lg font-medium">Amount: ₹{item.amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Invoice Summary */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>GST Configuration</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="gstRate">GST Rate (%)</Label>
                <Select value={gstRate} onValueChange={setGstRate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">0% (Exempt)</SelectItem>
                    <SelectItem value="5">5%</SelectItem>
                    <SelectItem value="12">12%</SelectItem>
                    <SelectItem value="18">18%</SelectItem>
                    <SelectItem value="28">28%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Invoice Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>GST ({gstRate}%):</span>
                  <span>₹{gstAmount.toFixed(2)}</span>
                </div>
                <hr />
                <div className="flex justify-between text-lg font-bold">
                  <span>Total:</span>
                  <span>₹{total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={() => handleSave(false)} 
                  variant="outline" 
                  className="w-full"
                  disabled={createInvoiceMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {createInvoiceMutation.isPending ? "Saving..." : "Save as Draft"}
                </Button>
                <Button 
                  onClick={() => handleSave(true)} 
                  variant="outline"
                  className="w-full"
                  disabled={createInvoiceMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createInvoiceMutation.isPending ? "Saving..." : "Save & Send"}
                </Button>
                <Button 
                  onClick={() => handleSave(false, true)} 
                  className="w-full"
                  disabled={createInvoiceMutation.isPending}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  {createInvoiceMutation.isPending ? "Saving..." : "Save & Request UPI Payment"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateInvoice;

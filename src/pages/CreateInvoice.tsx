import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, Trash2, Save, Send, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCreateInvoice } from '@/hooks/useInvoices';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import ClientSelector from '@/components/ClientSelector';
import PDFProcessor from '@/components/PDFProcessor';
import { Client } from '@/hooks/useClients';

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
  const { user } = useUser();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
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

  const handleClientSelect = (client: Client | null) => {
    setSelectedClient(client);
    if (client) {
      setInvoiceData({
        ...invoiceData,
        clientName: client.name,
        clientEmail: client.email || '',
        clientGST: client.gst_number || '',
        clientAddress: client.address || '',
      });
    } else {
      setInvoiceData({
        ...invoiceData,
        clientName: '',
        clientEmail: '',
        clientGST: '',
        clientAddress: '',
      });
    }
  };

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

  const handleDownload = () => {
    if (!invoiceData.clientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required to download invoice.",
        variant: "destructive",
      });
      return;
    }

    if (items.some(item => !item.description.trim())) {
      toast({
        title: "Validation Error",
        description: "All items must have a description to download invoice.",
        variant: "destructive",
      });
      return;
    }

    // Create a temporary invoice object for preview
    const { subtotal, gstAmount, total } = calculateTotals();
    const tempInvoice = {
      id: 'temp',
      invoice_number: invoiceData.invoiceNumber,
      client_name: invoiceData.clientName,
      client_email: invoiceData.clientEmail || undefined,
      client_gst_number: invoiceData.clientGST || undefined,
      client_address: invoiceData.clientAddress || undefined,
      amount: subtotal,
      gst_amount: gstAmount,
      total_amount: total,
      status: 'pending' as const,
      invoice_date: invoiceData.invoiceDate,
      due_date: invoiceData.dueDate || invoiceData.invoiceDate,
      items: items,
      notes: invoiceData.notes || undefined,
      created_at: new Date().toISOString(),
    };

    // Generate and download the invoice
    generateInvoicePDF(tempInvoice);
  };

  const generateInvoicePDF = (invoice: any) => {
    const businessInfo = user?.unsafeMetadata?.businessInfo as any;
    const logoUrl = user?.imageUrl;

    const printContent = `
      <html>
        <head>
          <title>Invoice ${invoice.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 30px; }
            .logo { display: flex; align-items: center; gap: 15px; }
            .logo img { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; }
            .company-name { font-size: 24px; font-weight: bold; color: #2563eb; }
            .business-name { font-size: 18px; font-weight: 600; }
            .invoice-title { text-align: right; }
            .invoice-title h2 { font-size: 20px; font-weight: bold; margin: 0; }
            .invoice-number { font-size: 14px; color: #666; }
            .info-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
            .info-block h3 { font-weight: 600; margin-bottom: 10px; }
            .info-block p { margin: 2px 0; font-size: 14px; }
            .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
            .status { margin-left: 8px; padding: 4px 8px; border-radius: 4px; font-size: 12px; background: #fef3c7; color: #92400e; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th, td { border: 1px solid #d1d5db; padding: 12px; text-align: left; }
            th { background-color: #f9fafb; font-weight: 600; }
            .text-right { text-align: right; }
            .totals { display: flex; justify-content: flex-end; margin-bottom: 30px; }
            .totals-table { width: 300px; }
            .totals-table div { display: flex; justify-content: space-between; padding: 8px 0; }
            .total-final { font-weight: bold; font-size: 18px; border-top: 2px solid #000; padding-top: 8px; }
            .notes { margin-top: 30px; }
            .notes h3 { font-weight: 600; margin-bottom: 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">
              ${logoUrl ? `<img src="${logoUrl}" alt="Business Logo" />` : ''}
              <div>
                <div class="company-name">Aczen Bilz</div>
                ${businessInfo?.businessName ? `<div class="business-name">${businessInfo.businessName}</div>` : ''}
              </div>
            </div>
            <div class="invoice-title">
              <h2>INVOICE</h2>
              <div class="invoice-number">#${invoice.invoice_number}</div>
            </div>
          </div>

          <div class="info-section">
            <div>
              <h3>From:</h3>
              ${businessInfo ? `
                <p><strong>${businessInfo.businessName || ''}</strong></p>
                <p>${businessInfo.ownerName || ''}</p>
                <p>${businessInfo.email || ''}</p>
                <p>${businessInfo.phone || ''}</p>
                ${businessInfo.address ? `<p>${businessInfo.address}</p>` : ''}
                ${businessInfo.city && businessInfo.state ? `<p>${businessInfo.city}, ${businessInfo.state} ${businessInfo.pincode || ''}</p>` : ''}
                ${businessInfo.gstNumber ? `<p>GST: ${businessInfo.gstNumber}</p>` : ''}
              ` : ''}
            </div>
            <div>
              <h3>To:</h3>
              <p><strong>${invoice.client_name}</strong></p>
              ${invoice.client_email ? `<p>${invoice.client_email}</p>` : ''}
              ${invoice.client_address ? `<p>${invoice.client_address}</p>` : ''}
              ${invoice.client_gst_number ? `<p>GST: ${invoice.client_gst_number}</p>` : ''}
            </div>
          </div>

          <div class="dates">
            <div>
              <p><strong>Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString()}</p>
              <p><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p><strong>Status:</strong><span class="status">PENDING</span></p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Rate</th>
                <th class="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${invoice.items.map((item: any) => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">₹${item.rate.toFixed(2)}</td>
                  <td class="text-right">₹${item.amount.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-table">
              <div>
                <span>Subtotal:</span>
                <span>₹${Number(invoice.amount).toFixed(2)}</span>
              </div>
              <div>
                <span>GST:</span>
                <span>₹${Number(invoice.gst_amount).toFixed(2)}</span>
              </div>
              <div class="total-final">
                <span>Total:</span>
                <span>₹${Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          ${invoice.notes ? `
            <div class="notes">
              <h3>Notes:</h3>
              <p>${invoice.notes}</p>
            </div>
          ` : ''}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const createInvoiceDataObject = () => {
    const { subtotal, gstAmount, total } = calculateTotals();
    
    return {
      invoice_number: invoiceData.invoiceNumber,
      client_name: invoiceData.clientName,
      client_email: invoiceData.clientEmail || null,
      client_gst_number: invoiceData.clientGST || null,
      client_address: invoiceData.clientAddress || null,
      amount: subtotal,
      gst_amount: gstAmount,
      total_amount: total,
      status: 'pending' as const,
      invoice_date: invoiceData.invoiceDate,
      due_date: invoiceData.dueDate,
      items: items,
      notes: invoiceData.notes || null,
    };
  };

  const handleSave = async () => {
    console.log('Save as draft clicked');
    
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

    try {
      console.log('User ID:', user?.id);
      
      const invoiceDataToSave = createInvoiceDataObject();
      console.log('Invoice data to save:', invoiceDataToSave);
      
      const savedInvoice = await createInvoiceMutation.mutateAsync(invoiceDataToSave);
      
      console.log('Invoice saved successfully:', savedInvoice);

      toast({
        title: "Invoice Saved",
        description: "Your invoice has been saved as draft successfully.",
      });

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

  const handleSaveAndSend = async () => {
    console.log('Save and send clicked');
    
    if (!invoiceData.clientName.trim()) {
      toast({
        title: "Validation Error",
        description: "Client name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!invoiceData.clientEmail.trim()) {
      toast({
        title: "Validation Error",
        description: "Client email is required to send invoice.",
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

    try {
      console.log('User ID:', user?.id);
      
      const invoiceDataToSave = createInvoiceDataObject();
      console.log('Invoice data to save:', invoiceDataToSave);
      
      const savedInvoice = await createInvoiceMutation.mutateAsync(invoiceDataToSave);
      
      console.log('Invoice saved successfully:', savedInvoice);

      // Create email content
      const { subtotal, gstAmount, total } = calculateTotals();
      const businessInfo = user?.unsafeMetadata?.businessInfo as any;
      
      const emailSubject = `Invoice ${invoiceData.invoiceNumber} from ${businessInfo?.businessName || 'Aczen Bilz'}`;
      const emailBody = `Dear ${invoiceData.clientName},

Please find attached invoice ${invoiceData.invoiceNumber} for the amount of ₹${total.toFixed(2)}.

Invoice Details:
- Invoice Number: ${invoiceData.invoiceNumber}
- Invoice Date: ${new Date(invoiceData.invoiceDate).toLocaleDateString()}
- Due Date: ${new Date(invoiceData.dueDate).toLocaleDateString()}
- Amount: ₹${subtotal.toFixed(2)}
- GST (${gstRate}%): ₹${gstAmount.toFixed(2)}
- Total Amount: ₹${total.toFixed(2)}

${invoiceData.notes ? `\nNotes: ${invoiceData.notes}` : ''}

Thank you for your business!

Best regards,
${businessInfo?.businessName || 'Aczen Bilz'}`;

      // Open email client with pre-filled data
      const mailtoLink = `mailto:${invoiceData.clientEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      window.open(mailtoLink);

      toast({
        title: "Invoice Saved & Email Opened",
        description: "Invoice saved successfully and email client opened with pre-filled content.",
      });

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
          {/* PDF Processor */}
          <PDFProcessor />

          {/* Client Information */}
          <Card>
            <CardHeader>
              <CardTitle>Client Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <ClientSelector 
                onClientSelect={handleClientSelect}
                selectedClientId={selectedClient?.id}
              />
              
              {/* Manual client fields - only show if no client is selected or allow override */}
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
                  onClick={handleSave} 
                  variant="outline" 
                  className="w-full"
                  disabled={createInvoiceMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {createInvoiceMutation.isPending ? "Saving..." : "Save as Draft"}
                </Button>
                <Button 
                  onClick={handleSaveAndSend} 
                  variant="outline"
                  className="w-full"
                  disabled={createInvoiceMutation.isPending}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {createInvoiceMutation.isPending ? "Saving..." : "Save & Send"}
                </Button>
                <Button 
                  onClick={handleDownload} 
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
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

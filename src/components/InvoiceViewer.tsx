
import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { useUser } from '@clerk/clerk-react';
import { useBusinessData } from '@/hooks/useBusinessData';
import { toWords } from 'number-to-words';

interface InvoiceViewerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

const InvoiceViewer: React.FC<InvoiceViewerProps> = ({ invoice, isOpen, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();
  const { getBusinessInfo, getBankDetails, getBusinessAssets } = useBusinessData();

  if (!invoice) return null;

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice ${invoice.invoice_number}</title>
            <style>
              body { 
                font-family: 'Arial', sans-serif; 
                margin: 0; 
                padding: 20px; 
                color: #333;
                line-height: 1.6;
              }
              .header { 
                display: flex; 
                justify-content: space-between; 
                align-items: flex-start;
                margin-bottom: 30px; 
                border-bottom: 2px solid #e5e7eb;
                padding-bottom: 20px;
              }
              .logo-section {
                display: flex;
                align-items: center;
                gap: 15px;
              }
              .business-logo { 
                max-width: 120px; 
                max-height: 80px; 
                object-fit: contain;
              }
              .business-name {
                font-size: 24px;
                font-weight: bold;
                color: #1f2937;
                margin: 0;
              }
              .business-tagline {
                font-size: 14px;
                color: #6b7280;
                margin: 0;
              }
              .invoice-title {
                text-align: right;
              }
              .invoice-title h1 {
                font-size: 28px;
                font-weight: bold;
                color: #1f2937;
                margin: 0 0 5px 0;
              }
              .invoice-number {
                font-size: 16px;
                color: #6b7280;
                margin: 0;
              }
              .info-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 30px;
                margin-bottom: 30px;
              }
              .info-section h3 {
                font-size: 16px;
                font-weight: bold;
                color: #1f2937;
                margin: 0 0 10px 0;
                border-bottom: 1px solid #e5e7eb;
                padding-bottom: 5px;
              }
              .info-section p {
                margin: 3px 0;
                font-size: 14px;
                color: #4b5563;
              }
              .items-table { 
                width: 100%; 
                border-collapse: collapse; 
                margin: 20px 0;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              }
              .items-table th, .items-table td { 
                border: 1px solid #e5e7eb; 
                padding: 12px 8px; 
                text-align: left; 
              }
              .items-table th { 
                background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                font-weight: bold;
                color: #1f2937;
                font-size: 14px;
              }
              .items-table td {
                font-size: 13px;
                color: #374151;
              }
              .text-right { text-align: right; }
              .totals { 
                margin-top: 30px; 
                display: flex;
                justify-content: flex-end;
              }
              .totals-table {
                width: 300px;
              }
              .totals-table tr {
                border-bottom: 1px solid #e5e7eb;
              }
              .totals-table td {
                padding: 8px 12px;
                font-size: 14px;
              }
              .total-row { 
                font-weight: bold; 
                font-size: 16px;
                background: #f8fafc;
              }
              .amount-words {
                background: #f8fafc;
                padding: 15px;
                border-radius: 6px;
                margin: 20px 0;
                border-left: 4px solid #3b82f6;
              }
              .amount-words h4 {
                margin: 0 0 5px 0;
                font-size: 14px;
                color: #1f2937;
              }
              .amount-words p {
                margin: 0;
                font-style: italic;
                color: #6b7280;
                font-size: 14px;
              }
              .bank-details {
                background: #f0f9ff;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
                border: 1px solid #bae6fd;
              }
              .bank-details h3 {
                color: #0369a1;
                margin: 0 0 15px 0;
                font-size: 16px;
              }
              .bank-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
              }
              .bank-grid p {
                margin: 5px 0;
                font-size: 13px;
                color: #0f172a;
              }
              .signature-section {
                display: flex;
                justify-content: flex-end;
                margin: 40px 0 20px 0;
              }
              .signature {
                text-align: center;
                width: 200px;
              }
              .signature-img {
                max-width: 120px;
                max-height: 60px;
                object-fit: contain;
                margin-bottom: 5px;
              }
              .signature-line {
                border-top: 1px solid #374151;
                padding-top: 5px;
                margin-top: 10px;
              }
              .footer {
                text-align: center;
                margin-top: 40px;
                padding-top: 20px;
                border-top: 1px solid #e5e7eb;
                color: #6b7280;
                font-size: 14px;
              }
              @media print {
                body { margin: 0; }
                .no-print { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="logo-section">
                ${businessAssets.logoBase64 ? `<img src="data:image/png;base64,${businessAssets.logoBase64}" alt="Business Logo" class="business-logo" />` : businessAssets.logoUrl ? `<img src="${businessAssets.logoUrl}" alt="Business Logo" class="business-logo" />` : ''}
                <div>
                  <h1 class="business-name">${businessInfo?.businessName || 'Your Business'}</h1>
                  <p class="business-tagline">Professional Invoice Services</p>
                </div>
              </div>
              <div class="invoice-title">
                <h1>INVOICE</h1>
                <p class="invoice-number">#${invoice.invoice_number}</p>
              </div>
            </div>
            
            <div class="info-grid">
              <div class="info-section">
                <h3>From:</h3>
                ${businessInfo ? `
                  <p><strong>${businessInfo.businessName}</strong></p>
                  <p>${businessInfo.ownerName}</p>
                  <p>${businessInfo.email}</p>
                  <p>${businessInfo.phone}</p>
                  ${businessInfo.address ? `<p>${businessInfo.address}</p>` : ''}
                  ${businessInfo.city && businessInfo.state ? `<p>${businessInfo.city}, ${businessInfo.state} ${businessInfo.pincode}</p>` : ''}
                  ${businessInfo.gstNumber ? `<p><strong>GST:</strong> ${businessInfo.gstNumber}</p>` : ''}
                ` : '<p>Business information not available</p>'}
              </div>
              <div class="info-section">
                <h3>To:</h3>
                <p><strong>${invoice.client_name}</strong></p>
                ${invoice.client_email ? `<p>${invoice.client_email}</p>` : ''}
                ${invoice.client_address ? `<p>${invoice.client_address}</p>` : ''}
                ${invoice.client_gst_number ? `<p><strong>GST:</strong> ${invoice.client_gst_number}</p>` : ''}
              </div>
            </div>
            
            <div class="info-grid">
              <div class="info-section">
                <h3>Invoice Details:</h3>
                <p><strong>Invoice Date:</strong> ${new Date(invoice.invoice_date).toLocaleDateString()}</p>
                <p><strong>Due Date:</strong> ${new Date(invoice.due_date).toLocaleDateString()}</p>
                <p><strong>Status:</strong> ${invoice.status.toUpperCase()}</p>
              </div>
              <div class="info-section">
                <h3>Payment Terms:</h3>
                <p>Payment due on receipt</p>
                <p>All prices are in INR</p>
              </div>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40%;">Description</th>
                  <th style="width: 15%;">HSN/SAC</th>
                  <th style="width: 15%;" class="text-right">Qty</th>
                  <th style="width: 15%;" class="text-right">Rate</th>
                  <th style="width: 15%;" class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map((item: any) => `
                  <tr>
                    <td>${item.description}</td>
                    <td>${item.hsn_sac || '-'}</td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">₹${Number(item.rate).toFixed(2)}</td>
                    <td class="text-right">₹${Number(item.amount).toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="amount-words">
              <h4>Amount in Words:</h4>
              <p>${totalAmountInWords}</p>
            </div>
            
            <div class="totals">
              <table class="totals-table">
                <tr>
                  <td>Subtotal:</td>
                  <td class="text-right">₹${Number(invoice.amount).toFixed(2)}</td>
                </tr>
                ${invoice.discount && invoice.discount > 0 ? `
                  <tr>
                    <td>Discount:</td>
                    <td class="text-right">-₹${Number(invoice.discount).toFixed(2)}</td>
                  </tr>
                ` : ''}
                <tr>
                  <td>GST (${invoice.gst_rate || 18}%):</td>
                  <td class="text-right">₹${Number(invoice.gst_amount).toFixed(2)}</td>
                </tr>
                ${invoice.advance && invoice.advance > 0 ? `
                  <tr>
                    <td>Advance:</td>
                    <td class="text-right">-₹${Number(invoice.advance).toFixed(2)}</td>
                  </tr>
                ` : ''}
                ${invoice.roundoff && invoice.roundoff !== 0 ? `
                  <tr>
                    <td>Round Off:</td>
                    <td class="text-right">${invoice.roundoff >= 0 ? '+' : ''}₹${Number(invoice.roundoff).toFixed(2)}</td>
                  </tr>
                ` : ''}
                <tr class="total-row">
                  <td><strong>Total:</strong></td>
                  <td class="text-right"><strong>₹${Number(invoice.total_amount).toFixed(2)}</strong></td>
                </tr>
              </table>
            </div>
            
            ${bankDetails ? `
              <div class="bank-details">
                <h3>Bank Details for Payment:</h3>
                <div class="bank-grid">
                  <div>
                    <p><strong>Account Holder:</strong> ${bankDetails.accountHolderName}</p>
                    <p><strong>Account Number:</strong> ${bankDetails.accountNumber}</p>
                    <p><strong>IFSC Code:</strong> ${bankDetails.ifscCode}</p>
                  </div>
                  <div>
                    <p><strong>Bank Name:</strong> ${bankDetails.bankName}</p>
                    <p><strong>Branch:</strong> ${bankDetails.branchName}</p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            ${invoice.notes ? `
              <div style="margin: 20px 0; padding: 15px; background: #fffbeb; border-radius: 6px; border: 1px solid #fde68a;">
                <h3 style="color: #92400e; margin: 0 0 10px 0; font-size: 16px;">Notes:</h3>
                <p style="margin: 0; font-size: 14px; color: #451a03;">${invoice.notes}</p>
              </div>
            ` : ''}
            
            ${businessAssets.signatureBase64 || businessAssets.signatureUrl ? `
              <div class="signature-section">
                <div class="signature">
                  <img src="${businessAssets.signatureBase64 ? `data:image/png;base64,${businessAssets.signatureBase64}` : businessAssets.signatureUrl}" alt="Authorized Signature" class="signature-img" />
                  <div class="signature-line">
                    <p style="margin: 5px 0; font-size: 14px; font-weight: bold;">Authorized Signature</p>
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">${businessInfo?.ownerName || 'Authorized Person'}</p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>This is a computer-generated invoice.</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const businessInfo = getBusinessInfo();
  const bankDetails = getBankDetails();
  const businessAssets = getBusinessAssets();

  // Convert total amount to words
  const totalInWords = toWords(Math.floor(Number(invoice.total_amount)));
  const totalAmountInWords = `${totalInWords.charAt(0).toUpperCase() + totalInWords.slice(1)} rupees only`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Invoice {invoice.invoice_number}</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleDownload} size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogDescription>
            View and download invoice details for {invoice.client_name}
          </DialogDescription>
        </DialogHeader>
        
        <div ref={printRef} className="bg-background p-8 space-y-6 border rounded-lg">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              {(businessAssets.logoBase64 || businessAssets.logoUrl) && (
                <img 
                  src={businessAssets.logoBase64 ? `data:image/png;base64,${businessAssets.logoBase64}` : businessAssets.logoUrl}
                  alt="Business Logo" 
                  className="w-20 h-16 object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-primary">{businessInfo?.businessName || 'Your Business'}</h1>
                <p className="text-sm text-muted-foreground">Professional Invoice Services</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold text-foreground">INVOICE</h2>
              <p className="text-sm text-muted-foreground">#{invoice.invoice_number}</p>
            </div>
          </div>

          {/* Business & Client Info */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-2 text-foreground">From:</h3>
              {businessInfo && (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground">{businessInfo.businessName}</p>
                  <p className="text-muted-foreground">{businessInfo.ownerName}</p>
                  <p className="text-muted-foreground">{businessInfo.email}</p>
                  <p className="text-muted-foreground">{businessInfo.phone}</p>
                  {businessInfo.address && <p className="text-muted-foreground">{businessInfo.address}</p>}
                  {businessInfo.city && businessInfo.state && (
                    <p className="text-muted-foreground">{businessInfo.city}, {businessInfo.state} {businessInfo.pincode}</p>
                  )}
                  {businessInfo.gstNumber && <p className="text-muted-foreground">GST: {businessInfo.gstNumber}</p>}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-foreground">To:</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium text-foreground">{invoice.client_name}</p>
                {invoice.client_email && <p className="text-muted-foreground">{invoice.client_email}</p>}
                {invoice.client_address && <p className="text-muted-foreground">{invoice.client_address}</p>}
                {invoice.client_gst_number && <p className="text-muted-foreground">GST: {invoice.client_gst_number}</p>}
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="text-foreground"><span className="font-semibold">Invoice Date:</span> {new Date(invoice.invoice_date).toLocaleDateString()}</p>
              <p className="text-foreground"><span className="font-semibold">Due Date:</span> {new Date(invoice.due_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-foreground"><span className="font-semibold">Status:</span> 
                <span className={`ml-2 px-2 py-1 rounded text-xs ${
                  invoice.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {invoice.status.toUpperCase()}
                </span>
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <table className="w-full border-collapse border border-border">
              <thead>
                <tr className="bg-muted">
                  <th className="border border-border p-2 text-left text-foreground">Description</th>
                  <th className="border border-border p-2 text-left text-foreground">HSN/SAC</th>
                  <th className="border border-border p-2 text-right text-foreground">Qty</th>
                  <th className="border border-border p-2 text-right text-foreground">Rate</th>
                  <th className="border border-border p-2 text-right text-foreground">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="border border-border p-2 text-foreground">{item.description}</td>
                    <td className="border border-border p-2 text-foreground">{item.hsn_sac || '-'}</td>
                    <td className="border border-border p-2 text-right text-foreground">{item.quantity}</td>
                    <td className="border border-border p-2 text-right text-foreground">₹{item.rate.toFixed(2)}</td>
                    <td className="border border-border p-2 text-right text-foreground">₹{item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Amount in Words */}
          <div className="bg-muted p-4 rounded">
            <p className="font-semibold text-foreground">Amount in Words:</p>
            <p className="text-sm italic text-muted-foreground">{totalAmountInWords}</p>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between text-foreground">
                <span>Subtotal:</span>
                <span>₹{Number(invoice.amount).toFixed(2)}</span>
              </div>
              {invoice.discount && invoice.discount > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Discount:</span>
                  <span>-₹{Number(invoice.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-foreground">
                <span>GST ({invoice.gst_rate || 18}%):</span>
                <span>₹{Number(invoice.gst_amount).toFixed(2)}</span>
              </div>
              {invoice.advance && invoice.advance > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Advance:</span>
                  <span>-₹{Number(invoice.advance).toFixed(2)}</span>
                </div>
              )}
              {invoice.roundoff && invoice.roundoff !== 0 && (
                <div className="flex justify-between text-foreground">
                  <span>Round Off:</span>
                  <span>{invoice.roundoff >= 0 ? '+' : ''}₹{Number(invoice.roundoff).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg border-t pt-2 text-foreground">
                <span>Total:</span>
                <span>₹{Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          {bankDetails && (
            <div className="bg-primary/5 p-4 rounded space-y-2">
              <h3 className="font-semibold text-primary">Bank Details:</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-foreground"><span className="font-medium">Account Holder:</span> {bankDetails.accountHolderName}</p>
                  <p className="text-foreground"><span className="font-medium">Account Number:</span> {bankDetails.accountNumber}</p>
                  <p className="text-foreground"><span className="font-medium">IFSC Code:</span> {bankDetails.ifscCode}</p>
                </div>
                <div>
                  <p className="text-foreground"><span className="font-medium">Bank Name:</span> {bankDetails.bankName}</p>
                  <p className="text-foreground"><span className="font-medium">Branch:</span> {bankDetails.branchName}</p>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="font-semibold mb-2 text-foreground">Notes:</h3>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          )}

          {/* Signature */}
          {businessAssets.signatureBase64 && (
            <div className="flex justify-end pt-6">
              <div className="text-center">
                <img 
                  src={`data:image/png;base64,${businessAssets.signatureBase64}`}
                  alt="Authorized Signature" 
                  className="max-w-32 max-h-16 object-contain mx-auto mb-2"
                />
                <div className="border-t border-border pt-1">
                  <p className="text-sm font-medium text-foreground">Authorized Signature</p>
                  <p className="text-xs text-muted-foreground">{businessInfo?.ownerName || 'Authorized Person'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground pt-4 border-t">
            <p>Thank you for your business!</p>
            <p>This is a computer-generated invoice and does not require a signature unless specified.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceViewer;

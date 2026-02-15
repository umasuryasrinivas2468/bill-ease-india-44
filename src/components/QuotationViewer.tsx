import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import { toWords } from 'number-to-words';
import { Quotation } from '@/hooks/useQuotations';

interface QuotationViewerProps {
  quotation: Quotation | null;
  isOpen: boolean;
  onClose: () => void;
}

const QuotationViewer: React.FC<QuotationViewerProps> = ({ quotation, isOpen, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { getBusinessInfo, getBankDetails, getPreferredLogo, getPreferredSignature } = useEnhancedBusinessData();

  if (!quotation) return null;

  const businessInfo = getBusinessInfo();
  const bankDetails = getBankDetails();
  const logoUrl = getPreferredLogo();
  const signatureUrl = getPreferredSignature();

  // Convert total amount to words
  const totalInWords = toWords(Math.floor(Number(quotation.total_amount)));
  const totalAmountInWords = `${totalInWords.charAt(0).toUpperCase() + totalInWords.slice(1)} rupees only`;

  const handleDownload = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Quotation ${quotation.quotation_number}</title>
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
              .quotation-title {
                text-align: right;
              }
              .quotation-title h1 {
                font-size: 28px;
                font-weight: bold;
                color: #1f2937;
                margin: 0 0 5px 0;
              }
              .quotation-number {
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
              .terms {
                margin-top: 30px;
                padding: 15px;
                background: #fffbeb;
                border-radius: 6px;
                border: 1px solid #fde68a;
              }
              .terms h3 {
                color: #92400e;
                margin: 0 0 10px 0;
                font-size: 16px;
              }
              .terms p {
                margin: 0;
                font-size: 14px;
                color: #451a03;
                line-height: 1.5;
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
                ${logoUrl ? `<img src="${logoUrl}" alt="Business Logo" class="business-logo" />` : ''}
                <div>
                  <h1 class="business-name">${businessInfo?.businessName || 'Your Business'}</h1>
                  <p class="business-tagline">Professional Quotation Services</p>
                </div>
              </div>
              <div class="quotation-title">
                <h1>QUOTATION</h1>
                <p class="quotation-number">#${quotation.quotation_number}</p>
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
                <p><strong>${quotation.client_name}</strong></p>
                ${quotation.client_email ? `<p>${quotation.client_email}</p>` : ''}
                ${quotation.client_phone ? `<p>${quotation.client_phone}</p>` : ''}
                ${quotation.client_address ? `<p>${quotation.client_address}</p>` : ''}
              </div>
            </div>
            
            <div class="info-grid">
              <div class="info-section">
                <h3>Quotation Details:</h3>
                <p><strong>Date:</strong> ${new Date(quotation.quotation_date).toLocaleDateString()}</p>
                <p><strong>Valid Until:</strong> ${new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
                <p><strong>Status:</strong> ${quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)}</p>
              </div>
              <div class="info-section">
                <h3>Payment Terms:</h3>
                <p>Valid for ${quotation.validity_period} days</p>
                <p>All prices are in INR</p>
              </div>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 40%;">Description</th>
                  <th style="width: 15%;" class="text-right">Qty</th>
                  <th style="width: 15%;" class="text-right">Rate</th>
                  <th style="width: 15%;" class="text-right">Tax</th>
                  <th style="width: 15%;" class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.items.map((item: any) => `
                  <tr>
                    <td>
                      <strong>${item.name}</strong>
                      ${item.description ? `<br><small style="color: #6b7280;">${item.description}</small>` : ''}
                    </td>
                    <td class="text-right">${item.quantity}</td>
                    <td class="text-right">₹${Number(item.price || 0).toFixed(2)}</td>
                    <td class="text-right">18%</td>
                    <td class="text-right">₹${Number(item.amount || 0).toFixed(2)}</td>
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
                  <td class="text-right">₹${Number(quotation.subtotal).toFixed(2)}</td>
                </tr>
                ${quotation.discount && quotation.discount > 0 ? `
                  <tr>
                    <td>Discount:</td>
                    <td class="text-right">-₹${Number(quotation.discount).toFixed(2)}</td>
                  </tr>
                ` : ''}
                <tr>
                  <td>Tax (18%):</td>
                  <td class="text-right">₹${Number(quotation.tax_amount).toFixed(2)}</td>
                </tr>
                <tr class="total-row">
                  <td><strong>Total:</strong></td>
                  <td class="text-right"><strong>₹${Number(quotation.total_amount).toFixed(2)}</strong></td>
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
            
            ${quotation.terms_conditions ? `
              <div class="terms">
                <h3>Terms & Conditions:</h3>
                <p>${quotation.terms_conditions}</p>
              </div>
            ` : ''}
            
            ${signatureUrl ? `
              <div class="signature-section">
                <div class="signature">
                  <img src="${signatureUrl}" alt="Authorized Signature" class="signature-img" />
                  <div class="signature-line">
                    <p style="margin: 5px 0; font-size: 14px; font-weight: bold;">Authorized Signature</p>
                    <p style="margin: 0; font-size: 12px; color: #6b7280;">${businessInfo?.ownerName || 'Authorized Person'}</p>
                  </div>
                </div>
              </div>
            ` : ''}
            
            <div class="footer">
              <p>Thank you for your business!</p>
              <p>This is a computer-generated quotation and does not require a signature unless specified.</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Quotation {quotation.quotation_number}</DialogTitle>
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
        </DialogHeader>
        
        <div ref={printRef} className="bg-background p-8 space-y-6 border rounded-lg">
          {/* Header */}
          <div className="flex justify-between items-start border-b pb-6">
            <div className="flex items-center gap-4">
              {logoUrl && (
                <img 
                  src={logoUrl}
                  alt="Business Logo" 
                  className="w-20 h-16 object-contain"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-primary">{businessInfo?.businessName || 'Your Business'}</h1>
                <p className="text-sm text-muted-foreground">Professional Quotation Services</p>
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-foreground">QUOTATION</h2>
              <p className="text-sm text-muted-foreground">#{quotation.quotation_number}</p>
            </div>
          </div>

          {/* Business & Client Info */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-3 text-foreground border-b pb-1">From:</h3>
              {businessInfo ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground">{businessInfo.businessName}</p>
                  <p className="text-muted-foreground">{businessInfo.ownerName}</p>
                  <p className="text-muted-foreground">{businessInfo.email}</p>
                  <p className="text-muted-foreground">{businessInfo.phone}</p>
                  {businessInfo.address && <p className="text-muted-foreground">{businessInfo.address}</p>}
                  {businessInfo.city && businessInfo.state && (
                    <p className="text-muted-foreground">{businessInfo.city}, {businessInfo.state} {businessInfo.pincode}</p>
                  )}
                  {businessInfo.gstNumber && <p className="text-muted-foreground font-medium">GST: {businessInfo.gstNumber}</p>}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Business information not available</p>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-foreground border-b pb-1">To:</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium text-foreground">{quotation.client_name}</p>
                {quotation.client_email && <p className="text-muted-foreground">{quotation.client_email}</p>}
                {quotation.client_phone && <p className="text-muted-foreground">{quotation.client_phone}</p>}
                {quotation.client_address && <p className="text-muted-foreground">{quotation.client_address}</p>}
              </div>
            </div>
          </div>

          {/* Quotation Details */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-3 text-foreground border-b pb-1">Quotation Details:</h3>
              <div className="text-sm space-y-1">
                <p className="text-foreground"><span className="font-semibold">Date:</span> {new Date(quotation.quotation_date).toLocaleDateString()}</p>
                <p className="text-foreground"><span className="font-semibold">Valid Until:</span> {new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
                <p className="text-foreground">
                  <span className="font-semibold">Status:</span> 
                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                    quotation.status === 'accepted' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                    quotation.status === 'sent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                    quotation.status === 'rejected' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                  }`}>
                    {quotation.status.toUpperCase()}
                  </span>
                </p>
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-3 text-foreground border-b pb-1">Payment Terms:</h3>
              <div className="text-sm space-y-1">
                <p className="text-muted-foreground">Valid for {quotation.validity_period} days</p>
                <p className="text-muted-foreground">All prices are in INR</p>
                <p className="text-muted-foreground">Tax included as applicable</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <h3 className="font-semibold mb-3 text-foreground">Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-border shadow-sm">
                <thead>
                  <tr className="bg-muted">
                    <th className="border border-border p-3 text-left text-foreground">Description</th>
                    <th className="border border-border p-3 text-right text-foreground">Qty</th>
                    <th className="border border-border p-3 text-right text-foreground">Rate</th>
                    <th className="border border-border p-3 text-right text-foreground">Tax</th>
                    <th className="border border-border p-3 text-right text-foreground">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.items.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="border border-border p-3 text-foreground">
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-sm text-muted-foreground mt-1">{item.description}</div>
                          )}
                        </div>
                      </td>
                      <td className="border border-border p-3 text-right text-foreground">{item.quantity}</td>
                      <td className="border border-border p-3 text-right text-foreground">₹{Number(item.price || 0).toFixed(2)}</td>
                      <td className="border border-border p-3 text-right text-foreground">18%</td>
                      <td className="border border-border p-3 text-right text-foreground">₹{Number(item.amount || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="bg-muted p-4 rounded border-l-4 border-l-primary">
            <p className="font-semibold text-foreground">Amount in Words:</p>
            <p className="text-sm italic text-muted-foreground">{totalAmountInWords}</p>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-80 space-y-2">
              <div className="flex justify-between text-foreground">
                <span>Subtotal:</span>
                <span>₹{Number(quotation.subtotal).toFixed(2)}</span>
              </div>
              {quotation.discount && quotation.discount > 0 && (
                <div className="flex justify-between text-red-600 dark:text-red-400">
                  <span>Discount:</span>
                  <span>-₹{Number(quotation.discount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-foreground">
                <span>Tax (18%):</span>
                <span>₹{Number(quotation.tax_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2 text-foreground">
                <span>Total:</span>
                <span>₹{Number(quotation.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Bank Details */}
          {bankDetails && (
            <div className="bg-blue-50 dark:bg-blue-950 p-6 rounded border">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">Bank Details for Payment:</h3>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-blue-800 dark:text-blue-200"><span className="font-medium">Account Holder:</span> {bankDetails.accountHolderName}</p>
                  <p className="text-blue-800 dark:text-blue-200"><span className="font-medium">Account Number:</span> {bankDetails.accountNumber}</p>
                  <p className="text-blue-800 dark:text-blue-200"><span className="font-medium">IFSC Code:</span> {bankDetails.ifscCode}</p>
                </div>
                <div>
                  <p className="text-blue-800 dark:text-blue-200"><span className="font-medium">Bank Name:</span> {bankDetails.bankName}</p>
                  <p className="text-blue-800 dark:text-blue-200"><span className="font-medium">Branch:</span> {bankDetails.branchName}</p>
                </div>
              </div>
            </div>
          )}

          {/* Terms & Conditions */}
          {quotation.terms_conditions && (
            <div className="bg-yellow-50 dark:bg-yellow-950 p-4 rounded border border-yellow-200 dark:border-yellow-800">
              <h3 className="font-semibold mb-2 text-yellow-900 dark:text-yellow-100">Terms & Conditions:</h3>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 leading-relaxed">{quotation.terms_conditions}</p>
            </div>
          )}

          {/* Signature */}
          {signatureUrl && (
            <div className="flex justify-end pt-6">
              <div className="text-center">
                <img 
                  src={signatureUrl}
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
          <div className="text-center text-sm text-muted-foreground pt-6 border-t">
            <p>Thank you for your business!</p>
            <p>This is a computer-generated quotation and does not require a signature unless specified.</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationViewer;
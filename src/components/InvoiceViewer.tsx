
import React, { useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { useUser } from '@clerk/clerk-react';
import { useEnhancedBusinessData } from '@/hooks/useEnhancedBusinessData';
import useSimpleBranding from '@/hooks/useSimpleBranding';
import { toWords } from 'number-to-words';
import InvoiceTemplateSelector, { InvoiceTemplate } from './InvoiceTemplateSelector';
import { downloadProfessionalInvoice } from '@/utils/invoiceTemplatePDF';

interface InvoiceViewerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

const InvoiceViewer: React.FC<InvoiceViewerProps> = ({ invoice, isOpen, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplate>('professional');
  const { user } = useUser();
  const { getBusinessInfo, getBankDetails, getPreferredLogo, getPreferredSignature } = useEnhancedBusinessData();
  const { getBrandingWithFallback } = useSimpleBranding();

  if (!invoice) return null;

  const businessInfo = getBusinessInfo();
  const bankDetails = getBankDetails();
  const brandingAssets = getBrandingWithFallback();
  const logoUrl = brandingAssets.logo_url || getPreferredLogo();
  const signatureUrl = brandingAssets.signature_url || getPreferredSignature();

  // Convert total amount to words
  const totalInWords = toWords(Math.floor(Number(invoice.total_amount)));
  const totalAmountInWords = `${totalInWords.charAt(0).toUpperCase() + totalInWords.slice(1)} rupees only`;

  const handleDownload = () => {
    // Use the professional template generator
    downloadProfessionalInvoice(
      invoice,
      businessInfo ? {
        businessName: businessInfo.businessName,
        ownerName: businessInfo.ownerName,
        email: businessInfo.email,
        phone: businessInfo.phone,
        address: businessInfo.address,
        city: businessInfo.city,
        state: businessInfo.state,
        pincode: businessInfo.pincode,
        gstNumber: businessInfo.gstNumber,
      } : null,
      bankDetails ? {
        accountHolderName: bankDetails.accountHolderName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        bankName: bankDetails.bankName,
        branchName: bankDetails.branchName,
      } : null,
      logoUrl,
      signatureUrl,
      selectedTemplate
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Invoice {invoice.invoice_number}</DialogTitle>
            <div className="flex items-center gap-3">
              <InvoiceTemplateSelector 
                value={selectedTemplate} 
                onChange={setSelectedTemplate} 
              />
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
              {logoUrl && (
                <img 
                  src={logoUrl}
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

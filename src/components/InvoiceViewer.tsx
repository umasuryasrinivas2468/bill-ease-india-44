
import React, { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { useUser } from '@clerk/clerk-react';

interface InvoiceViewerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

const InvoiceViewer: React.FC<InvoiceViewerProps> = ({ invoice, isOpen, onClose }) => {
  const printRef = useRef<HTMLDivElement>(null);
  const { user } = useUser();

  if (!invoice) return null;

  const handleDownload = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const originalContents = document.body.innerHTML;
    const printableContent = printContent.innerHTML;

    document.body.innerHTML = printableContent;
    window.print();
    document.body.innerHTML = originalContents;
    window.location.reload();
  };

  const businessInfo = user?.unsafeMetadata?.businessInfo as any;
  const logoUrl = user?.imageUrl;

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
        </DialogHeader>
        
        <div ref={printRef} className="bg-white p-8 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              {logoUrl && (
                <img 
                  src={logoUrl} 
                  alt="Business Logo" 
                  className="w-16 h-16 object-contain rounded"
                />
              )}
              <div>
                <h1 className="text-2xl font-bold text-blue-600">Aczen Bilz</h1>
                {businessInfo?.businessName && (
                  <p className="text-lg font-semibold">{businessInfo.businessName}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">INVOICE</h2>
              <p className="text-sm text-gray-600">#{invoice.invoice_number}</p>
            </div>
          </div>

          {/* Business & Client Info */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <h3 className="font-semibold mb-2">From:</h3>
              {businessInfo && (
                <div className="text-sm space-y-1">
                  <p className="font-medium">{businessInfo.businessName}</p>
                  <p>{businessInfo.ownerName}</p>
                  <p>{businessInfo.email}</p>
                  <p>{businessInfo.phone}</p>
                  {businessInfo.address && <p>{businessInfo.address}</p>}
                  {businessInfo.city && businessInfo.state && (
                    <p>{businessInfo.city}, {businessInfo.state} {businessInfo.pincode}</p>
                  )}
                  {businessInfo.gstNumber && <p>GST: {businessInfo.gstNumber}</p>}
                </div>
              )}
            </div>
            <div>
              <h3 className="font-semibold mb-2">To:</h3>
              <div className="text-sm space-y-1">
                <p className="font-medium">{invoice.client_name}</p>
                {invoice.client_email && <p>{invoice.client_email}</p>}
                {invoice.client_address && <p>{invoice.client_address}</p>}
                {invoice.client_gst_number && <p>GST: {invoice.client_gst_number}</p>}
              </div>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p><span className="font-semibold">Invoice Date:</span> {new Date(invoice.invoice_date).toLocaleDateString()}</p>
              <p><span className="font-semibold">Due Date:</span> {new Date(invoice.due_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p><span className="font-semibold">Status:</span> 
                <span className={`ml-2 px-2 py-1 rounded text-xs ${
                  invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                  invoice.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {invoice.status.toUpperCase()}
                </span>
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div>
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 p-2 text-left">Description</th>
                  <th className="border border-gray-300 p-2 text-right">Qty</th>
                  <th className="border border-gray-300 p-2 text-right">Rate</th>
                  <th className="border border-gray-300 p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item: any, index: number) => (
                  <tr key={index}>
                    <td className="border border-gray-300 p-2">{item.description}</td>
                    <td className="border border-gray-300 p-2 text-right">{item.quantity}</td>
                    <td className="border border-gray-300 p-2 text-right">₹{item.rate.toFixed(2)}</td>
                    <td className="border border-gray-300 p-2 text-right">₹{item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-64 space-y-2">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>₹{Number(invoice.amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST:</span>
                <span>₹{Number(invoice.gst_amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t pt-2">
                <span>Total:</span>
                <span>₹{Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div>
              <h3 className="font-semibold mb-2">Notes:</h3>
              <p className="text-sm">{invoice.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceViewer;

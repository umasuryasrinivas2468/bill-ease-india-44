
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Printer, X } from 'lucide-react';
import { Invoice } from '@/hooks/useInvoices';
import { useBusinessData } from '@/hooks/useBusinessData';
import { createSecurePrintableInvoice, securePrintInvoice } from '@/utils/securePrinting';

interface InvoiceViewerProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

const InvoiceViewer: React.FC<InvoiceViewerProps> = ({ invoice, isOpen, onClose }) => {
  const { getBusinessInfo, getBankDetails, getBusinessAssets } = useBusinessData();

  if (!invoice) return null;

  const handlePrint = () => {
    const businessInfo = getBusinessInfo();
    const bankDetails = getBankDetails();
    const assets = getBusinessAssets();
    
    const htmlContent = createSecurePrintableInvoice(
      invoice,
      businessInfo,
      bankDetails,
      assets.logoBase64,
      assets.signatureBase64
    );
    
    securePrintInvoice(htmlContent);
  };

  const handleDownload = () => {
    // For now, use the same print functionality
    // In the future, this could generate a PDF instead
    handlePrint();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Invoice {invoice.invoice_number}</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handlePrint} size="sm" variant="outline">
                <Printer className="h-4 w-4 mr-2" />
                Print
              </Button>
              <Button onClick={handleDownload} size="sm" variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={onClose} size="sm" variant="ghost">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Invoice Preview Content */}
          <div className="border rounded-lg p-6 bg-white">
            {/* Invoice Header */}
            <div className="flex justify-between items-start mb-6 pb-4 border-b-2">
              <div>
                <h1 className="text-2xl font-bold text-blue-600">INVOICE</h1>
              </div>
              <div className="text-right">
                <p className="font-semibold">Invoice #: {invoice.invoice_number}</p>
                <p>Date: {new Date(invoice.invoice_date).toLocaleDateString()}</p>
                <p>Due: {new Date(invoice.due_date).toLocaleDateString()}</p>
              </div>
            </div>

            {/* Client Info */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-semibold text-gray-600 mb-2">Bill To:</h3>
                <p className="font-semibold">{invoice.client_name}</p>
                {invoice.client_email && <p>{invoice.client_email}</p>}
                {invoice.client_address && <p>{invoice.client_address}</p>}
                {invoice.client_gst_number && <p>GST: {invoice.client_gst_number}</p>}
              </div>
              <div>
                <h3 className="font-semibold text-gray-600 mb-2">Status:</h3>
                <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                  invoice.status === 'paid' 
                    ? 'bg-green-100 text-green-800' 
                    : invoice.status === 'overdue'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                </span>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-6">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 px-4 py-2 text-left">Description</th>
                    <th className="border border-gray-300 px-4 py-2 text-center">Qty</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">Rate</th>
                    <th className="border border-gray-300 px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 px-4 py-2">{item.description}</td>
                      <td className="border border-gray-300 px-4 py-2 text-center">{item.quantity}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">₹{Number(item.rate).toLocaleString()}</td>
                      <td className="border border-gray-300 px-4 py-2 text-right">₹{Number(item.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-6">
              <div className="w-64">
                <div className="flex justify-between py-2">
                  <span>Subtotal:</span>
                  <span>₹{Number(invoice.amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span>GST:</span>
                  <span>₹{Number(invoice.gst_amount).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 font-bold text-lg border-t-2 pt-2">
                  <span>Total:</span>
                  <span>₹{Number(invoice.total_amount).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {invoice.notes && (
              <div className="mb-6">
                <h3 className="font-semibold text-gray-600 mb-2">Notes:</h3>
                <p className="text-gray-700">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InvoiceViewer;

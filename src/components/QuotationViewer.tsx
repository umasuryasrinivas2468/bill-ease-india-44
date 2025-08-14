
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';

interface QuotationItem {
  name: string;
  quantity: number;
  unit_price: number;
  tax_percentage: number;
  amount: number;
}

interface Quotation {
  id: string;
  quotation_number: string;
  client_name: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  quotation_date: string;
  validity_period: number;
  items: QuotationItem[];
  discount: number;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  terms_conditions?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
}

interface QuotationViewerProps {
  quotation: Quotation | null;
  isOpen: boolean;
  onClose: () => void;
}

const QuotationViewer: React.FC<QuotationViewerProps> = ({ quotation, isOpen, onClose }) => {
  if (!quotation) return null;

  const handleDownload = () => {
    // Create a printable version
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Quotation ${quotation.quotation_number}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .details { margin-bottom: 20px; }
              .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              .items-table th { background-color: #f5f5f5; }
              .totals { margin-top: 20px; text-align: right; }
              .total-row { font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>QUOTATION</h1>
              <h2>${quotation.quotation_number}</h2>
            </div>
            
            <div class="details">
              <p><strong>Client:</strong> ${quotation.client_name}</p>
              ${quotation.client_email ? `<p><strong>Email:</strong> ${quotation.client_email}</p>` : ''}
              ${quotation.client_phone ? `<p><strong>Phone:</strong> ${quotation.client_phone}</p>` : ''}
              ${quotation.client_address ? `<p><strong>Address:</strong> ${quotation.client_address}</p>` : ''}
              <p><strong>Date:</strong> ${new Date(quotation.quotation_date).toLocaleDateString()}</p>
              <p><strong>Valid Until:</strong> ${new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
            </div>
            
            <table class="items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Quantity</th>
                  <th>Unit Price</th>
                  <th>Tax %</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.items.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>₹${item.unit_price.toFixed(2)}</td>
                    <td>${item.tax_percentage}%</td>
                    <td>₹${item.amount.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            
            <div class="totals">
              <p>Subtotal: ₹${quotation.subtotal.toFixed(2)}</p>
              <p>Tax: ₹${quotation.tax_amount.toFixed(2)}</p>
              ${quotation.discount > 0 ? `<p>Discount: -₹${((quotation.subtotal + quotation.tax_amount) * quotation.discount / 100).toFixed(2)}</p>` : ''}
              <p class="total-row">Total: ₹${quotation.total_amount.toFixed(2)}</p>
            </div>
            
            ${quotation.terms_conditions ? `
              <div style="margin-top: 30px;">
                <h3>Terms & Conditions</h3>
                <p>${quotation.terms_conditions}</p>
              </div>
            ` : ''}
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>Quotation {quotation.quotation_number}</DialogTitle>
            <div className="flex gap-2">
              <Button onClick={handleDownload} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button onClick={onClose} variant="ghost" size="sm">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Client Details</h3>
              <p><strong>Name:</strong> {quotation.client_name}</p>
              {quotation.client_email && <p><strong>Email:</strong> {quotation.client_email}</p>}
              {quotation.client_phone && <p><strong>Phone:</strong> {quotation.client_phone}</p>}
              {quotation.client_address && <p><strong>Address:</strong> {quotation.client_address}</p>}
            </div>
            <div>
              <h3 className="font-semibold mb-2">Quotation Details</h3>
              <p><strong>Date:</strong> {new Date(quotation.quotation_date).toLocaleDateString()}</p>
              <p><strong>Valid Until:</strong> {new Date(new Date(quotation.quotation_date).getTime() + quotation.validity_period * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>
              <p><strong>Status:</strong> {quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)}</p>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-2">Items</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-300 p-2 text-left">Item</th>
                    <th className="border border-gray-300 p-2 text-left">Quantity</th>
                    <th className="border border-gray-300 p-2 text-left">Unit Price</th>
                    <th className="border border-gray-300 p-2 text-left">Tax %</th>
                    <th className="border border-gray-300 p-2 text-left">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quotation.items.map((item, index) => (
                    <tr key={index}>
                      <td className="border border-gray-300 p-2">{item.name}</td>
                      <td className="border border-gray-300 p-2">{item.quantity}</td>
                      <td className="border border-gray-300 p-2">₹{item.unit_price.toFixed(2)}</td>
                      <td className="border border-gray-300 p-2">{item.tax_percentage}%</td>
                      <td className="border border-gray-300 p-2">₹{item.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="text-right space-y-1">
            <p>Subtotal: ₹{quotation.subtotal.toFixed(2)}</p>
            <p>Tax: ₹{quotation.tax_amount.toFixed(2)}</p>
            {quotation.discount > 0 && (
              <p>Discount: -₹{((quotation.subtotal + quotation.tax_amount) * quotation.discount / 100).toFixed(2)}</p>
            )}
            <p className="font-bold text-lg border-t pt-1">
              Total: ₹{quotation.total_amount.toFixed(2)}
            </p>
          </div>
          
          {quotation.terms_conditions && (
            <div>
              <h3 className="font-semibold mb-2">Terms & Conditions</h3>
              <p className="text-sm text-gray-600">{quotation.terms_conditions}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default QuotationViewer;

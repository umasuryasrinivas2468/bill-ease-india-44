
import { Invoice } from '@/hooks/useInvoices';
import { BusinessInfo, BankDetails } from '@/hooks/useBusinessData';

// Sanitize text content to prevent XSS
const sanitizeText = (text: string | undefined | null): string => {
  if (!text) return '';
  return text
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
};

// Sanitize numeric values
const sanitizeNumber = (value: number | string | undefined | null): string => {
  if (value === null || value === undefined) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? '0' : num.toString();
};

export const createSecurePrintableInvoice = (
  invoice: Invoice,
  businessInfo: BusinessInfo | null,
  bankDetails: BankDetails | null,
  logoBase64?: string,
  signatureBase64?: string
): string => {
  // Sanitize all input data
  const safeInvoice = {
    ...invoice,
    invoice_number: sanitizeText(invoice.invoice_number),
    client_name: sanitizeText(invoice.client_name),
    client_email: sanitizeText(invoice.client_email),
    client_address: sanitizeText(invoice.client_address),
    client_gst_number: sanitizeText(invoice.client_gst_number),
    notes: sanitizeText(invoice.notes),
    amount: sanitizeNumber(invoice.amount),
    gst_amount: sanitizeNumber(invoice.gst_amount),
    total_amount: sanitizeNumber(invoice.total_amount),
    items: Array.isArray(invoice.items) ? invoice.items.map(item => ({
      ...item,
      description: sanitizeText(item.description),
      quantity: sanitizeNumber(item.quantity),
      rate: sanitizeNumber(item.rate),
      amount: sanitizeNumber(item.amount)
    })) : []
  };

  const safeBusiness = businessInfo ? {
    businessName: sanitizeText(businessInfo.businessName),
    ownerName: sanitizeText(businessInfo.ownerName),
    email: sanitizeText(businessInfo.email),
    phone: sanitizeText(businessInfo.phone),
    address: sanitizeText(businessInfo.address),
    gstNumber: sanitizeText(businessInfo.gstNumber),
    city: sanitizeText(businessInfo.city),
    state: sanitizeText(businessInfo.state),
    pincode: sanitizeText(businessInfo.pincode)
  } : null;

  const safeBankDetails = bankDetails ? {
    accountNumber: sanitizeText(bankDetails.accountNumber),
    ifscCode: sanitizeText(bankDetails.ifscCode),
    bankName: sanitizeText(bankDetails.bankName),
    branchName: sanitizeText(bankDetails.branchName),
    accountHolderName: sanitizeText(bankDetails.accountHolderName)
  } : null;

  // Validate and sanitize base64 images
  const safeLogo = logoBase64 && logoBase64.startsWith('data:image/') ? logoBase64 : '';
  const safeSignature = signatureBase64 && signatureBase64.startsWith('data:image/') ? signatureBase64 : '';

  // Create secure HTML template with CSP-compliant inline styles
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invoice ${safeInvoice.invoice_number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: Arial, sans-serif; line-height: 1.4; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
        .logo { max-width: 150px; max-height: 80px; }
        .company-info { text-align: right; }
        .invoice-title { font-size: 28px; font-weight: bold; color: #2563eb; margin-bottom: 10px; }
        .invoice-details { display: flex; justify-content: space-between; margin-bottom: 30px; }
        .client-info, .invoice-meta { width: 48%; }
        .section-title { font-weight: bold; font-size: 14px; color: #666; margin-bottom: 10px; text-transform: uppercase; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        .table th, .table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .table th { background-color: #f8f9fa; font-weight: bold; }
        .table .amount { text-align: right; }
        .totals { width: 300px; margin-left: auto; }
        .total-row { display: flex; justify-content: space-between; padding: 8px 0; }
        .total-row.final { font-weight: bold; font-size: 16px; border-top: 2px solid #000; padding-top: 12px; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; }
        .bank-details { margin-bottom: 20px; }
        .signature { text-align: right; margin-top: 40px; }
        .signature img { max-width: 150px; max-height: 60px; }
        @media print { body { font-size: 12px; } .container { padding: 0; } }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div>
            ${safeLogo ? `<img src="${safeLogo}" alt="Company Logo" class="logo">` : ''}
          </div>
          <div class="company-info">
            <h1>${safeBusiness?.businessName || 'Your Business'}</h1>
            <p>${safeBusiness?.address || ''}</p>
            <p>${safeBusiness?.city || ''}, ${safeBusiness?.state || ''} ${safeBusiness?.pincode || ''}</p>
            <p>Email: ${safeBusiness?.email || ''}</p>
            <p>Phone: ${safeBusiness?.phone || ''}</p>
            ${safeBusiness?.gstNumber ? `<p>GST: ${safeBusiness.gstNumber}</p>` : ''}
          </div>
        </div>

        <div class="invoice-title">INVOICE</div>

        <div class="invoice-details">
          <div class="client-info">
            <div class="section-title">Bill To:</div>
            <p><strong>${safeInvoice.client_name}</strong></p>
            ${safeInvoice.client_address ? `<p>${safeInvoice.client_address}</p>` : ''}
            ${safeInvoice.client_email ? `<p>Email: ${safeInvoice.client_email}</p>` : ''}
            ${safeInvoice.client_gst_number ? `<p>GST: ${safeInvoice.client_gst_number}</p>` : ''}
          </div>
          <div class="invoice-meta">
            <div class="section-title">Invoice Details:</div>
            <p><strong>Invoice #:</strong> ${safeInvoice.invoice_number}</p>
            <p><strong>Date:</strong> ${new Date(safeInvoice.invoice_date).toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> ${new Date(safeInvoice.due_date).toLocaleDateString()}</p>
            <p><strong>Status:</strong> ${safeInvoice.status.toUpperCase()}</p>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Rate</th>
              <th class="amount">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${safeInvoice.items.map(item => `
              <tr>
                <td>${item.description}</td>
                <td>${item.quantity}</td>
                <td>₹${parseFloat(item.rate).toLocaleString()}</td>
                <td class="amount">₹${parseFloat(item.amount).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>₹${parseFloat(safeInvoice.amount).toLocaleString()}</span>
          </div>
          <div class="total-row">
            <span>GST:</span>
            <span>₹${parseFloat(safeInvoice.gst_amount).toLocaleString()}</span>
          </div>
          <div class="total-row final">
            <span>Total:</span>
            <span>₹${parseFloat(safeInvoice.total_amount).toLocaleString()}</span>
          </div>
        </div>

        ${safeInvoice.notes ? `
          <div style="margin-top: 30px;">
            <div class="section-title">Notes:</div>
            <p>${safeInvoice.notes}</p>
          </div>
        ` : ''}

        <div class="footer">
          ${safeBankDetails ? `
            <div class="bank-details">
              <div class="section-title">Bank Details:</div>
              <p><strong>Account Name:</strong> ${safeBankDetails.accountHolderName}</p>
              <p><strong>Account Number:</strong> ${safeBankDetails.accountNumber}</p>
              <p><strong>IFSC Code:</strong> ${safeBankDetails.ifscCode}</p>
              <p><strong>Bank:</strong> ${safeBankDetails.bankName}</p>
              ${safeBankDetails.branchName ? `<p><strong>Branch:</strong> ${safeBankDetails.branchName}</p>` : ''}
            </div>
          ` : ''}

          <div class="signature">
            <p>Authorized Signature</p>
            ${safeSignature ? `<img src="${safeSignature}" alt="Signature">` : ''}
            <p>${safeBusiness?.ownerName || ''}</p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const securePrintInvoice = (htmlContent: string): void => {
  // Create a new window for printing instead of modifying the main document
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print the invoice');
    return;
  }

  // Write content safely
  printWindow.document.write(htmlContent);
  printWindow.document.close();

  // Set up print and cleanup
  printWindow.onload = () => {
    printWindow.print();
    printWindow.onafterprint = () => {
      printWindow.close();
    };
  };

  // Fallback cleanup
  setTimeout(() => {
    if (!printWindow.closed) {
      printWindow.close();
    }
  }, 10000);
};

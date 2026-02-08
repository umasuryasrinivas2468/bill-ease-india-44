import { toWords } from 'number-to-words';

interface InvoiceItem {
  description: string;
  hsn_sac?: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface InvoiceData {
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  client_name: string;
  client_email?: string;
  client_address?: string;
  client_gst_number?: string;
  amount: number;
  gst_amount: number;
  gst_rate?: number;
  total_amount: number;
  discount?: number;
  advance?: number;
  roundoff?: number;
  items: InvoiceItem[];
  notes?: string;
  status: string;
}

interface BusinessInfo {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gstNumber?: string;
}

interface BankDetails {
  accountHolderName: string;
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
}

type TemplateType = 'standard' | 'professional' | 'detailed';

export const generateProfessionalInvoicePDF = (
  invoice: InvoiceData,
  businessInfo: BusinessInfo | null,
  bankDetails: BankDetails | null,
  logoUrl: string | null,
  signatureUrl: string | null,
  template: TemplateType = 'professional'
) => {
  const totalInWords = toWords(Math.floor(Number(invoice.total_amount)));
  const totalAmountInWords = `${totalInWords.charAt(0).toUpperCase() + totalInWords.slice(1)} Rupees Only`;

  // Calculate GST split (assuming intra-state)
  const gstRate = invoice.gst_rate || 18;
  const sgstRate = gstRate / 2;
  const cgstRate = gstRate / 2;

  const getTemplateStyles = () => {
    switch (template) {
      case 'detailed':
        return {
          headerBg: '#1a365d',
          headerText: '#ffffff',
          accentColor: '#2b6cb0',
          tableBorder: '#2b6cb0',
        };
      case 'professional':
        return {
          headerBg: '#1f2937',
          headerText: '#ffffff',
          accentColor: '#374151',
          tableBorder: '#374151',
        };
      default:
        return {
          headerBg: '#f3f4f6',
          headerText: '#1f2937',
          accentColor: '#6b7280',
          tableBorder: '#e5e7eb',
        };
    }
  };

  const styles = getTemplateStyles();

  const generateDetailedTable = () => {
    return `
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 5%;">S.N</th>
            <th style="width: 30%;">Description of Goods</th>
            <th style="width: 10%;">HSN Code</th>
            <th style="width: 8%;">QTY</th>
            <th style="width: 10%;">Unit Rate</th>
            <th style="width: 12%;">Taxable Amount</th>
            <th colspan="3" style="width: 15%;">GST</th>
            <th style="width: 10%;">Total</th>
          </tr>
          <tr class="sub-header">
            <th colspan="6"></th>
            <th>Rate</th>
            <th>SGST</th>
            <th>CGST</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${invoice.items.map((item, idx) => {
            const taxableAmount = item.quantity * item.rate;
            const itemGstRate = gstRate;
            const sgst = taxableAmount * (sgstRate / 100);
            const cgst = taxableAmount * (cgstRate / 100);
            const total = taxableAmount + sgst + cgst;
            return `
              <tr>
                <td class="text-center">${String(idx + 1).padStart(2, '0')}</td>
                <td>${item.description || ''}</td>
                <td class="text-center">${item.hsn_sac || ''}</td>
                <td class="text-center">${item.quantity}</td>
                <td class="text-right">${Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${taxableAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-center">${itemGstRate}%</td>
                <td class="text-right">${sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                <td class="text-right font-bold">${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
              </tr>
            `;
          }).join('')}
          <tr class="empty-row"><td colspan="10" style="height: 60px;"></td></tr>
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="5" class="text-right"><strong>Total</strong></td>
            <td class="text-right"><strong>${Number(invoice.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            <td></td>
            <td class="text-right"><strong>${(invoice.gst_amount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            <td class="text-right"><strong>${(invoice.gst_amount / 2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
            <td class="text-right"><strong>${Number(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Tax Invoice - ${invoice.invoice_number}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Arial', sans-serif; 
            font-size: 11px;
            color: #333;
            line-height: 1.4;
            padding: 15px;
          }
          .invoice-container {
            border: 2px solid ${styles.tableBorder};
            max-width: 800px;
            margin: 0 auto;
          }
          .header-row {
            display: flex;
            border-bottom: 1px solid ${styles.tableBorder};
          }
          .header-left {
            width: 30%;
            padding: 10px;
            border-right: 1px solid ${styles.tableBorder};
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header-center {
            width: 70%;
            padding: 10px;
          }
          .invoice-title {
            text-align: center;
            font-size: 16px;
            font-weight: bold;
            padding: 5px;
            border-bottom: 1px solid ${styles.tableBorder};
            background: ${styles.headerBg};
            color: ${styles.headerText};
          }
          .company-name {
            font-size: 18px;
            font-weight: bold;
            color: #1a365d;
            text-align: center;
          }
          .company-details {
            font-size: 10px;
            text-align: center;
            color: #666;
            margin-top: 5px;
          }
          .gst-number {
            font-weight: bold;
            margin-top: 5px;
            text-align: center;
          }
          .info-row {
            display: flex;
            border-bottom: 1px solid ${styles.tableBorder};
          }
          .info-cell {
            padding: 8px;
            border-right: 1px solid ${styles.tableBorder};
          }
          .info-cell:last-child {
            border-right: none;
          }
          .label {
            font-weight: bold;
            font-size: 10px;
            color: #666;
            margin-bottom: 2px;
          }
          .value {
            font-size: 11px;
          }
          .party-section {
            display: flex;
            border-bottom: 1px solid ${styles.tableBorder};
          }
          .party-box {
            width: 50%;
            padding: 10px;
          }
          .party-box:first-child {
            border-right: 1px solid ${styles.tableBorder};
          }
          .party-title {
            font-weight: bold;
            font-size: 10px;
            background: #f5f5f5;
            padding: 3px 5px;
            margin-bottom: 5px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
          }
          .items-table th {
            background: #f5f5f5;
            padding: 6px 4px;
            font-size: 10px;
            font-weight: bold;
            text-align: center;
            border: 1px solid ${styles.tableBorder};
          }
          .items-table .sub-header th {
            background: #fafafa;
            font-size: 9px;
            padding: 4px;
          }
          .items-table td {
            padding: 6px 4px;
            border: 1px solid ${styles.tableBorder};
            font-size: 10px;
            vertical-align: top;
          }
          .items-table .empty-row td {
            border-left: 1px solid ${styles.tableBorder};
            border-right: 1px solid ${styles.tableBorder};
          }
          .items-table .total-row {
            background: #f9f9f9;
          }
          .items-table .total-row td {
            font-weight: bold;
            padding: 8px 4px;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .font-bold { font-weight: bold; }
          .footer-section {
            display: flex;
            border-top: 1px solid ${styles.tableBorder};
          }
          .footer-left {
            width: 60%;
            border-right: 1px solid ${styles.tableBorder};
          }
          .footer-right {
            width: 40%;
            padding: 10px;
            text-align: right;
          }
          .transport-row {
            padding: 8px;
            border-bottom: 1px solid ${styles.tableBorder};
            text-align: right;
          }
          .grand-total-row {
            padding: 10px;
            text-align: right;
            font-size: 14px;
            font-weight: bold;
            border-top: 1px solid ${styles.tableBorder};
          }
          .signature-section {
            display: flex;
            border-top: 1px solid ${styles.tableBorder};
          }
          .signature-left {
            width: 50%;
            padding: 15px;
            border-right: 1px solid ${styles.tableBorder};
          }
          .signature-right {
            width: 50%;
            padding: 15px;
            text-align: right;
          }
          .signature-label {
            font-size: 10px;
            color: #666;
            margin-top: 30px;
          }
          .company-sig {
            font-weight: bold;
            margin-bottom: 40px;
          }
          .amount-words {
            padding: 8px;
            background: #f9f9f9;
            font-style: italic;
            border-bottom: 1px solid ${styles.tableBorder};
          }
          .logo-img {
            max-width: 100px;
            max-height: 60px;
            object-fit: contain;
          }
          .signature-img {
            max-width: 80px;
            max-height: 40px;
            object-fit: contain;
          }
          @media print {
            body { padding: 0; }
            .invoice-container { border: 1px solid #000; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <!-- Header -->
          <div class="invoice-title">TAX INVOICE – ${invoice.invoice_number}</div>
          
          <div class="header-row">
            <div class="header-left">
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="logo-img" />` : '<div style="width:80px;height:50px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:10px;">LOGO</div>'}
            </div>
            <div class="header-center">
              <div class="company-name">${businessInfo?.businessName || 'Your Business Name'}</div>
              <div class="company-details">
                ${businessInfo?.address ? `${businessInfo.address}<br>` : ''}
                ${businessInfo?.city ? `${businessInfo.city}, ` : ''}${businessInfo?.state || ''}${businessInfo?.pincode ? ` - ${businessInfo.pincode}` : ''}<br>
                ${businessInfo?.phone ? `Contact: ${businessInfo.phone}` : ''}${businessInfo?.email ? ` | Email: ${businessInfo.email}` : ''}
              </div>
              ${businessInfo?.gstNumber ? `<div class="gst-number">OUR GST: ${businessInfo.gstNumber}</div>` : ''}
            </div>
          </div>

          <!-- Invoice Info -->
          <div class="info-row">
            <div class="info-cell" style="width: 50%;">
              <div class="label">Invoice Number:</div>
              <div class="value font-bold">${invoice.invoice_number}</div>
            </div>
            <div class="info-cell" style="width: 50%;">
              <div class="label">DATE:</div>
              <div class="value">${new Date(invoice.invoice_date).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          <!-- Party Details -->
          <div class="party-section">
            <div class="party-box">
              <div class="party-title">Details Of Receiver (Billed To)</div>
              <div class="value">
                <strong>Name:</strong><br>
                ${invoice.client_name}<br>
                ${invoice.client_address ? `<strong>Address:</strong> ${invoice.client_address}<br>` : ''}
                ${invoice.client_gst_number ? `<strong>GST:</strong> ${invoice.client_gst_number}` : ''}
              </div>
            </div>
            <div class="party-box">
              <div class="party-title">Details Of Consignee (Shipped To)</div>
              <div class="value">
                ${invoice.client_name}<br>
                ${invoice.client_address || 'Same as billing address'}
              </div>
            </div>
          </div>

          <!-- Items Table -->
          ${template === 'detailed' || template === 'professional' ? generateDetailedTable() : `
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 5%;">S.N</th>
                  <th style="width: 45%;">Description</th>
                  <th style="width: 15%;">Qty</th>
                  <th style="width: 15%;">Rate</th>
                  <th style="width: 20%;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map((item, idx) => `
                  <tr>
                    <td class="text-center">${idx + 1}</td>
                    <td>${item.description}</td>
                    <td class="text-center">${item.quantity}</td>
                    <td class="text-right">₹${Number(item.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                    <td class="text-right">₹${Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  </tr>
                `).join('')}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td colspan="4" class="text-right"><strong>Total</strong></td>
                  <td class="text-right"><strong>₹${Number(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></td>
                </tr>
              </tfoot>
            </table>
          `}

          <!-- Amount in Words -->
          <div class="amount-words">
            <strong>Amount in Words:</strong> ${totalAmountInWords}
          </div>

          <!-- Transport & Grand Total -->
          <div class="transport-row">
            Transport: _______________
          </div>
          <div class="grand-total-row">
            Grand Total: ₹${Number(invoice.total_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>

          <!-- Bank Details if available -->
          ${bankDetails ? `
            <div style="padding: 10px; border-top: 1px solid ${styles.tableBorder}; background: #f9f9f9;">
              <strong>Bank Details:</strong> ${bankDetails.bankName} | A/c: ${bankDetails.accountNumber} | IFSC: ${bankDetails.ifscCode}
            </div>
          ` : ''}

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="signature-left">
              <div style="margin-bottom: 10px;">Material received in good condition</div>
              <div class="signature-label">Signature</div>
            </div>
            <div class="signature-right">
              <div class="company-sig">For ${businessInfo?.businessName || 'Your Business'}</div>
              ${signatureUrl ? `<img src="${signatureUrl}" alt="Signature" class="signature-img" />` : ''}
              <div class="signature-label">Authorized Signatory</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  return htmlContent;
};

export const downloadProfessionalInvoice = (
  invoice: InvoiceData,
  businessInfo: BusinessInfo | null,
  bankDetails: BankDetails | null,
  logoUrl: string | null,
  signatureUrl: string | null,
  template: TemplateType = 'professional'
) => {
  const htmlContent = generateProfessionalInvoicePDF(
    invoice,
    businessInfo,
    bankDetails,
    logoUrl,
    signatureUrl,
    template
  );

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  }
};

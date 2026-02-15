import jsPDF from 'jspdf';
import { format } from 'date-fns';

interface TDSTransaction {
  id: string;
  transaction_date: string;
  vendor_name: string;
  vendor_pan?: string;
  transaction_amount: number;
  tds_rate: number;
  tds_amount: number;
  net_payable: number;
  certificate_number?: string;
  description?: string;
  tds_rules?: {
    category: string;
  };
}

interface DeductorInfo {
  businessName?: string;
  ownerName?: string;
  address?: string;
  pan?: string;
  tan?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

const getQuarter = (date: Date): { quarter: number; year: string } => {
  const month = date.getMonth();
  const year = date.getFullYear();
  let quarter: number;
  let assessmentYear: string;

  if (month >= 0 && month <= 2) {
    quarter = 4;
    assessmentYear = `${year}-${(year + 1).toString().slice(-2)}`;
  } else if (month >= 3 && month <= 5) {
    quarter = 1;
    assessmentYear = `${year + 1}-${(year + 2).toString().slice(-2)}`;
  } else if (month >= 6 && month <= 8) {
    quarter = 2;
    assessmentYear = `${year + 1}-${(year + 2).toString().slice(-2)}`;
  } else {
    quarter = 3;
    assessmentYear = `${year + 1}-${(year + 2).toString().slice(-2)}`;
  }

  return { quarter, year: assessmentYear };
};

export const generateForm16APDF = (
  transaction: TDSTransaction,
  deductorInfo: DeductorInfo
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const transactionDate = new Date(transaction.transaction_date);
  const { quarter, year } = getQuarter(transactionDate);
  
  // Certificate number generation
  const certNumber = transaction.certificate_number || 
    `TDS${format(transactionDate, 'yyyyMMdd')}${transaction.id.slice(0, 6).toUpperCase()}`;

  // Header
  doc.setFillColor(24, 54, 100);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('FORM NO. 16A', pageWidth / 2, 12, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('[See rule 31(1)(b)]', pageWidth / 2, 18, { align: 'center' });
  doc.text('Certificate under section 203 of the Income-tax Act, 1961 for', pageWidth / 2, 24, { align: 'center' });
  doc.text('tax deducted at source on payments other than salary', pageWidth / 2, 30, { align: 'center' });

  let yPos = 45;

  // Certificate Details Box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, yPos, pageWidth - 28, 25, 2, 2, 'FD');
  
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Certificate No:', 20, yPos + 10);
  doc.text('Assessment Year:', pageWidth / 2 + 10, yPos + 10);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(59, 130, 246);
  doc.text(certNumber, 58, yPos + 10);
  doc.text(year, pageWidth / 2 + 55, yPos + 10);
  
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'bold');
  doc.text('Period:', 20, yPos + 18);
  doc.text('Quarter:', pageWidth / 2 + 10, yPos + 18);
  
  doc.setFont('helvetica', 'normal');
  doc.text(format(transactionDate, 'MMM yyyy'), 45, yPos + 18);
  doc.text(`Q${quarter}`, pageWidth / 2 + 35, yPos + 18);

  yPos += 35;

  // Deductor Details Section
  doc.setFillColor(59, 130, 246);
  doc.rect(14, yPos, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILS OF DEDUCTOR', 20, yPos + 5.5);

  yPos += 12;
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, yPos, pageWidth - 28, 40, 2, 2, 'FD');

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const labelX = 20;
  const valueX = 65;
  
  doc.text('Name:', labelX, yPos + 10);
  doc.text('PAN:', labelX, yPos + 18);
  doc.text('TAN:', labelX, yPos + 26);
  doc.text('Address:', labelX, yPos + 34);

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(deductorInfo.businessName || 'N/A', valueX, yPos + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(deductorInfo.pan || 'N/A', valueX, yPos + 18);
  doc.text(deductorInfo.tan || 'N/A', valueX, yPos + 26);
  
  const address = [
    deductorInfo.address,
    deductorInfo.city,
    deductorInfo.state,
    deductorInfo.pincode
  ].filter(Boolean).join(', ') || 'N/A';
  
  doc.text(address.substring(0, 70), valueX, yPos + 34);

  yPos += 48;

  // Deductee Details Section
  doc.setFillColor(34, 197, 94);
  doc.rect(14, yPos, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILS OF DEDUCTEE (VENDOR)', 20, yPos + 5.5);

  yPos += 12;
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, yPos, pageWidth - 28, 25, 2, 2, 'FD');

  doc.setTextColor(107, 114, 128);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  doc.text('Name:', labelX, yPos + 10);
  doc.text('PAN:', labelX, yPos + 18);

  doc.setTextColor(31, 41, 55);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(transaction.vendor_name, valueX, yPos + 10);
  doc.setFont('helvetica', 'normal');
  doc.text(transaction.vendor_pan || 'N/A', valueX, yPos + 18);

  yPos += 33;

  // Transaction Details Section
  doc.setFillColor(168, 85, 247);
  doc.rect(14, yPos, pageWidth - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DETAILS OF TDS DEDUCTION', 20, yPos + 5.5);

  yPos += 12;

  // Transaction table
  const tableHeaders = ['S.No', 'Section', 'Date of Payment', 'Amount Paid', 'TDS Rate', 'TDS Deducted'];
  const colWidths = [15, 35, 40, 35, 25, 35];
  
  // Header row
  doc.setFillColor(243, 244, 246);
  doc.roundedRect(14, yPos, pageWidth - 28, 10, 2, 2, 'F');
  doc.setTextColor(55, 65, 81);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  
  let xPos = 16;
  tableHeaders.forEach((header, idx) => {
    doc.text(header, xPos, yPos + 6.5);
    xPos += colWidths[idx];
  });

  yPos += 12;

  // Data row
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, yPos, pageWidth - 28, 10, 2, 2, 'FD');
  doc.setTextColor(31, 41, 55);
  doc.setFont('helvetica', 'normal');
  
  const category = transaction.tds_rules?.category || '194C';
  const rowData = [
    '1',
    category,
    format(transactionDate, 'dd/MM/yyyy'),
    `₹${transaction.transaction_amount.toLocaleString()}`,
    `${transaction.tds_rate}%`,
    `₹${transaction.tds_amount.toLocaleString()}`
  ];
  
  xPos = 16;
  rowData.forEach((data, idx) => {
    doc.text(data, xPos, yPos + 6.5);
    xPos += colWidths[idx];
  });

  yPos += 18;

  // Summary Box
  doc.setFillColor(254, 243, 199);
  doc.setDrawColor(251, 191, 36);
  doc.roundedRect(14, yPos, pageWidth - 28, 30, 2, 2, 'FD');
  
  doc.setTextColor(146, 64, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY', 20, yPos + 8);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Total Amount Paid/Credited:', 20, yPos + 16);
  doc.text('Total TDS Deducted:', 20, yPos + 22);
  doc.text('Net Amount Payable:', 20, yPos + 28);
  
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 41, 55);
  doc.text(`₹${transaction.transaction_amount.toLocaleString()}`, 80, yPos + 16);
  doc.setTextColor(220, 38, 38);
  doc.text(`₹${transaction.tds_amount.toLocaleString()}`, 80, yPos + 22);
  doc.setTextColor(22, 163, 74);
  doc.text(`₹${transaction.net_payable.toLocaleString()}`, 80, yPos + 28);

  yPos += 40;

  // Declaration
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  
  const declaration = `I, ${deductorInfo.ownerName || 'the authorized signatory'}, hereby certify that a sum of ₹${transaction.tds_amount.toLocaleString()} (Rupees ${numberToWords(transaction.tds_amount)} only) has been deducted at source and paid to the credit of the Central Government.`;
  
  const splitDeclaration = doc.splitTextToSize(declaration, pageWidth - 40);
  doc.text(splitDeclaration, 20, yPos);

  yPos += splitDeclaration.length * 5 + 15;

  // Signature Section
  doc.setDrawColor(200, 200, 200);
  doc.line(pageWidth - 80, yPos, pageWidth - 20, yPos);
  doc.setFontSize(8);
  doc.text('Signature of Deductor', pageWidth - 80, yPos + 5);
  doc.setFont('helvetica', 'bold');
  doc.text(deductorInfo.businessName || '', pageWidth - 80, yPos + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${format(new Date(), 'dd/MM/yyyy')}`, pageWidth - 80, yPos + 19);
  doc.text(`Place: ${deductorInfo.city || ''}`, pageWidth - 80, yPos + 26);

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setFillColor(243, 244, 246);
  doc.rect(0, footerY - 5, pageWidth, 20, 'F');
  
  doc.setTextColor(107, 114, 128);
  doc.setFontSize(7);
  doc.text('This is a computer generated Form 16A certificate.', pageWidth / 2, footerY, { align: 'center' });
  doc.text(`Generated on: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, pageWidth / 2, footerY + 5, { align: 'center' });

  return doc;
};

export const downloadForm16APDF = (
  transaction: TDSTransaction,
  deductorInfo: DeductorInfo
) => {
  const doc = generateForm16APDF(transaction, deductorInfo);
  const vendorName = transaction.vendor_name.replace(/[^a-zA-Z0-9]/g, '_');
  const dateStr = format(new Date(transaction.transaction_date), 'yyyyMMdd');
  doc.save(`Form16A_${vendorName}_${dateStr}.pdf`);
};

// Helper function to convert number to words
function numberToWords(num: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  if (num === 0) return 'Zero';

  const convertLessThanThousand = (n: number): string => {
    if (n < 20) return ones[n];
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convertLessThanThousand(n % 100) : '');
  };

  const numInt = Math.floor(num);
  
  if (numInt >= 10000000) {
    return convertLessThanThousand(Math.floor(numInt / 10000000)) + ' Crore ' + numberToWords(numInt % 10000000);
  }
  if (numInt >= 100000) {
    return convertLessThanThousand(Math.floor(numInt / 100000)) + ' Lakh ' + numberToWords(numInt % 100000);
  }
  if (numInt >= 1000) {
    return convertLessThanThousand(Math.floor(numInt / 1000)) + ' Thousand ' + numberToWords(numInt % 1000);
  }
  
  return convertLessThanThousand(numInt);
}

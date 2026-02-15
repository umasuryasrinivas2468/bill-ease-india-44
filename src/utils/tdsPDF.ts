import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
  tds_rules?: {
    category: string;
  };
}

interface TDSSummary {
  totalTransactionAmount: number;
  totalTDSDeducted: number;
  totalNetPayable: number;
  transactionCount: number;
  categoryBreakdown: Array<{
    category: string;
    totalAmount: number;
    totalTDS: number;
    transactionCount: number;
  }>;
}

interface BusinessInfo {
  businessName?: string;
  ownerName?: string;
  address?: string;
  gstNumber?: string;
  pan?: string;
}

export const generateTDSReportPDF = (
  transactions: TDSTransaction[],
  summary: TDSSummary,
  period: string,
  businessInfo?: BusinessInfo | null
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header with gradient effect
  doc.setFillColor(59, 130, 246);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Title
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('TDS Report', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Period: ${period}`, pageWidth / 2, 30, { align: 'center' });
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}`, pageWidth / 2, 38, { align: 'center' });
  
  let yPosition = 55;
  
  // Business Info
  if (businessInfo?.businessName) {
    doc.setTextColor(31, 41, 55);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(businessInfo.businessName, 14, yPosition);
    yPosition += 7;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    if (businessInfo.address) {
      doc.text(businessInfo.address, 14, yPosition);
      yPosition += 5;
    }
    if (businessInfo.gstNumber) {
      doc.text(`GSTIN: ${businessInfo.gstNumber}`, 14, yPosition);
      yPosition += 5;
    }
    if (businessInfo.pan) {
      doc.text(`PAN: ${businessInfo.pan}`, 14, yPosition);
      yPosition += 5;
    }
    yPosition += 5;
  }
  
  // Summary Cards
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, yPosition, pageWidth - 28, 35, 3, 3, 'F');
  
  const summaryData = [
    { label: 'Total Transactions', value: summary.transactionCount.toString() },
    { label: 'Total Amount', value: `₹${summary.totalTransactionAmount.toLocaleString()}` },
    { label: 'TDS Deducted', value: `₹${summary.totalTDSDeducted.toLocaleString()}` },
    { label: 'Net Payable', value: `₹${summary.totalNetPayable.toLocaleString()}` },
  ];
  
  const cardWidth = (pageWidth - 28) / 4;
  summaryData.forEach((item, index) => {
    const x = 14 + (cardWidth * index) + (cardWidth / 2);
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text(item.label, x, yPosition + 12, { align: 'center' });
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 41, 55);
    doc.text(item.value, x, yPosition + 24, { align: 'center' });
  });
  
  yPosition += 45;
  
  // Category Breakdown
  if (summary.categoryBreakdown && summary.categoryBreakdown.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 41, 55);
    doc.text('TDS by Category', 14, yPosition);
    yPosition += 8;
    
    autoTable(doc, {
      startY: yPosition,
      head: [['Category', 'Transaction Count', 'Total Amount', 'TDS Deducted']],
      body: summary.categoryBreakdown.map(cat => [
        cat.category,
        cat.transactionCount.toString(),
        `₹${cat.totalAmount.toLocaleString()}`,
        `₹${cat.totalTDS.toLocaleString()}`,
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14 },
    });
    
    yPosition = (doc as any).lastAutoTable.finalY + 15;
  }
  
  // Transactions Table
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(31, 41, 55);
  doc.text('Transaction Details', 14, yPosition);
  yPosition += 8;
  
  if (transactions.length === 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text('No TDS transactions found for this period.', 14, yPosition);
  } else {
    autoTable(doc, {
      startY: yPosition,
      head: [['Date', 'Vendor', 'PAN', 'Amount', 'Rate', 'TDS', 'Net Payable', 'Category']],
      body: transactions.map(t => [
        format(new Date(t.transaction_date), 'dd/MM/yyyy'),
        t.vendor_name.substring(0, 15),
        t.vendor_pan || '-',
        `₹${t.transaction_amount.toLocaleString()}`,
        `${t.tds_rate}%`,
        `₹${t.tds_amount.toLocaleString()}`,
        `₹${t.net_payable.toLocaleString()}`,
        t.tds_rules?.category || 'Other',
      ]),
      theme: 'striped',
      headStyles: {
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
      },
      bodyStyles: {
        fontSize: 8,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 14, right: 14 },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 28 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 15 },
        5: { cellWidth: 22 },
        6: { cellWidth: 25 },
        7: { cellWidth: 20 },
      },
    });
  }
  
  // Footer
  const pageCount = doc.internal.pages.length - 1;
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(156, 163, 175);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      'This is a computer-generated document.',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }
  
  return doc;
};

export const downloadTDSReportPDF = (
  transactions: TDSTransaction[],
  summary: TDSSummary,
  period: string,
  businessInfo?: BusinessInfo | null
) => {
  const doc = generateTDSReportPDF(transactions, summary, period, businessInfo);
  doc.save(`TDS_Report_${period.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
};

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DeliveryChallan } from '@/hooks/useDeliveryChallans';

export const generateDeliveryChallanPDF = async (
  challan: DeliveryChallan,
  businessData?: any
) => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('DELIVERY CHALLAN', pageWidth / 2, 20, { align: 'center' });
  
  // Business Details (if available)
  let yPos = 35;
  if (businessData) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(businessData.businessName || 'Your Business', 14, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (businessData.address) {
      doc.text(businessData.address, 14, yPos);
      yPos += 5;
    }
    if (businessData.gstNumber) {
      doc.text(`GST: ${businessData.gstNumber}`, 14, yPos);
      yPos += 5;
    }
    if (businessData.phone) {
      doc.text(`Phone: ${businessData.phone}`, 14, yPos);
      yPos += 5;
    }
    if (businessData.email) {
      doc.text(`Email: ${businessData.email}`, 14, yPos);
      yPos += 8;
    }
  }
  
  // Challan Details
  yPos += 5;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Challan No: ${challan.challan_number}`, 14, yPos);
  doc.text(`Date: ${new Date(challan.challan_date).toLocaleDateString('en-IN')}`, pageWidth - 14, yPos, { align: 'right' });
  
  yPos += 10;
  
  // Customer Details Box
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(14, yPos, pageWidth - 28, 35);
  
  yPos += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Delivery To:', 16, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  doc.text(challan.customer_name, 16, yPos);
  yPos += 5;
  
  if (challan.customer_address) {
    const addressLines = doc.splitTextToSize(challan.customer_address, pageWidth - 35);
    doc.text(addressLines, 16, yPos);
    yPos += addressLines.length * 5;
  }
  
  if (challan.customer_phone) {
    doc.text(`Phone: ${challan.customer_phone}`, 16, yPos);
    yPos += 5;
  }
  
  if (challan.customer_gst_number) {
    doc.text(`GST: ${challan.customer_gst_number}`, 16, yPos);
  }
  
  yPos += 15;
  
  // Items Table
  const tableData = challan.items.map((item, index) => [
    (index + 1).toString(),
    item.product_name,
    item.description || '-',
    item.quantity.toString(),
    item.unit || 'pcs',
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Product Name', 'Description', 'Quantity', 'Unit']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [66, 66, 66],
      textColor: 255,
      fontStyle: 'bold',
    },
    styles: {
      fontSize: 10,
      cellPadding: 4,
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 60 },
      2: { cellWidth: 60 },
      3: { cellWidth: 25 },
      4: { cellWidth: 20 },
    },
  });
  
  // Status and Notes
  const finalY = (doc as any).lastAutoTable.finalY + 10;
  
  doc.setFont('helvetica', 'bold');
  doc.text(`Delivery Status: `, 14, finalY);
  doc.setFont('helvetica', 'normal');
  doc.text(challan.delivery_status.toUpperCase(), 50, finalY);
  
  if (challan.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 14, finalY + 10);
    doc.setFont('helvetica', 'normal');
    const notesLines = doc.splitTextToSize(challan.notes, pageWidth - 28);
    doc.text(notesLines, 14, finalY + 16);
  }
  
  // Footer - Signature
  const footerY = doc.internal.pageSize.getHeight() - 40;
  doc.setLineWidth(0.5);
  doc.line(14, footerY, 80, footerY);
  doc.line(pageWidth - 80, footerY, pageWidth - 14, footerY);
  
  doc.setFontSize(9);
  doc.text("Prepared By", 14, footerY + 5);
  doc.text("Received By", pageWidth - 80, footerY + 5);
  
  return doc;
};

export const downloadDeliveryChallanPDF = async (
  challan: DeliveryChallan,
  businessData?: any
) => {
  const doc = await generateDeliveryChallanPDF(challan, businessData);
  doc.save(`Delivery-Challan-${challan.challan_number}.pdf`);
};

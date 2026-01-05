import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface OrderItem {
  id: string;
  product_name: string;
  sku?: string;
  quantity: number;
  price: number;
  tax_rate: number;
  total: number;
}

interface OrderData {
  order_number: string;
  order_date: string;
  due_date: string;
  status: string;
  payment_status: string;
  items: OrderItem[];
  subtotal?: number;
  tax_amount?: number;
  total_amount: number;
  notes?: string;
  // For Sales Order
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  client_address?: string;
  // For Purchase Order
  vendor_name?: string;
  vendor_email?: string;
  vendor_phone?: string;
  vendor_address?: string;
}

interface BusinessInfo {
  business_name: string;
  owner_name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gst_number?: string;
}

interface BrandingInfo {
  logo_url?: string;
  signature_url?: string;
}

const loadImage = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!url) {
      reject(new Error('No URL provided'));
      return;
    }

    if (url.startsWith('data:')) {
      resolve(url);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
};

export const generateOrderPDF = async (
  order: OrderData,
  businessInfo: BusinessInfo,
  branding: BrandingInfo,
  orderType: 'sales' | 'purchase'
): Promise<jsPDF> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Colors
  const primaryColor: [number, number, number] = [41, 128, 185];
  const textColor: [number, number, number] = [44, 62, 80];
  const lightGray: [number, number, number] = [236, 240, 241];

  // Try to add logo
  try {
    if (branding.logo_url) {
      const logoData = await loadImage(branding.logo_url);
      doc.addImage(logoData, 'PNG', 15, y, 40, 20);
      y += 25;
    }
  } catch (e) {
    console.log('Could not load logo', e);
  }

  // Header with order type
  const title = orderType === 'sales' ? 'SALES ORDER' : 'PURCHASE ORDER';
  doc.setFontSize(24);
  doc.setTextColor(...primaryColor);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth - 15, 30, { align: 'right' });

  // Order number
  doc.setFontSize(12);
  doc.setTextColor(...textColor);
  doc.setFont('helvetica', 'normal');
  doc.text(`${order.order_number}`, pageWidth - 15, 40, { align: 'right' });

  // Company Info (Left)
  y = Math.max(y, 50);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text(businessInfo.business_name || 'Business Name', 15, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...textColor);
  y += 7;
  if (businessInfo.address) {
    doc.text(businessInfo.address, 15, y);
    y += 5;
  }
  const cityStatePin = [businessInfo.city, businessInfo.state, businessInfo.pincode]
    .filter(Boolean)
    .join(', ');
  if (cityStatePin) {
    doc.text(cityStatePin, 15, y);
    y += 5;
  }
  if (businessInfo.phone) {
    doc.text(`Phone: ${businessInfo.phone}`, 15, y);
    y += 5;
  }
  if (businessInfo.email) {
    doc.text(`Email: ${businessInfo.email}`, 15, y);
    y += 5;
  }
  if (businessInfo.gst_number) {
    doc.text(`GSTIN: ${businessInfo.gst_number}`, 15, y);
    y += 5;
  }

  // Order Details (Right side)
  const detailsX = pageWidth / 2 + 10;
  let detailsY = 50;

  doc.setFillColor(...lightGray);
  doc.roundedRect(detailsX - 5, detailsY - 5, pageWidth / 2 - 20, 35, 2, 2, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Order Date:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(order.order_date).toLocaleDateString('en-IN'), detailsX + 35, detailsY);

  detailsY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Due Date:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(order.due_date).toLocaleDateString('en-IN'), detailsX + 35, detailsY);

  detailsY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Status:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.text(order.status.toUpperCase(), detailsX + 35, detailsY);

  detailsY += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Payment:', detailsX, detailsY);
  doc.setFont('helvetica', 'normal');
  doc.text(order.payment_status.toUpperCase(), detailsX + 35, detailsY);

  // Client/Vendor Info
  y = Math.max(y + 10, 95);
  doc.setFillColor(...primaryColor);
  doc.rect(15, y, pageWidth - 30, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const partyLabel = orderType === 'sales' ? 'BILL TO:' : 'VENDOR:';
  doc.text(partyLabel, 18, y + 6);

  y += 12;
  doc.setTextColor(...textColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const partyName = orderType === 'sales' ? order.client_name : order.vendor_name;
  doc.text(partyName || '', 15, y);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  y += 6;
  const partyEmail = orderType === 'sales' ? order.client_email : order.vendor_email;
  if (partyEmail) {
    doc.text(`Email: ${partyEmail}`, 15, y);
    y += 5;
  }
  const partyPhone = orderType === 'sales' ? order.client_phone : order.vendor_phone;
  if (partyPhone) {
    doc.text(`Phone: ${partyPhone}`, 15, y);
    y += 5;
  }
  const partyAddress = orderType === 'sales' ? order.client_address : order.vendor_address;
  if (partyAddress) {
    doc.text(`Address: ${partyAddress}`, 15, y);
    y += 5;
  }

  // Line Items Table
  y += 10;
  const tableData = order.items.map((item, index) => [
    (index + 1).toString(),
    item.product_name || '',
    item.sku || '-',
    item.quantity.toString(),
    `₹${item.price.toFixed(2)}`,
    `${item.tax_rate}%`,
    `₹${item.total.toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Item', 'SKU', 'Qty', 'Rate', 'Tax', 'Amount']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 10,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 9,
      textColor: textColor,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 55 },
      2: { cellWidth: 25 },
      3: { cellWidth: 15, halign: 'center' },
      4: { cellWidth: 25, halign: 'right' },
      5: { cellWidth: 15, halign: 'center' },
      6: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: 15, right: 15 },
  });

  // Totals
  y = (doc as any).lastAutoTable.finalY + 10;
  const totalsX = pageWidth - 80;

  // Calculate totals if not provided
  const subtotal = order.subtotal ?? order.items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  const taxAmount = order.tax_amount ?? order.items.reduce((sum, item) => sum + ((item.quantity * item.price * item.tax_rate) / 100), 0);
  const totalAmount = order.total_amount ?? (subtotal + taxAmount);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totalsX, y);
  doc.text(`₹${subtotal.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });

  y += 7;
  doc.text('Tax:', totalsX, y);
  doc.text(`₹${taxAmount.toFixed(2)}`, pageWidth - 15, y, { align: 'right' });

  y += 7;
  doc.setFillColor(...primaryColor);
  doc.rect(totalsX - 5, y - 4, pageWidth - totalsX + 5, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', totalsX, y + 3);
  doc.text(`₹${totalAmount.toFixed(2)}`, pageWidth - 15, y + 3, { align: 'right' });

  // Notes
  if (order.notes) {
    y += 20;
    doc.setTextColor(...textColor);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', 15, y);
    doc.setFont('helvetica', 'normal');
    y += 5;
    const splitNotes = doc.splitTextToSize(order.notes, pageWidth - 30);
    doc.text(splitNotes, 15, y);
    y += splitNotes.length * 5;
  }

  // Signature
  y += 20;
  try {
    if (branding.signature_url) {
      const sigData = await loadImage(branding.signature_url);
      doc.addImage(sigData, 'PNG', pageWidth - 60, y, 40, 20);
    }
  } catch (e) {
    console.log('Could not load signature');
  }

  y += 25;
  doc.setTextColor(...textColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Authorized Signature', pageWidth - 40, y, { align: 'center' });

  // Footer
  const footerY = doc.internal.pageSize.getHeight() - 15;
  doc.setDrawColor(...lightGray);
  doc.line(15, footerY - 5, pageWidth - 15, footerY - 5);
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('This is a computer-generated document.', pageWidth / 2, footerY, { align: 'center' });

  return doc;
};

export const downloadOrderPDF = async (
  order: OrderData,
  businessInfo: BusinessInfo,
  branding: BrandingInfo,
  orderType: 'sales' | 'purchase'
): Promise<void> => {
  const doc = await generateOrderPDF(order, businessInfo, branding, orderType);
  const prefix = orderType === 'sales' ? 'SO' : 'PO';
  doc.save(`${prefix}_${order.order_number}.pdf`);
};

export const getOrderPDFBlob = async (
  order: OrderData,
  businessInfo: BusinessInfo,
  branding: BrandingInfo,
  orderType: 'sales' | 'purchase'
): Promise<Blob> => {
  const doc = await generateOrderPDF(order, businessInfo, branding, orderType);
  return doc.output('blob');
};

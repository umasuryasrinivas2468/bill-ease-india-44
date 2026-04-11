import jsPDF from 'jspdf';
import 'jspdf-autotable';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
}

interface PerformanceData {
  invoicesCreated: number;
  journalsCount: number;
  quotationsSent: number;
  quotationsAccepted: number;
  clientsCount: number;
  tdsAmount: number;
  totalRevenue: number;
  businessName: string;
  period: string;
  // detailed arrays
  invoices?: any[];
  quotations?: any[];
  clients?: any[];
  journalLines?: any[];
  journals?: any[];
  accounts?: any[];
  tdsTransactions?: any[];
  revenueByClient?: Record<string, number>;
  cashIn?: number;
  cashOut?: number;
  inventories?: any[];
  businessAssets?: { logoBase64?: string; logoUrl?: string };
  payables?: any[];
}

interface BusinessSuggestion {
  category: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

interface KeyHighlight {
  title: string;
  value: string;
  trend: string;
}

export const generatePerformancePDF = async (data: PerformanceData) => {
  try {
    const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  const margin = 20;
  let currentY = 20;

    // Helper: create an offscreen canvas and return its 2D context
    const createCanvas = (w: number, h: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      return { canvas, ctx } as { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
    };

    // Helper: draw a simple bar chart of monthly revenue and return data URL
    const renderBarChart = (invoices: any[] = []) => {
      // compute revenue by month (last 6 months)
      const months: Record<string, number> = {};
      invoices.forEach(inv => {
        try {
          const d = new Date(inv.invoice_date);
          const m = d.toLocaleString('en', { month: 'short', year: 'numeric' });
          months[m] = (months[m] || 0) + (inv.status === 'paid' ? Number(inv.total_amount || 0) : 0);
        } catch (e) { /* ignore */ }
      });
      const entries = Object.entries(months).sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime()).slice(-6);
      const labels = entries.map(e => e[0]);
      const values = entries.map(e => e[1]);

      const width = 600, height = 240;
      const { canvas, ctx } = createCanvas(width, height);
      // background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      // title
      ctx.fillStyle = '#222';
      ctx.font = '16px sans-serif';
      ctx.fillText('Monthly Revenue', 10, 22);
      // chart area
      const chartX = 40, chartY = 40, chartW = width - 80, chartH = height - 80;
      // axes
      ctx.strokeStyle = '#ccc';
      ctx.strokeRect(chartX, chartY, chartW, chartH);
      const max = Math.max(...values, 100);
      const barW = entries.length ? chartW / entries.length - 10 : 20;
      values.forEach((v, i) => {
        const barH = (v / max) * (chartH - 20);
        const x = chartX + i * (barW + 10) + 10;
        const y = chartY + chartH - barH;
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(x, y, barW, barH);
        // labels
        ctx.fillStyle = '#333';
        ctx.font = '10px sans-serif';
        ctx.fillText(labels[i] || '', x, chartY + chartH + 14);
        ctx.fillText(`₹${Math.round(v).toLocaleString()}`, x, y - 6);
      });
      return canvas.toDataURL('image/png');
    };

    // Helper: draw a pie chart for GST / revenue split and return data URL
    const renderPieChart = (invoices: any[] = []) => {
      // Build simple GST breakdown: cgst/sgst/igst approximated from paid invoices gst_amount
      const paid = invoices.filter(i => i.status === 'paid');
      const totalGst = paid.reduce((s, inv) => s + Number(inv.gst_amount || 0), 0);
      const cgst = totalGst * 0.5;
      const sgst = totalGst * 0.5;
      const igst = 0;
      const data = [cgst, sgst, igst];
      const labels = ['CGST', 'SGST', 'IGST'];
      const colors = ['#8884d8', '#82ca9d', '#ffc658'];

      const width = 380, height = 220;
      const { canvas, ctx } = createCanvas(width, height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#222';
      ctx.font = '14px sans-serif';
      ctx.fillText('GST Breakdown', 10, 20);
      const cx = 120, cy = 120, r = 70;
      const total = data.reduce((s, v) => s + v, 0) || 1;
      let start = -Math.PI / 2;
      data.forEach((v, i) => {
        const angle = (v / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, start, start + angle);
        ctx.closePath();
        ctx.fillStyle = colors[i];
        ctx.fill();
        start += angle;
      });
      // legend
      ctx.font = '11px sans-serif';
      labels.forEach((lab, i) => {
        ctx.fillStyle = colors[i];
        ctx.fillRect(240, 60 + i * 20, 12, 12);
        ctx.fillStyle = '#333';
        ctx.fillText(`${lab}: ₹${Math.round(data[i]).toLocaleString()}`, 260, 72 + i * 20);
      });
      return canvas.toDataURL('image/png');
    };

  // Logo (Aczen or user's)
  try {
    const logo = data.businessAssets?.logoBase64 || data.businessAssets?.logoUrl;
    if (logo) {
      // If it's a URL, try to fetch and convert to data URL
      let imgData = logo;
      if (logo.startsWith('http')) {
        try {
          const resp = await fetch(logo);
          const blob = await resp.blob();
          const reader = await new Promise<string | ArrayBuffer | null>((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.readAsDataURL(blob);
          });
          imgData = typeof reader === 'string' ? reader : imgData;
        } catch (e) {
          // ignore fetch errors, fallback later
        }
      }
      if (typeof imgData === 'string' && imgData.startsWith('data:')) {
        doc.addImage(imgData, 'PNG', pageWidth - 80, 10, 60, 30);
      }
    }
  } catch (logoErr) {
    // don't fail entire report for logo issues - log and continue
    // eslint-disable-next-line no-console
    console.warn('Performance PDF - logo load failed', logoErr);
  }

  // Title and left-side note
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(`${data.businessName} - Performance Report`, margin, currentY);
  // left side mention
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated from Aczen Dashboard`, margin, currentY + 8);

  currentY += 20;
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated on: ${format(new Date(), 'PPP')}`, margin, currentY);
  doc.text(`Period: ${data.period}`, margin, currentY + 8);
  
  currentY += 25;

  // Business Metrics Section
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Business Metrics Overview", margin, currentY);
  currentY += 10;

  const metricsData = [
    ['Metric', 'Value'],
    ['Invoices Created', data.invoicesCreated.toString()],
    ['Manual Journals', data.journalsCount.toString()],
    ['Quotations Sent', data.quotationsSent.toString()],
    ['Quotations Accepted', data.quotationsAccepted.toString()],
    ['Total Clients', data.clientsCount.toString()],
    ['TDS Collected', `₹${data.tdsAmount.toLocaleString()}`],
    ['Total Revenue', `₹${data.totalRevenue.toLocaleString()}`]
  ];

      autoTable(doc, {
    startY: currentY,
    head: [metricsData[0]],
    body: metricsData.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [66, 139, 202] },
    margin: { left: margin, right: margin }
  });

      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 120;

    // Embed charts: bar and pie
    try {
      const barDataUrl = renderBarChart(data.invoices || []);
      doc.addImage(barDataUrl, 'PNG', margin, currentY, pageWidth - margin * 2, 70);
      currentY += 76;
      const pieDataUrl = renderPieChart(data.invoices || []);
      doc.addImage(pieDataUrl, 'PNG', margin, currentY, 180, 90);
      // leave room for other content on the right
      // continue below images
      currentY += 100;
    } catch (chartErr) {
      console.warn('Chart rendering failed', chartErr);
    }

    // Cash Flow Summary
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Cash Flow Summary", margin, currentY);
  currentY += 10;
  const cashIn = data.cashIn || 0;
  const cashOut = data.cashOut || 0;
  const netCash = cashIn - cashOut;
      autoTable(doc, {
    startY: currentY,
    head: [['Metric', 'Value']],
    body: [
      ['Cash In', `₹${cashIn.toLocaleString()}`],
      ['Cash Out', `₹${cashOut.toLocaleString()}`],
      ['Net Cash Flow', `₹${netCash.toLocaleString()}`]
    ],
    theme: 'grid',
    headStyles: { fillColor: [108, 117, 125] },
    margin: { left: margin, right: margin }
  });
      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 16 : currentY + 100;

  // Client Revenue Breakdown (top 10)
  if (data.revenueByClient) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Top Clients by Revenue", margin, currentY);
    currentY += 10;
    const clientRows = Object.entries(data.revenueByClient)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amt]) => [name, `₹${amt.toLocaleString()}`]);

        autoTable(doc, {
      startY: currentY,
      head: [['Client', 'Revenue']],
      body: clientRows,
      theme: 'striped',
      margin: { left: margin, right: margin }
    });
        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 16 : currentY + 100;
  }
  // Key Highlights Section
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Key Business Highlights", margin, currentY);
  currentY += 10;
  const highlights = generateKeyHighlights(data);
  const highlightsData = [
    ['Highlight', 'Value', 'Trend'],
    ...highlights.map(h => [h.title, h.value, h.trend])
  ];

      autoTable(doc, {
    startY: currentY,
    head: [highlightsData[0]],
    body: highlightsData.slice(1),
    theme: 'grid',
    headStyles: { fillColor: [40, 167, 69] },
    margin: { left: margin, right: margin }
  });

      currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 120;

  // Invoices Table (latest 20)
  if (data.invoices && data.invoices.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Recent Invoices (latest ${Math.min(20, data.invoices.length)})`, margin, currentY);
    currentY += 10;
    const invoiceRows = data.invoices
      .slice()
      .sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime())
      .slice(0, 20)
      .map(inv => [inv.invoice_number || '-', inv.client_name || '-', new Date(inv.invoice_date).toLocaleDateString(), `₹${Number(inv.total_amount || 0).toLocaleString()}`, inv.status || '-']);

        autoTable(doc, {
      startY: currentY,
      head: [['Inv #', 'Client', 'Date', 'Amount', 'Status']],
      body: invoiceRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });
        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 140;
  }

  // Quotations Table (latest 20)
  if (data.quotations && data.quotations.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Recent Quotations (latest ${Math.min(20, data.quotations.length)})`, margin, currentY);
    currentY += 10;
    const quoteRows = data.quotations
      .slice()
      .sort((a, b) => new Date(b.created_at || b.quotation_date || 0).getTime() - new Date(a.created_at || a.quotation_date || 0).getTime())
      .slice(0, 20)
      .map(q => [q.quotation_number || q.id || '-', q.client_name || '-', q.status || '-', `₹${Number(q.total_amount || 0).toLocaleString()}`]);

        autoTable(doc, {
      startY: currentY,
      head: [['Quote #', 'Client', 'Status', 'Amount']],
      body: quoteRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });
        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 140;
  }

  // Inventories
  if (data.inventories && data.inventories.length > 0) {
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Inventory Snapshot (${data.inventories.length})`, margin, currentY);
    currentY += 10;
    const invRows = data.inventories.slice(0, 30).map((it: any) => [it.product_name || '-', it.sku || '-', it.stock_quantity?.toString() || '0', `₹${Number(it.selling_price || 0).toLocaleString()}`]);
        autoTable(doc, {
      startY: currentY,
      head: [['Product', 'SKU', 'Stock', 'Price']],
      body: invRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });
        currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 140;
  }

  // Payables (Account Payables)
  if (data.payables && data.payables.length > 0) {
    if (currentY > doc.internal.pageSize.height - 100) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Account Payables (${data.payables.length})`, margin, currentY);
    currentY += 10;
    const payableRows = data.payables.slice(0, 30).map((p: any) => [
      p.vendor_name || '-', 
      p.bill_number || p.related_purchase_order_number || '-', 
      new Date(p.due_date).toLocaleDateString(), 
      `₹${Number(p.amount_remaining || 0).toLocaleString()}`,
      p.status || '-'
    ]);
    autoTable(doc, {
      startY: currentY,
      head: [['Vendor', 'Bill No', 'Due Date', 'Amount Remaining', 'Status']],
      body: payableRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });
    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 140;
  }

  // Day Book (Journal Entries)
  if (data.journals && data.journals.length > 0) {
    if (currentY > doc.internal.pageSize.height - 100) {
      doc.addPage();
      currentY = 20;
    }
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(`Day Book - Journal Entries (${data.journals.length})`, margin, currentY);
    currentY += 10;
    const journalRows = data.journals
      .slice()
      .sort((a: any, b: any) => new Date(b.journal_date || 0).getTime() - new Date(a.journal_date || 0).getTime())
      .slice(0, 30)
      .map((j: any) => [
        j.journal_number || '-', 
        new Date(j.journal_date).toLocaleDateString(), 
        j.narration || '-', 
        `₹${Number(j.total_debit || 0).toLocaleString()}`,
        `₹${Number(j.total_credit || 0).toLocaleString()}`,
        j.status || '-'
      ]);
    autoTable(doc, {
      startY: currentY,
      head: [['Journal #', 'Date', 'Narration', 'Debit', 'Credit', 'Status']],
      body: journalRows,
      theme: 'grid',
      margin: { left: margin, right: margin },
      styles: { fontSize: 9 }
    });
    currentY = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 20 : currentY + 140;
  }

  // Check if we need a new page
  if (currentY > doc.internal.pageSize.height - 100) {
    doc.addPage();
    currentY = 20;
  }

  // Business Suggestions Section
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Business Improvement Suggestions", margin, currentY);
  currentY += 10;

  const suggestions = generateBusinessSuggestions(data);
  
  suggestions.forEach((suggestion, index) => {
    if (currentY > doc.internal.pageSize.height - 60) {
      doc.addPage();
      currentY = 20;
    }

    const priorityColor = suggestion.priority === 'high' ? [220, 53, 69] : 
                         suggestion.priority === 'medium' ? [255, 193, 7] : [108, 117, 125];
    
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(priorityColor[0], priorityColor[1], priorityColor[2]);
    doc.text(`${index + 1}. ${suggestion.category} (${suggestion.priority.toUpperCase()} PRIORITY)`, margin, currentY);
    
    currentY += 8;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
    
    const splitText = doc.splitTextToSize(suggestion.suggestion, pageWidth - (margin * 2));
    doc.text(splitText, margin + 5, currentY);
    currentY += splitText.length * 6 + 8;
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(128, 128, 128);
      doc.text(
        `Page ${i} of ${pageCount} - Generated by Aczen`,
        pageWidth - margin - 50,
        doc.internal.pageSize.height - 10
      );
  }

    return doc;
  } catch (err) {
    // Provide a clearer error for the caller
    // eslint-disable-next-line no-console
    console.error('generatePerformancePDF error:', err);
    throw new Error('Failed to assemble performance PDF. ' + (err instanceof Error ? err.message : String(err)));
  }
};

const generateKeyHighlights = (data: PerformanceData): KeyHighlight[] => {
  const acceptanceRate = data.quotationsSent > 0 ? (data.quotationsAccepted / data.quotationsSent) * 100 : 0;
  const avgRevenuePerClient = data.clientsCount > 0 ? data.totalRevenue / data.clientsCount : 0;
  
  return [
    {
      title: "Quotation Acceptance Rate",
      value: `${acceptanceRate.toFixed(1)}%`,
      trend: acceptanceRate > 60 ? "↗ Good" : acceptanceRate > 30 ? "→ Average" : "↘ Needs Improvement"
    },
    {
      title: "Average Revenue per Client",
      value: `₹${avgRevenuePerClient.toLocaleString()}`,
      trend: avgRevenuePerClient > 50000 ? "↗ Excellent" : avgRevenuePerClient > 20000 ? "→ Good" : "↘ Can Improve"
    },
    {
      title: "Invoice to Revenue Ratio",
      value: data.invoicesCreated > 0 ? `₹${(data.totalRevenue / data.invoicesCreated).toFixed(0)}` : "₹0",
      trend: "→ Stable"
    },
    {
      title: "TDS Compliance",
      value: `₹${data.tdsAmount.toLocaleString()}`,
      trend: data.tdsAmount > 0 ? "✓ Compliant" : "⚠ Review Required"
    }
  ];
};

const generateBusinessSuggestions = (data: PerformanceData): BusinessSuggestion[] => {
  const suggestions: BusinessSuggestion[] = [];
  const acceptanceRate = data.quotationsSent > 0 ? (data.quotationsAccepted / data.quotationsSent) * 100 : 0;
  const avgRevenuePerClient = data.clientsCount > 0 ? data.totalRevenue / data.clientsCount : 0;

  // Quotation-related suggestions
  if (acceptanceRate < 30) {
    suggestions.push({
      category: "Sales Optimization",
      suggestion: "Your quotation acceptance rate is below 30%. Consider reviewing your pricing strategy, improving quotation presentation, and following up more effectively with prospects. Consider offering flexible payment terms or package deals.",
      priority: 'high'
    });
  } else if (acceptanceRate < 60) {
    suggestions.push({
      category: "Sales Improvement",
      suggestion: "Your quotation acceptance rate is average. Try implementing a follow-up system, create more detailed quotations with clear value propositions, and consider competitive analysis to optimize pricing.",
      priority: 'medium'
    });
  }

  // Revenue optimization
  if (avgRevenuePerClient < 20000) {
    suggestions.push({
      category: "Revenue Growth",
      suggestion: "Average revenue per client is low. Focus on upselling additional services, implementing tiered pricing, or targeting higher-value clients. Consider creating service packages to increase transaction values.",
      priority: 'high'
    });
  }

  // Client acquisition
  if (data.clientsCount < 10) {
    suggestions.push({
      category: "Client Acquisition",
      suggestion: "Consider expanding your client base through referral programs, digital marketing, networking events, and partnerships. A larger client base provides more stable revenue and growth opportunities.",
      priority: 'high'
    });
  }

  // Invoice management
  if (data.invoicesCreated < data.clientsCount) {
    suggestions.push({
      category: "Billing Efficiency",
      suggestion: "You have fewer invoices than clients, suggesting potential billing gaps. Implement regular billing cycles, consider recurring billing for ongoing services, and ensure all deliverables are properly invoiced.",
      priority: 'medium'
    });
  }

  // Financial management
  if (data.journalsCount === 0) {
    suggestions.push({
      category: "Financial Management",
      suggestion: "No manual journals recorded. Consider implementing better expense tracking, regular financial reconciliation, and maintaining detailed financial records for better business insights and tax compliance.",
      priority: 'medium'
    });
  }

  // TDS compliance
  if (data.tdsAmount === 0 && data.totalRevenue > 100000) {
    suggestions.push({
      category: "Tax Compliance",
      suggestion: "With significant revenue but no TDS records, ensure you're compliant with TDS requirements. Review your transactions to identify TDS-applicable payments and maintain proper documentation.",
      priority: 'high'
    });
  }

  // Growth strategies
  suggestions.push({
    category: "Business Growth",
    suggestion: "Implement customer feedback systems, explore digital transformation opportunities, consider automation for routine tasks, and invest in staff training to improve service quality and operational efficiency.",
    priority: 'low'
  });

  // Technology adoption
  suggestions.push({
    category: "Technology & Automation",
    suggestion: "Leverage technology for better client communication, automated follow-ups, digital payment solutions, and cloud-based collaboration tools to improve efficiency and client satisfaction.",
    priority: 'low'
  });

  return suggestions;
};
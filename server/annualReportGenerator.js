const PDFDocument = require('pdfkit');
const fs = require('fs');
const { PassThrough } = require('stream');

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '-';
  const n = Number(amount);
  if (isNaN(n)) return '-';
  const abs = Math.abs(Math.round(n));
  const s = abs.toLocaleString('en-IN');
  return n < 0 ? `(${s})` : s;
}

function addHeader(doc, companyName, subtitle) {
  doc.fontSize(16).font('Helvetica-Bold').text((companyName || 'COMPANY').toUpperCase(), { align: 'center' });
  if (subtitle) doc.moveDown(0.2).fontSize(12).font('Helvetica').text(subtitle, { align: 'center' });
  doc.moveDown(1);
}

function addSignature(doc, company, ownerName) {
  doc.moveDown(3);
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftX = doc.page.margins.left;
  const rightX = doc.page.margins.left + pageWidth;
  // left: auditor
  doc.fontSize(10).font('Helvetica').text('For V S P & Associates', leftX, doc.y);
  doc.text('Chartered Accountants');
  doc.moveDown(2);
  // right: director
  const signY = doc.y - 30;
  doc.text('', { continued: false });
  doc.moveTo(rightX - 150, signY).lineTo(rightX, signY).stroke();
  doc.font('Helvetica-Bold').text(ownerName ? ownerName.toUpperCase() : 'DIRECTOR', rightX - 150, signY + 6, { width: 150, align: 'right' });
}

function generateContent(doc, company = {}, data = {}, year = '2024-25', ownerName) {
  try {
    // Cover
    doc.fontSize(16).font('Helvetica-Bold');
    doc.text((company.companyName || 'COMPANY').toUpperCase(), { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(12).font('Helvetica');
    doc.text(`Annual Report - Financial Year ${year}`, { align: 'center' });
    doc.addPage();

    // Table of contents (simple)
    doc.fontSize(14).font('Helvetica-Bold').text('Table of Contents');
    doc.moveDown(0.5);
    const toc = ['Director\'s Report', 'Financial Highlights', 'Profit & Loss Statement', 'Balance Sheet', 'Cash Flow Statement', 'Notes to Accounts', 'TDS & Tax Summary', 'Compliance Summary', 'Audit Certificate'];
    toc.forEach((t, i) => {
      doc.font('Helvetica').fontSize(11);
      doc.text(`${i + 1}. ${t}`);
    });
    doc.addPage();

    // Director's Report
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text("Director's Report");
    doc.moveDown(0.5);
  // Director's Report
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text("Director's Report");
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    doc.text(`The Board hereby presents the Annual Report for the year ${year}.`);
    doc.moveDown(1);
    doc.text(`Director: ${ownerName || company.ownerName || ''}`);
    doc.addPage();

    // Financial highlights - simple box layout
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Financial Highlights');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Total Revenue: ${formatCurrency(data.totalRevenue || 0)}`);
    doc.text(`Total Expenses: ${formatCurrency(data.totalExpenses || 0)}`);
    doc.text(`Profit After Tax: ${formatCurrency(data.profitAfterTax || 0)}`);
    doc.addPage();

    // Profit & Loss
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Profit & Loss Statement');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Revenue from Operations: ${formatCurrency(data.revenueFromOperations || 0)}`);
    doc.text(`Other Income: ${formatCurrency(data.otherIncome || 0)}`);
    doc.text(`Total Revenue: ${formatCurrency(data.totalRevenue || 0)}`);
    doc.moveDown(0.2);
    doc.text(`Total Expenses: ${formatCurrency(data.totalExpenses || 0)}`);
    doc.moveDown(0.2);
    doc.font('Helvetica-Bold');
    doc.text(`Profit Before Tax: ${formatCurrency(data.profitBeforeTax || 0)}`);
    doc.text(`Profit After Tax: ${formatCurrency(data.profitAfterTax || 0)}`);
    doc.addPage();

    // Balance Sheet
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Balance Sheet');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Assets: ${formatCurrency(data.assets || 0)}`);
    doc.text(`Liabilities: ${formatCurrency(data.liabilities || 0)}`);
    doc.text(`Equity: ${formatCurrency(data.equity || 0)}`);
    doc.addPage();

    // Cash Flow
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Cash Flow Statement (Indirect Method)');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text('Operating Activities: -');
    doc.text('Investing Activities: -');
    doc.text('Financing Activities: -');
    doc.addPage();

    // Notes
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Notes to Accounts');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text('Notes are illustrative. Replace with actual notes from the accounting system.');
    doc.addPage();

    // TDS
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TDS & Tax Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Tax Payable: ${formatCurrency(data.taxExpense || 0)}`);
    doc.addPage();

    // Compliance
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Compliance Summary');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text('GST: Filed');
    doc.text('MCA: Filed');
    doc.text('TDS: Filed');
    doc.addPage();

    // Audit & Signature
    doc.fontSize(14).font('Helvetica-Bold');
    doc.text('Audit Certificate');
    doc.moveDown(1);
    doc.fontSize(10).font('Helvetica');
    doc.text('We have audited the financial statements of the Company for the year ended ...');
    doc.moveDown(3);
    doc.text('For V S P & Associates', { align: 'left' });
    doc.text('Chartered Accountants', { align: 'left' });
    doc.moveDown(2);
    doc.font('Helvetica-Bold');
    doc.text(ownerName ? ownerName.toUpperCase() : 'DIRECTOR', { align: 'right' });
    doc.font('Helvetica');
    doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, { align: 'right' });

  } catch (e) {
    console.error('Error in generateContent:', e.message);
    doc.text(`\n\nError generating PDF: ${String(e.message)}`);
  }
}function generateToStream(year, ownerName, opts = {}) {
  return new Promise((resolve, reject) => {
    const company = opts.company || {};
    const data = opts.data || {};
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => {
      if (chunk && chunk.length > 0) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
    });

    doc.on('error', (err) => {
      console.error('PDF Document error:', err);
      reject(err);
    });

    try {
      generateContent(doc, company, data, year, ownerName);
    } catch (e) {
      console.error('Error in generateContent:', e);
      doc.text('\n\nError generating PDF: ' + String(e));
    }

    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(chunks);
      console.log('PDF Generated - Total size:', pdfBuffer.length, 'bytes');
      
      const pass = new PassThrough();
      setImmediate(() => {
        pass.end(pdfBuffer);
      });
      resolve(pass);
    });

    doc.end();
  });
}

function generateToFile(outPath, year, ownerName, opts = {}) {
  return new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(outPath);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(stream);
    try {
      generateContent(doc, opts.company || {}, opts.data || {}, year, ownerName);
    } catch (e) {
      doc.text('\n\nError generating PDF: ' + String(e));
    }
    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}

module.exports = {
  generateToStream,
  generateToFile
};





const express = require('express');
const cors = require('cors');
const federalBankService = require('./federalBankService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory storage for user VPAs (in production, use a database)
const userVPAs = new Map();
const transactions = new Map();
// In-memory store for created payment links
const paymentLinks = new Map();

// Generate reference ID
const generateReferenceId = () => {
  return `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// POST /create-vpa - Create VPA for user
app.post('/create-vpa', async (req, res) => {
  try {
    const {
      businessName,
      accountNumber,
      ifscCode,
      phone,
      email,
      userId
    } = req.body;

    // Validate required fields
    if (!businessName || !accountNumber || !ifscCode || !phone || !email || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    console.log('Creating VPA for user:', { businessName, userId });

    const vpaResponse = await federalBankService.createVPA({
      businessName,
      accountNumber,
      ifscCode,
      phone,
      email
    });

    // Store VPA for user
    userVPAs.set(userId, {
      vpa: vpaResponse.VirtualID,
      transactionId: vpaResponse.TransactionId,
      businessName,
      accountNumber,
      ifscCode,
      phone,
      email,
      createdAt: new Date().toISOString()
    });

    res.json({
      success: true,
      data: {
        vpa: vpaResponse.VirtualID,
        transactionId: vpaResponse.TransactionId,
        status: vpaResponse.Status
      }
    });

  } catch (error) {
    console.error('Error creating VPA:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create VPA',
      details: error.message
    });
  }
});

// POST /collect - Create UPI collection request
app.post('/collect', async (req, res) => {
  try {
    const {
      userId,
      amount,
      purpose_message,
      expiry_minutes = 30
    } = req.body;

    // Validate required fields
    if (!userId || !amount || !purpose_message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Get user's VPA
    const userVPA = userVPAs.get(userId);
    if (!userVPA) {
      return res.status(404).json({
        success: false,
        error: 'VPA not found for user. Please create VPA first.'
      });
    }

    const reference_id = generateReferenceId();
    const expiry_time = new Date();
    expiry_time.setMinutes(expiry_time.getMinutes() + expiry_minutes);

    // Generate UPI deep link
    const upiLink = federalBankService.generateUPILink(
      userVPA.vpa,
      userVPA.businessName,
      amount,
      purpose_message
    );

    // Store transaction details
    const transactionData = {
      reference_id,
      userId,
      vpa: userVPA.vpa,
      amount,
      purpose_message,
      upiLink,
      status: 'pending',
      expiry_time: expiry_time.toISOString(),
      created_at: new Date().toISOString()
    };

    transactions.set(reference_id, transactionData);

    console.log('UPI collection request created:', { reference_id, amount, vpa: userVPA.vpa });

    res.json({
      success: true,
      data: {
        reference_id,
        vpa: userVPA.vpa,
        upiLink,
        amount,
        purpose_message,
        expiry_time: expiry_time.toISOString(),
        status: 'pending'
      }
    });

  } catch (error) {
    console.error('Error creating UPI collection:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create UPI collection request',
      details: error.message
    });
  }
});

// GET /status/:referenceId - Check transaction status
app.get('/status/:referenceId', async (req, res) => {
  try {
    const { referenceId } = req.params;
    
    const transaction = transactions.get(referenceId);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }

    // Get user's VPA data to access transaction ID
    const userVPA = userVPAs.get(transaction.userId);
    if (!userVPA) {
      return res.status(404).json({
        success: false,
        error: 'User VPA data not found'
      });
    }

    try {
      const statusResponse = await federalBankService.checkTransactionStatus(
        userVPA.transactionId
      );

      // Update transaction status based on Federal Bank response
      if (statusResponse.Status === 'SUCCESS') {
        transaction.status = 'completed';
        transaction.payer_vpa = statusResponse.PayerVpa;
        transaction.transaction_ref_id = statusResponse.TransactionRefId;
        transaction.completed_at = statusResponse.Timestamp;
        transactions.set(referenceId, transaction);
      }

      res.json({
        success: true,
        data: {
          reference_id: referenceId,
          status: transaction.status,
          amount: transaction.amount,
          federal_bank_status: statusResponse.Status,
          payer_vpa: statusResponse.PayerVpa,
          timestamp: statusResponse.Timestamp
        }
      });
    } catch (statusError) {
      // If status check fails, return current stored status
      res.json({
        success: true,
        data: {
          reference_id: referenceId,
          status: transaction.status,
          amount: transaction.amount,
          note: 'Status check from Federal Bank failed, showing cached status'
        }
      });
    }

  } catch (error) {
    console.error('Error checking status:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to check transaction status'
    });
  }
});

// GET /user-vpa/:userId - Get user's VPA
app.get('/user-vpa/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userVPA = userVPAs.get(userId);
    
    if (!userVPA) {
      return res.status(404).json({
        success: false,
        error: 'VPA not found for user'
      });
    }

    res.json({
      success: true,
      data: {
        vpa: userVPA.vpa,
        businessName: userVPA.businessName,
        createdAt: userVPA.createdAt
      }
    });
  } catch (error) {
    console.error('Error getting user VPA:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get user VPA'
    });
  }
});

// GET /transactions/:userId - Get user's transactions
app.get('/transactions/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const userTransactions = Array.from(transactions.values())
      .filter(t => t.userId === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({
      success: true,
      data: userTransactions
    });
  } catch (error) {
    console.error('Error getting transactions:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to get transactions'
    });
  }
});

// Helper to call Razorpay API
async function razorpayCreatePaymentLink({ amount, currency = 'INR', description, customer }){
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error('Razorpay keys not configured');

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');
  const payload = {
    amount: Math.round(Number(amount) * 100), // paise
    currency,
    accept_partial: false,
    description: description || '',
    customer: {
      name: customer?.name || '',
      email: customer?.email || '',
      contact: customer?.contact || ''
    },
    notify: { sms: false, email: true },
    reminder_enable: true
  };

  const resp = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Razorpay create link failed: ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return data;
}

// POST /payments/send-link - create a Razorpay payment link and optionally send email via SendGrid
app.post('/payments/send-link', async (req, res) => {
  try {
    const { userId, amount, description, customer } = req.body;
    if (!userId || !amount || !customer || !customer.email) {
      return res.status(400).json({ success: false, error: 'Missing required fields: userId, amount, customer.email' });
    }

    const link = await razorpayCreatePaymentLink({ amount, description, customer });

    // store minimal info
    paymentLinks.set(link.id, { id: link.id, short_url: link.short_url, link_url: link.short_url || link.long_url || link.url, amount: link.amount, currency: link.currency, status: link.status, created_at: new Date().toISOString(), meta: link });

    // Try to send email via SendGrid if configured
    let emailSent = false;
    if (process.env.SENDGRID_API_KEY) {
      try {
        const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: customer.email, name: customer.name }]}],
            from: { email: process.env.SUPPORT_FROM_EMAIL || 'no-reply@example.com', name: process.env.SUPPORT_FROM_NAME || 'Aczen' },
            subject: `Payment link from ${process.env.SUPPORT_FROM_NAME || 'Aczen'}`,
            content: [{ type: 'text/plain', value: `Please complete your payment using the following link:\n\n${link.short_url || link.long_url}\n\nDescription: ${description || ''}` }]
          })
        });
        emailSent = sgResp.ok;
      } catch (e) {
        console.error('SendGrid send failed', e.message);
      }
    }

    res.json({ success: true, data: { link, emailSent } });
  } catch (error) {
    console.error('Error creating payment link:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create payment link', details: error.message });
  }
});

// GET /payments/user/:userId - return created links for user (in-memory)
app.get('/payments/user/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    // return all stored links (no multi-tenant logic in this demo)
    const arr = Array.from(paymentLinks.values()).sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    res.json({ success: true, data: arr });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /payments/:linkId - fetch link status from Razorpay if key present
app.get('/payments/:linkId', async (req, res) => {
  try {
    const { linkId } = req.params;
    const stored = paymentLinks.get(linkId);
    if (!stored) return res.status(404).json({ success: false, error: 'Link not found' });

    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
      const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString('base64');
      const resp = await fetch(`https://api.razorpay.com/v1/payment_links/${linkId}`, { headers: { Authorization: `Basic ${auth}` } });
      if (resp.ok) {
        const data = await resp.json();
        // update stored
        paymentLinks.set(linkId, { ...stored, status: data.status, meta: data });
        return res.json({ success: true, data });
      }
    }

    res.json({ success: true, data: stored });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// TDS API Endpoints

// POST /tds/rules - Add new TDS category/rule
app.post('/tds/rules', (req, res) => {
  try {
    const {
      userId,
      category,
      rate_percentage,
      description
    } = req.body;

    // Validate required fields
    if (!userId || !category || rate_percentage === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, category, rate_percentage'
      });
    }

    // Validate rate percentage
    if (rate_percentage < 0 || rate_percentage > 100) {
      return res.status(400).json({
        success: false,
        error: 'Rate percentage must be between 0 and 100'
      });
    }

    // For demonstration purposes, we're just returning success
    // In a real implementation, this would save to database
    const tdsRule = {
      id: `tds_rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      category,
      rate_percentage: parseFloat(rate_percentage),
      description: description || '',
      is_active: true,
      created_at: new Date().toISOString()
    };

    console.log('TDS rule created:', tdsRule);

    res.json({
      success: true,
      data: tdsRule,
      message: 'TDS rule created successfully'
    });

  } catch (error) {
    console.error('Error creating TDS rule:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create TDS rule',
      details: error.message
    });
  }
});

// GET /reports/tds - Get TDS report with filters
app.get('/reports/tds', (req, res) => {
  try {
    const { 
      userId,
      period = 'monthly',
      startDate,
      endDate,
      category 
    } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Mock TDS data for demonstration
    // In real implementation, this would query the database
    const mockTDSData = {
      summary: {
        totalTransactionAmount: 500000,
        totalTDSDeducted: 25000,
        totalNetPayable: 475000,
        transactionCount: 15,
        period: period
      },
      transactions: [
        {
          id: 'tds_txn_1',
          date: '2024-01-15',
          vendor_name: 'ABC Consultants',
          transaction_amount: 100000,
          tds_rate: 10,
          tds_deducted: 10000,
          net_paid: 90000,
          category: 'Professional Fees',
          certificate_number: 'TDS001'
        },
        {
          id: 'tds_txn_2', 
          date: '2024-01-20',
          vendor_name: 'XYZ Contractors',
          transaction_amount: 200000,
          tds_rate: 2,
          tds_deducted: 4000,
          net_paid: 196000,
          category: 'Contractor Payments',
          certificate_number: 'TDS002'
        }
      ],
      categoryBreakdown: [
        {
          category: 'Professional Fees',
          totalAmount: 300000,
          totalTDS: 30000,
          transactionCount: 8
        },
        {
          category: 'Contractor Payments', 
          totalAmount: 200000,
          totalTDS: 4000,
          transactionCount: 7
        }
      ]
    };

    console.log('TDS report requested for user:', userId, 'period:', period);

    res.json({
      success: true,
      data: mockTDSData,
      filters: {
        userId,
        period,
        startDate,
        endDate,
        category
      }
    });

  } catch (error) {
    console.error('Error generating TDS report:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to generate TDS report',
      details: error.message
    });
  }
});

// POST /tds/transaction - Record TDS transaction
app.post('/tds/transaction', (req, res) => {
  try {
    const {
      userId,
      clientId,
      transactionAmount,
      tdsRate,
      vendorName,
      transactionDate,
      category,
      description,
      vendorPan,
      certificateNumber
    } = req.body;

    // Validate required fields
    if (!userId || !transactionAmount || !tdsRate || !vendorName || !transactionDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    // Calculate TDS
    const tdsAmount = Math.round(transactionAmount * tdsRate / 100 * 100) / 100;
    const netPayable = Math.round((transactionAmount - tdsAmount) * 100) / 100;

    const tdsTransaction = {
      id: `tds_txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      clientId,
      transactionAmount: parseFloat(transactionAmount),
      tdsRate: parseFloat(tdsRate),
      tdsAmount,
      netPayable,
      vendorName,
      transactionDate,
      category: category || 'Other',
      description: description || '',
      vendorPan: vendorPan || '',
      certificateNumber: certificateNumber || '',
      created_at: new Date().toISOString()
    };

    console.log('TDS transaction recorded:', tdsTransaction);

    res.json({
      success: true,
      data: tdsTransaction,
      message: 'TDS transaction recorded successfully'
    });

  } catch (error) {
    console.error('Error recording TDS transaction:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to record TDS transaction',
      details: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Federal Bank UPI Integration with TDS Support'
  });
});

// Annual Report endpoint - generate in-process using PDFKit and stream the result
const path = require('path');
const { generateToStream } = require('./annualReportGenerator');

app.get('/reports/annual', async (req, res) => {
  let timeoutHandle;
  try {
    const year = req.query.year || '2024-25';
    const ownerName = req.query.ownerName || process.env.ANNUAL_REPORT_OWNER || 'Company Director';

    console.log('Generating annual report:', { year, ownerName });
    
    const filename = `annual-report-${String(year).replace(/[\\/\\\\]/g,'-')}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Transfer-Encoding', 'chunked');

    // generateToStream returns a Promise that resolves to a readable stream
    const pdfStream = await generateToStream(String(year), String(ownerName), {});

    // Pipe the stream to response
    pdfStream.on('error', (err) => {
      console.error('PDF stream runtime error:', err);
      try { if (!res.headersSent) res.status(500).json({ success: false, error: 'Failed to generate PDF' }); } catch (e) { /* ignore */ }
    });

    pdfStream.on('data', (chunk) => console.log('PDF chunk:', chunk.length, 'bytes'));
    pdfStream.pipe(res).on('error', (err) => console.error('Pipe error:', err));
    res.on('error', (err) => console.error('Response error during PDF stream:', err));

  } catch (err) {
    console.error('Error in /reports/annual handler:', err);
    clearTimeout(timeoutHandle);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error', details: err.message });
    } else {
      res.end();
    }
  }
});

// Minimal test PDF endpoint for diagnostics
app.get('/test/pdf', (req, res) => {
  console.log('Test PDF endpoint called');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="test.pdf"');
  
  // Minimal valid PDF
  const minimalPdf = Buffer.from(
    '%PDF-1.4\n' +
    '1 0 obj\n' +
    '<< /Type /Catalog /Pages 2 0 R >>\n' +
    'endobj\n' +
    '2 0 obj\n' +
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n' +
    'endobj\n' +
    '3 0 obj\n' +
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >>\n' +
    'endobj\n' +
    '4 0 obj\n' +
    '<< /Length 44 >>\n' +
    'stream\n' +
    'BT /F1 12 Tf 50 700 Td (Test PDF) Tj ET\n' +
    'endstream\n' +
    'endobj\n' +
    'xref\n' +
    '0 5\n' +
    '0000000000 65535 f\n' +
    '0000000009 00000 n\n' +
    '0000000074 00000 n\n' +
    '0000000133 00000 n\n' +
    '0000000340 00000 n\n' +
    'trailer\n' +
    '<< /Size 5 /Root 1 0 R >>\n' +
    'startxref\n' +
    '434\n' +
    '%%EOF\n'
  );
  
  console.log('Test PDF size:', minimalPdf.length);
  res.send(minimalPdf);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Federal Bank UPI Integration Server with TDS Support');
  console.log('Endpoints:');
  console.log('- POST /create-vpa - Create VPA for user');
  console.log('- POST /collect - Create UPI collection request');
  console.log('- GET /status/:referenceId - Check transaction status');
  console.log('- GET /user-vpa/:userId - Get user VPA');
  console.log('- GET /transactions/:userId - Get user transactions');
  console.log('- POST /tds/rules - Add new TDS category');
  console.log('- GET /reports/tds - Get TDS report with filters');
  console.log('- POST /tds/transaction - Record TDS transaction');
});

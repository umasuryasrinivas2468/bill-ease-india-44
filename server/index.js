
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


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

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    service: 'Federal Bank UPI Integration'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Federal Bank UPI Integration Server');
  console.log('Endpoints:');
  console.log('- POST /create-vpa - Create VPA for user');
  console.log('- POST /collect - Create UPI collection request');
  console.log('- GET /status/:referenceId - Check transaction status');
  console.log('- GET /user-vpa/:userId - Get user VPA');
  console.log('- GET /transactions/:userId - Get user transactions');
});

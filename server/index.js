
const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Decentro configuration
const decentroConfig = {
  baseURL: process.env.DECENTRO_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'client_id': process.env.DECENTRO_CLIENT_ID,
    'client_secret': process.env.DECENTRO_CLIENT_SECRET,
    'module_secret': process.env.DECENTRO_MODULE_SECRET,
    'provider_secret': process.env.DECENTRO_PROVIDER_SECRET
  }
};

// Generate reference ID
const generateReferenceId = () => {
  return `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Generate expiry time
const generateExpiryTime = (minutes = 30) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() + minutes);
  return now.toISOString();
};

// POST /collect - Create UPI collection request
app.post('/collect', async (req, res) => {
  try {
    const {
      payer_upi,
      payee_account,
      amount,
      purpose_message,
      expiry_minutes = 30
    } = req.body;

    // Validate required fields
    if (!payer_upi || !payee_account || !amount || !purpose_message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }

    const reference_id = generateReferenceId();
    const expiry_time = generateExpiryTime(expiry_minutes);

    const requestData = {
      reference_id,
      payer_upi,
      payee_account,
      amount,
      purpose_message,
      expiry_time
    };

    console.log('Creating UPI collection request:', requestData);

    // Make request to Decentro
    const response = await axios.post(
      `${decentroConfig.baseURL}/v2/payments/collection`,
      requestData,
      { headers: decentroConfig.headers }
    );

    console.log('Decentro response:', response.data);

    res.json({
      success: true,
      data: {
        reference_id,
        decentroTxnId: response.data.decentroTxnId,
        transactionId: response.data.data?.transactionId,
        status: response.data.status,
        expiry_time
      }
    });

  } catch (error) {
    console.error('Error creating UPI collection:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create UPI collection request',
      details: error.response?.data || error.message
    });
  }
});

// POST /webhook - Handle Decentro webhooks
app.post('/webhook', (req, res) => {
  try {
    console.log('Received webhook:', req.body);
    
    const { reference_id, status, transaction_id } = req.body;
    
    // Here you would typically:
    // 1. Validate webhook signature
    // 2. Update database with payment status
    // 3. Send notifications to users
    
    console.log(`Payment ${reference_id} status updated to: ${status}`);
    
    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: 'Webhook processing failed' });
  }
});

// GET /status/:transactionId - Check transaction status
app.get('/status/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    
    const response = await axios.get(
      `${decentroConfig.baseURL}/v2/payments/status/${transactionId}`,
      { headers: decentroConfig.headers }
    );

    res.json({
      success: true,
      data: response.data
    });
  } catch (error) {
    console.error('Error checking status:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to check transaction status'
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Required env variables:');
  console.log('- DECENTRO_CLIENT_ID:', !!process.env.DECENTRO_CLIENT_ID);
  console.log('- DECENTRO_CLIENT_SECRET:', !!process.env.DECENTRO_CLIENT_SECRET);
  console.log('- DECENTRO_MODULE_SECRET:', !!process.env.DECENTRO_MODULE_SECRET);
  console.log('- DECENTRO_PROVIDER_SECRET:', !!process.env.DECENTRO_PROVIDER_SECRET);
});

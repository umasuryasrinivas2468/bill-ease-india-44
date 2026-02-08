
const axios = require('axios');

class FederalBankService {
  constructor() {
    this.baseURL = 'https://devgateway.federalbank.co.in/fedbnkdev/dev/upi';
    this.tokenURL = 'https://devgateway.federalbank.co.in/fedbnkdev/dev/oauth2/token';
    this.clientId = 'e0fdac6263dca74964961bafb6c1a2e5';
    this.clientSecret = '9dc12fc2ec301516462f9dc90b34fcea';
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  async getAccessToken() {
    // Return cached token if still valid
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const response = await axios.post(this.tokenURL, {
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      // Set expiry to 5 minutes before actual expiry for safety
      this.tokenExpiry = Date.now() + ((response.data.expires_in - 300) * 1000);
      
      console.log('OAuth2 token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('Error obtaining OAuth2 token:', error.response?.data || error.message);
      throw new Error('Failed to authenticate with Federal Bank');
    }
  }

  async createVPA(userData) {
    const token = await this.getAccessToken();
    
    const requestBody = {
      MerchantBody: {
        VirtualID: `${userData.businessName.toLowerCase().replace(/\s+/g, '')}${Date.now()}@fede`,
        CustomerName: userData.businessName,
        AccountNumber: userData.accountNumber,
        IFSC: userData.ifscCode,
        MobileNumber: userData.phone,
        Email: userData.email
      }
    };

    try {
      const response = await axios.post(this.baseURL, requestBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-ibm-name': 'upivirtualidcreationapi',
          'Content-Type': 'application/json'
        }
      });

      console.log('VPA created successfully:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error creating VPA:', error.response?.data || error.message);
      throw new Error('Failed to create VPA');
    }
  }

  generateUPILink(vpa, payeeName, amount, description) {
    const upiString = `upi://pay?pa=${vpa}&pn=${encodeURIComponent(payeeName)}&am=${amount}&cu=INR&tn=${encodeURIComponent(description)}`;
    return upiString;
  }

  async checkTransactionStatus(transactionId, transactionRefId = null) {
    const token = await this.getAccessToken();
    
    const requestBody = {
      TranRefEnqBody: {
        TransactionId: transactionId
      }
    };

    if (transactionRefId) {
      requestBody.TranRefEnqBody.TransactionRefId = transactionRefId;
    }

    try {
      const response = await axios.post(`${this.baseURL}/v1.0.0`, requestBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-ibm-name': 'upitransactionrefenq',
          'Content-Type': 'application/json'
        }
      });

      console.log('Transaction status checked:', response.data);
      return response.data;
    } catch (error) {
      console.error('Error checking transaction status:', error.response?.data || error.message);
      throw new Error('Failed to check transaction status');
    }
  }
}

module.exports = new FederalBankService();

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { paymentsService, PaymentLinkRequest, PaymentLinkResponse } from '../paymentsService';

// Mock fetch globally
global.fetch = vi.fn();

describe('PaymentsService', () => {
  const mockPaymentRequest: PaymentLinkRequest = {
    amount: 1000,
    description: 'Payment for services',
    vendorId: '1',
    vendorEmail: 'vendor@example.com',
    vendorName: 'Test Vendor'
  };

  const mockPaymentResponse: PaymentLinkResponse = {
    success: true,
    data: {
      paymentLinkId: 'plink_123',
      razorpayLink: 'https://razorpay.me/test123',
      shortUrl: 'https://rzp.io/l/test123',
      amount: 1000,
      description: 'Payment for services',
      status: 'created',
      expiryTime: '2024-12-31T23:59:59.000Z',
      customerId: '1'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Happy Path', () => {
    it('should create payment link successfully', async () => {
      // Mock successful API response
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockPaymentResponse
      });

      const result = await paymentsService.createPaymentLink(mockPaymentRequest);

      expect(fetch).toHaveBeenCalledWith('/api/payments/create-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mockPaymentRequest)
      });

      expect(result).toEqual(mockPaymentResponse);
    });

    it('should get payment status successfully', async () => {
      const mockStatusResponse = {
        success: true,
        data: {
          paymentLinkId: 'plink_123',
          status: 'paid',
          paidAt: '2024-01-15T10:30:00.000Z',
          amount: 1000,
          paymentId: 'pay_123',
          method: 'upi'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockStatusResponse
      });

      const result = await paymentsService.getPaymentStatus('plink_123');

      expect(fetch).toHaveBeenCalledWith('/api/payments/status/plink_123', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      expect(result).toEqual(mockStatusResponse);
    });
  });

  describe('Input Verification', () => {
    it('should validate required fields in payment request', async () => {
      const invalidRequest = {
        amount: 0,
        description: '',
        vendorId: '',
        vendorEmail: '',
        vendorName: ''
      };

      await expect(paymentsService.createPaymentLink(invalidRequest)).rejects.toThrow(
        'Invalid payment request: amount must be greater than 0'
      );
    });

    it('should validate email format', async () => {
      const invalidEmailRequest = {
        ...mockPaymentRequest,
        vendorEmail: 'invalid-email'
      };

      await expect(paymentsService.createPaymentLink(invalidEmailRequest)).rejects.toThrow(
        'Invalid email format'
      );
    });

    it('should validate amount limits', async () => {
      const highAmountRequest = {
        ...mockPaymentRequest,
        amount: 10000000 // Exceeding limit
      };

      await expect(paymentsService.createPaymentLink(highAmountRequest)).rejects.toThrow(
        'Amount cannot exceed ₹1,000,000'
      );
    });
  });

  describe('Exception Handling', () => {
    it('should handle API error response', async () => {
      const errorResponse = {
        success: false,
        error: 'Payment link creation failed',
        code: 'RAZORPAY_ERROR'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse
      });

      await expect(paymentsService.createPaymentLink(mockPaymentRequest)).rejects.toThrow(
        'Payment link creation failed'
      );
    });

    it('should handle network errors', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(paymentsService.createPaymentLink(mockPaymentRequest)).rejects.toThrow(
        'Network error'
      );
    });

    it('should handle invalid JSON response', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      });

      await expect(paymentsService.createPaymentLink(mockPaymentRequest)).rejects.toThrow(
        'Failed to parse response'
      );
    });

    it('should handle server errors (500)', async () => {
      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Internal server error' })
      });

      await expect(paymentsService.createPaymentLink(mockPaymentRequest)).rejects.toThrow(
        'Internal server error'
      );
    });
  });

  describe('Email Sending', () => {
    it('should send payment link email successfully', async () => {
      const emailRequest = {
        paymentLinkId: 'plink_123',
        recipientEmail: 'customer@example.com',
        recipientName: 'Test Customer',
        amount: 1000,
        description: 'Payment for services',
        paymentLink: 'https://razorpay.me/test123'
      };

      const emailResponse = {
        success: true,
        data: {
          emailId: 'email_123',
          status: 'sent',
          sentAt: '2024-01-15T10:00:00.000Z'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => emailResponse
      });

      const result = await paymentsService.sendPaymentLinkEmail(emailRequest);

      expect(fetch).toHaveBeenCalledWith('/api/payments/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailRequest)
      });

      expect(result).toEqual(emailResponse);
    });

    it('should handle email sending failure', async () => {
      const emailRequest = {
        paymentLinkId: 'plink_123',
        recipientEmail: 'invalid@example.com',
        recipientName: 'Test Customer',
        amount: 1000,
        description: 'Payment for services',
        paymentLink: 'https://razorpay.me/test123'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: 'Invalid email address'
        })
      });

      await expect(paymentsService.sendPaymentLinkEmail(emailRequest)).rejects.toThrow(
        'Invalid email address'
      );
    });
  });

  describe('Payment Status Tracking', () => {
    it('should handle payment status updates', async () => {
      const statusUpdate = {
        success: true,
        data: {
          paymentLinkId: 'plink_123',
          status: 'paid',
          paidAt: '2024-01-15T10:30:00.000Z',
          amount: 1000,
          paymentId: 'pay_123',
          method: 'card',
          card: {
            network: 'Visa',
            last4: '1234'
          }
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => statusUpdate
      });

      const result = await paymentsService.getPaymentStatus('plink_123');

      expect(result.data.status).toBe('paid');
      expect(result.data.method).toBe('card');
      expect(result.data.card?.last4).toBe('1234');
    });

    it('should handle expired payment links', async () => {
      const expiredStatus = {
        success: true,
        data: {
          paymentLinkId: 'plink_123',
          status: 'expired',
          expiredAt: '2024-01-14T23:59:59.000Z',
          amount: 1000
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => expiredStatus
      });

      const result = await paymentsService.getPaymentStatus('plink_123');

      expect(result.data.status).toBe('expired');
    });
  });

  describe('Payment Methods Integration', () => {
    it('should handle UPI payment completion', async () => {
      const upiPayment = {
        success: true,
        data: {
          paymentLinkId: 'plink_123',
          status: 'paid',
          method: 'upi',
          upi: {
            vpa: 'customer@paytm'
          },
          amount: 1000,
          paidAt: '2024-01-15T10:30:00.000Z'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => upiPayment
      });

      const result = await paymentsService.getPaymentStatus('plink_123');

      expect(result.data.method).toBe('upi');
      expect(result.data.upi?.vpa).toBe('customer@paytm');
    });

    it('should handle net banking payment completion', async () => {
      const netBankingPayment = {
        success: true,
        data: {
          paymentLinkId: 'plink_123',
          status: 'paid',
          method: 'netbanking',
          bank: 'HDFC Bank',
          amount: 1000,
          paidAt: '2024-01-15T10:30:00.000Z'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => netBankingPayment
      });

      const result = await paymentsService.getPaymentStatus('plink_123');

      expect(result.data.method).toBe('netbanking');
      expect(result.data.bank).toBe('HDFC Bank');
    });
  });
});
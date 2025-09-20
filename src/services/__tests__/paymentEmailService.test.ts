import { describe, it, expect, vi, beforeEach } from 'vitest';
import { paymentEmailService, EmailTemplate, PaymentEmailRequest } from '../paymentEmailService';

// Mock fetch
global.fetch = vi.fn();

describe('PaymentEmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEmailRequest: PaymentEmailRequest = {
    to: 'customer@example.com',
    customerName: 'John Doe',
    amount: 1500,
    description: 'Payment for web development services',
    paymentLink: 'https://razorpay.me/abc123',
    businessName: 'Tech Solutions Ltd',
    dueDate: '2024-02-15'
  };

  describe('Happy Path', () => {
    it('should send payment email successfully', async () => {
      const mockResponse = {
        success: true,
        data: {
          messageId: 'msg_123456',
          status: 'sent',
          sentAt: '2024-01-15T10:00:00.000Z'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
      });

      const result = await paymentEmailService.sendPaymentEmail(mockEmailRequest);

      expect(fetch).toHaveBeenCalledWith('/api/email/payment-link', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mockEmailRequest)
      });

      expect(result).toEqual(mockResponse);
    });

    it('should generate correct email template', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);

      expect(template.subject).toContain('Payment Request');
      expect(template.subject).toContain('Tech Solutions Ltd');
      expect(template.htmlBody).toContain('John Doe');
      expect(template.htmlBody).toContain('₹1,500');
      expect(template.htmlBody).toContain('Payment for web development services');
      expect(template.htmlBody).toContain('https://razorpay.me/abc123');
      expect(template.textBody).toContain('John Doe');
      expect(template.textBody).toContain('₹1,500');
    });
  });

  describe('Input Verification', () => {
    it('should validate required email fields', async () => {
      const invalidRequest = {
        ...mockEmailRequest,
        to: ''
      };

      await expect(paymentEmailService.sendPaymentEmail(invalidRequest))
        .rejects.toThrow('Recipient email is required');
    });

    it('should validate email format', async () => {
      const invalidEmailRequest = {
        ...mockEmailRequest,
        to: 'invalid-email'
      };

      await expect(paymentEmailService.sendPaymentEmail(invalidEmailRequest))
        .rejects.toThrow('Invalid email format');
    });

    it('should validate amount is positive', async () => {
      const invalidAmountRequest = {
        ...mockEmailRequest,
        amount: -100
      };

      await expect(paymentEmailService.sendPaymentEmail(invalidAmountRequest))
        .rejects.toThrow('Amount must be greater than 0');
    });

    it('should validate payment link format', async () => {
      const invalidLinkRequest = {
        ...mockEmailRequest,
        paymentLink: 'invalid-url'
      };

      await expect(paymentEmailService.sendPaymentEmail(invalidLinkRequest))
        .rejects.toThrow('Invalid payment link URL');
    });
  });

  describe('Template Generation', () => {
    it('should include all required fields in HTML template', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);
      
      // Check HTML body contains all required elements
      expect(template.htmlBody).toContain('Dear John Doe');
      expect(template.htmlBody).toContain('₹1,500');
      expect(template.htmlBody).toContain('Payment for web development services');
      expect(template.htmlBody).toContain('Tech Solutions Ltd');
      expect(template.htmlBody).toContain('href="https://razorpay.me/abc123"');
      expect(template.htmlBody).toContain('Pay Now');
    });

    it('should include payment methods information in template', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);
      
      expect(template.htmlBody).toContain('UPI');
      expect(template.htmlBody).toContain('Credit Card');
      expect(template.htmlBody).toContain('Debit Card');
      expect(template.htmlBody).toContain('Net Banking');
    });

    it('should include security information in template', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);
      
      expect(template.htmlBody).toContain('secure payment');
      expect(template.htmlBody).toContain('Razorpay');
      expect(template.htmlBody).toContain('SSL encrypted');
    });

    it('should include due date when provided', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);
      
      expect(template.htmlBody).toContain('Due Date: February 15, 2024');
    });

    it('should handle missing due date gracefully', () => {
      const requestWithoutDueDate = {
        ...mockEmailRequest,
        dueDate: undefined
      };
      
      const template = paymentEmailService.generateEmailTemplate(requestWithoutDueDate);
      
      expect(template.htmlBody).not.toContain('Due Date:');
    });

    it('should generate plain text version', () => {
      const template = paymentEmailService.generateEmailTemplate(mockEmailRequest);
      
      expect(template.textBody).toContain('Dear John Doe');
      expect(template.textBody).toContain('₹1,500');
      expect(template.textBody).toContain('Payment for web development services');
      expect(template.textBody).toContain('https://razorpay.me/abc123');
      expect(template.textBody).not.toContain('<');
      expect(template.textBody).not.toContain('html');
    });
  });

  describe('Exception Handling', () => {
    it('should handle email service errors', async () => {
      const errorResponse = {
        success: false,
        error: 'Email service unavailable',
        code: 'SERVICE_ERROR'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => errorResponse
      });

      await expect(paymentEmailService.sendPaymentEmail(mockEmailRequest))
        .rejects.toThrow('Email service unavailable');
    });

    it('should handle network errors', async () => {
      (fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(paymentEmailService.sendPaymentEmail(mockEmailRequest))
        .rejects.toThrow('Network error');
    });

    it('should handle invalid recipient email from server', async () => {
      const errorResponse = {
        success: false,
        error: 'Invalid recipient email address',
        code: 'INVALID_EMAIL'
      };

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => errorResponse
      });

      await expect(paymentEmailService.sendPaymentEmail(mockEmailRequest))
        .rejects.toThrow('Invalid recipient email address');
    });

    it('should handle rate limiting', async () => {
      const rateLimitError = {
        success: false,
        error: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60
      };

      (fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => rateLimitError
      });

      await expect(paymentEmailService.sendPaymentEmail(mockEmailRequest))
        .rejects.toThrow('Rate limit exceeded. Please try again later.');
    });
  });

  describe('Email Tracking', () => {
    it('should track email delivery status', async () => {
      const trackingResponse = {
        success: true,
        data: {
          messageId: 'msg_123456',
          status: 'delivered',
          deliveredAt: '2024-01-15T10:05:00.000Z',
          opens: 1,
          clicks: 0
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => trackingResponse
      });

      const result = await paymentEmailService.getEmailStatus('msg_123456');

      expect(fetch).toHaveBeenCalledWith('/api/email/status/msg_123456', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      expect(result.data.status).toBe('delivered');
      expect(result.data.opens).toBe(1);
    });

    it('should handle email bounce', async () => {
      const bounceResponse = {
        success: true,
        data: {
          messageId: 'msg_123456',
          status: 'bounced',
          bouncedAt: '2024-01-15T10:02:00.000Z',
          bounceReason: 'Invalid email address'
        }
      };

      (fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => bounceResponse
      });

      const result = await paymentEmailService.getEmailStatus('msg_123456');

      expect(result.data.status).toBe('bounced');
      expect(result.data.bounceReason).toBe('Invalid email address');
    });
  });

  describe('Email Customization', () => {
    it('should support custom email template', () => {
      const customRequest = {
        ...mockEmailRequest,
        customMessage: 'This is an urgent payment request. Please process immediately.',
        businessLogo: 'https://example.com/logo.png'
      };

      const template = paymentEmailService.generateEmailTemplate(customRequest);

      expect(template.htmlBody).toContain('This is an urgent payment request');
      expect(template.htmlBody).toContain('src="https://example.com/logo.png"');
    });

    it('should handle missing business name gracefully', () => {
      const requestWithoutBusiness = {
        ...mockEmailRequest,
        businessName: undefined
      };

      const template = paymentEmailService.generateEmailTemplate(requestWithoutBusiness);

      expect(template.subject).not.toContain('undefined');
      expect(template.htmlBody).not.toContain('undefined');
    });

    it('should format currency correctly for different amounts', () => {
      const testCases = [
        { amount: 100, expected: '₹100' },
        { amount: 1000, expected: '₹1,000' },
        { amount: 100000, expected: '₹1,00,000' },
        { amount: 1500.50, expected: '₹1,500.50' }
      ];

      testCases.forEach(({ amount, expected }) => {
        const request = { ...mockEmailRequest, amount };
        const template = paymentEmailService.generateEmailTemplate(request);
        
        expect(template.htmlBody).toContain(expected);
        expect(template.textBody).toContain(expected);
      });
    });
  });
});
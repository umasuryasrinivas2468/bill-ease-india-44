export interface PaymentLinkRequest {
  amount: number;
  description: string;
  vendorId: string;
  vendorEmail: string;
  vendorName: string;
}

export interface PaymentLinkResponse {
  success: boolean;
  data?: {
    paymentLinkId: string;
    razorpayLink: string;
    shortUrl: string;
    amount: number;
    description: string;
    status: string;
    expiryTime: string;
    customerId: string;
  };
  error?: string;
}

class PaymentsService {
  private baseURL = '/api/payments';
  private maxAmount = 1000000; // ₹10,00,000

  async createPaymentLink(request: PaymentLinkRequest): Promise<PaymentLinkResponse> {
    // Input validation
    this.validatePaymentRequest(request);

    try {
      const response = await fetch(`${this.baseURL}/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Payment link creation failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to parse response');
    }
  }

  async getPaymentStatus(paymentLinkId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/status/${paymentLinkId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get payment status');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to check payment status');
    }
  }

  async sendPaymentLinkEmail(emailRequest: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(emailRequest)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to send email');
    }
  }

  private validatePaymentRequest(request: PaymentLinkRequest): void {
    if (!request.amount || request.amount <= 0) {
      throw new Error('Invalid payment request: amount must be greater than 0');
    }

    if (request.amount > this.maxAmount) {
      throw new Error('Amount cannot exceed ₹1,000,000');
    }

    if (!this.isValidEmail(request.vendorEmail)) {
      throw new Error('Invalid email format');
    }

    if (!request.description || request.description.trim().length === 0) {
      throw new Error('Description is required');
    }

    if (!request.vendorId || request.vendorId.trim().length === 0) {
      throw new Error('Vendor ID is required');
    }

    if (!request.vendorName || request.vendorName.trim().length === 0) {
      throw new Error('Vendor name is required');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

export const paymentsService = new PaymentsService();
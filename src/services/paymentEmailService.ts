export interface PaymentEmailRequest {
  to: string;
  customerName: string;
  amount: number;
  description: string;
  paymentLink: string;
  businessName: string;
  dueDate?: string;
  customMessage?: string;
  businessLogo?: string;
}

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

class PaymentEmailService {
  private baseURL = '/api/email';

  async sendPaymentEmail(request: PaymentEmailRequest): Promise<any> {
    // Validate request
    this.validateEmailRequest(request);

    try {
      const response = await fetch(`${this.baseURL}/payment-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
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

  async getEmailStatus(messageId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/status/${messageId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get email status');
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to get email status');
    }
  }

  generateEmailTemplate(request: PaymentEmailRequest): EmailTemplate {
    const businessName = request.businessName || 'Your Business';
    const formattedAmount = this.formatCurrency(request.amount);
    const formattedDueDate = request.dueDate ? this.formatDate(request.dueDate) : null;

    const subject = `Payment Request from ${businessName} - ${formattedAmount}`;

    const htmlBody = this.generateHTMLTemplate(request, businessName, formattedAmount, formattedDueDate);
    const textBody = this.generateTextTemplate(request, businessName, formattedAmount, formattedDueDate);

    return {
      subject,
      htmlBody,
      textBody
    };
  }

  private validateEmailRequest(request: PaymentEmailRequest): void {
    if (!request.to || request.to.trim().length === 0) {
      throw new Error('Recipient email is required');
    }

    if (!this.isValidEmail(request.to)) {
      throw new Error('Invalid email format');
    }

    if (!request.amount || request.amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    if (!this.isValidURL(request.paymentLink)) {
      throw new Error('Invalid payment link URL');
    }
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2
    }).format(amount);
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private generateHTMLTemplate(
    request: PaymentEmailRequest,
    businessName: string,
    formattedAmount: string,
    formattedDueDate: string | null
  ): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Request</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; }
    .logo { max-height: 60px; margin-bottom: 10px; }
    .amount { font-size: 2em; font-weight: bold; color: #2563eb; margin: 20px 0; }
    .pay-button { 
      display: inline-block; 
      background-color: #2563eb; 
      color: white; 
      padding: 15px 30px; 
      text-decoration: none; 
      border-radius: 5px; 
      font-weight: bold; 
      margin: 20px 0; 
    }
    .payment-methods { background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0; }
    .footer { font-size: 0.9em; color: #666; text-align: center; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${request.businessLogo ? `<img src="${request.businessLogo}" alt="${businessName}" class="logo">` : ''}
      <h1>Payment Request</h1>
    </div>
    
    <p>Dear ${request.customerName},</p>
    
    <p>You have received a payment request from <strong>${businessName}</strong>.</p>
    
    <div class="amount">${formattedAmount}</div>
    
    <p><strong>Description:</strong> ${request.description}</p>
    
    ${formattedDueDate ? `<p><strong>Due Date:</strong> ${formattedDueDate}</p>` : ''}
    
    ${request.customMessage ? `<p><em>${request.customMessage}</em></p>` : ''}
    
    <div style="text-align: center;">
      <a href="${request.paymentLink}" class="pay-button">Pay Now</a>
    </div>
    
    <div class="payment-methods">
      <h3>Accepted Payment Methods:</h3>
      <ul>
        <li><strong>UPI</strong> - Pay instantly using any UPI app</li>
        <li><strong>Credit Card</strong> - Visa, Mastercard, American Express</li>
        <li><strong>Debit Card</strong> - All major banks supported</li>
        <li><strong>Net Banking</strong> - 50+ banks supported</li>
      </ul>
    </div>
    
    <p>This is a secure payment link powered by Razorpay. Your payment information is protected with SSL encryption.</p>
    
    <div class="footer">
      <p>If you have any questions, please contact ${businessName}.</p>
      <p>This payment link is secure and SSL encrypted.</p>
    </div>
  </div>
</body>
</html>`;
  }

  private generateTextTemplate(
    request: PaymentEmailRequest,
    businessName: string,
    formattedAmount: string,
    formattedDueDate: string | null
  ): string {
    return `
Payment Request from ${businessName}

Dear ${request.customerName},

You have received a payment request from ${businessName}.

Amount: ${formattedAmount}
Description: ${request.description}
${formattedDueDate ? `Due Date: ${formattedDueDate}` : ''}

${request.customMessage || ''}

To make the payment, please click on the following link:
${request.paymentLink}

Accepted Payment Methods:
- UPI - Pay instantly using any UPI app
- Credit Card - Visa, Mastercard, American Express
- Debit Card - All major banks supported
- Net Banking - 50+ banks supported

This is a secure payment link powered by Razorpay. Your payment information is protected with SSL encryption.

If you have any questions, please contact ${businessName}.
`;
  }
}

export const paymentEmailService = new PaymentEmailService();

export interface DecentroUPIRequest {
  reference_id?: string;
  payer_upi: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  expiry_minutes?: number;
}

export interface DecentroResponse {
  success: boolean;
  data?: {
    reference_id: string;
    decentroTxnId: string;
    transactionId: string;
    status: string;
    expiry_time: string;
  };
  error?: string;
}

class UPICollectionService {
  private baseURL = 'http://localhost:3001'; // Backend URL

  async createUPICollectionRequest(request: DecentroUPIRequest): Promise<DecentroResponse> {
    try {
      console.log('Sending UPI collection request to backend:', request);
      
      const response = await fetch(`${this.baseURL}/collect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create UPI collection');
      }

      console.log('Backend response:', data);
      return data;
    } catch (error) {
      console.error('Error creating UPI collection:', error);
      throw error;
    }
  }

  async checkTransactionStatus(transactionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/status/${transactionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to check status');
      }

      return data;
    } catch (error) {
      console.error('Error checking transaction status:', error);
      throw error;
    }
  }

  generateReferenceId(): string {
    return `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateExpiryTime(minutes: number = 30): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    return now.toISOString();
  }
}

export const upiCollectionService = new UPICollectionService();

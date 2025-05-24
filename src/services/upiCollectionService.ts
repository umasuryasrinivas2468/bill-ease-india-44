
export interface DecentroUPIRequest {
  reference_id: string;
  payer_upi: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  expiry_time: string;
}

export interface DecentroResponse {
  decentroTxnId: string;
  status: string;
  data?: {
    transactionId: string;
    upiTransactionId?: string;
  };
}

class UPICollectionService {
  private baseURL = 'https://in.staging.decentro.tech';
  private headers = {
    'Content-Type': 'application/json',
    'client_id': 'ACZENTECHNOLOGIESPRIVATELIMITED_4_sop',
    'client_secret': 'bc7e05cc19314fc3801ae0ad3524b53c',
    'module_secret': 'b8a7f86c3f21443bb18fd98f089a5757',
    'provider_secret': '155bac90f4e142ac918fc3cfacb2495f'
  };

  generateReferenceId(): string {
    return `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateExpiryTime(minutes: number = 30): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() + minutes);
    return now.toISOString();
  }

  async createUPICollectionRequest(request: DecentroUPIRequest): Promise<DecentroResponse> {
    try {
      const response = await fetch(`${this.baseURL}/v2/payments/collection`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        throw new Error(`Failed to create UPI collection: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error creating UPI collection:', error);
      throw error;
    }
  }

  async checkTransactionStatus(transactionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/v2/payments/status/${transactionId}`, {
        method: 'GET',
        headers: this.headers
      });

      if (!response.ok) {
        throw new Error(`Failed to check status: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error checking transaction status:', error);
      throw error;
    }
  }
}

export const upiCollectionService = new UPICollectionService();

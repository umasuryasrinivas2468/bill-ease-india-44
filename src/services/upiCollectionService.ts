
interface DecentroUPIRequest {
  reference_id: string;
  payer_upi: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  expiry_time: string; // ISO 8601 format
}

interface DecentroUPIResponse {
  decentroTxnId: string;
  status: string;
  responseCode: string;
  message: string;
  data?: {
    transactionId: string;
    status: string;
  };
}

class UPICollectionService {
  private readonly baseURL = 'https://in.staging.decentro.tech';
  private readonly headers = {
    'client_id': 'ACZENTECHNOLOGIESPRIVATELIMITED_4_sop',
    'client_secret': 'bc7e05cc19314fc3801ae0ad3524b53c',
    'module_secret': 'b8a7f86c3f21443bb18fd98f089a5757',
    'provider_secret': '155bac90f4e142ac918fc3cfacb2495f',
    'Content-Type': 'application/json',
  };

  async createUPICollectionRequest(requestData: DecentroUPIRequest): Promise<DecentroUPIResponse> {
    try {
      console.log('Creating UPI collection request:', requestData);
      
      const response = await fetch(`${this.baseURL}/v2/payments/upi/link`, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('UPI collection response:', data);
      return data;
    } catch (error) {
      console.error('Error creating UPI collection request:', error);
      throw error;
    }
  }

  async checkTransactionStatus(transactionId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/v2/payments/transaction/${transactionId}/status`, {
        method: 'GET',
        headers: this.headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Transaction status:', data);
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
export type { DecentroUPIRequest, DecentroUPIResponse };


export interface CreateVPARequest {
  businessName: string;
  accountNumber: string;
  ifscCode: string;
  phone: string;
  email: string;
  userId: string;
}

export interface FederalBankUPIRequest {
  userId: string;
  amount: number;
  purpose_message: string;
  expiry_minutes?: number;
}

export interface FederalBankResponse {
  success: boolean;
  data?: {
    reference_id: string;
    vpa: string;
    upiLink: string;
    amount: number;
    purpose_message: string;
    expiry_time: string;
    status: string;
  };
  error?: string;
}

export interface VPAResponse {
  success: boolean;
  data?: {
    vpa: string;
    transactionId: string;
    status: string;
  };
  error?: string;
}

class UPICollectionService {
  private baseURL = 'http://localhost:3001';

  async createVPA(request: CreateVPARequest): Promise<VPAResponse> {
    try {
      console.log('Creating VPA for user:', request);
      
      const response = await fetch(`${this.baseURL}/create-vpa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create VPA');
      }

      console.log('VPA created successfully:', data);
      return data;
    } catch (error) {
      console.error('Error creating VPA:', error);
      throw error;
    }
  }

  async createUPICollectionRequest(request: FederalBankUPIRequest): Promise<FederalBankResponse> {
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

  async checkTransactionStatus(referenceId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/status/${referenceId}`, {
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

  async getUserVPA(userId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/user-vpa/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get user VPA');
      }

      return data;
    } catch (error) {
      console.error('Error getting user VPA:', error);
      throw error;
    }
  }

  async getUserTransactions(userId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseURL}/transactions/${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get transactions');
      }

      return data;
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }

  generateReferenceId(): string {
    return `UPI_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export const upiCollectionService = new UPICollectionService();

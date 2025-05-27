
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { upiCollectionService, FederalBankUPIRequest, CreateVPARequest } from '@/services/upiCollectionService';
import { useBusinessData } from './useBusinessData';

export interface UPICollection {
  id: string;
  userId: string;
  invoice_id?: string;
  reference_id: string;
  vpa: string;
  amount: number;
  purpose_message: string;
  upiLink: string;
  expiry_time: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  created_at: string;
  payer_vpa?: string;
  transaction_ref_id?: string;
  completed_at?: string;
}

export const useCreateVPA = () => {
  const { user } = useUser();
  const { getBusinessInfo, getBankDetails } = useBusinessData();
  
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const businessInfo = getBusinessInfo();
      const bankDetails = getBankDetails();
      
      if (!businessInfo || !bankDetails) {
        throw new Error('Business information or bank details not found. Please complete onboarding first.');
      }

      const vpaRequest: CreateVPARequest = {
        businessName: businessInfo.businessName,
        accountNumber: bankDetails.accountNumber,
        ifscCode: bankDetails.ifscCode,
        phone: businessInfo.phone,
        email: businessInfo.email,
        userId: user.id
      };
      
      console.log('Creating VPA for user:', vpaRequest);
      const response = await upiCollectionService.createVPA(vpaRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create VPA');
      }
      
      return response.data;
    },
  });
};

export const useUserVPA = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['user-vpa', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      try {
        const response = await upiCollectionService.getUserVPA(user.id);
        return response.data;
      } catch (error) {
        // VPA doesn't exist yet
        return null;
      }
    },
    enabled: !!user,
  });
};

export const useUPICollections = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['upi-collections', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const response = await upiCollectionService.getUserTransactions(user.id);
      return response.data as UPICollection[];
    },
    enabled: !!user,
  });
};

export const useCreateUPICollection = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  return useMutation({
    mutationFn: async (collectionData: {
      invoice_id?: string;
      amount: number;
      purpose_message: string;
      expiry_minutes?: number;
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      const federalBankRequest: FederalBankUPIRequest = {
        userId: user.id,
        amount: collectionData.amount,
        purpose_message: collectionData.purpose_message,
        expiry_minutes: collectionData.expiry_minutes || 30,
      };
      
      console.log('Creating UPI collection request:', federalBankRequest);
      const response = await upiCollectionService.createUPICollectionRequest(federalBankRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create UPI collection');
      }
      
      return { 
        id: response.data!.reference_id,
        userId: user.id,
        ...collectionData,
        reference_id: response.data!.reference_id,
        vpa: response.data!.vpa,
        upiLink: response.data!.upiLink,
        expiry_time: response.data!.expiry_time,
        status: 'pending' as const,
        created_at: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upi-collections'] });
    },
  });
};

export const useCheckUPIStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (referenceId: string) => {
      return await upiCollectionService.checkTransactionStatus(referenceId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upi-collections'] });
    },
  });
};

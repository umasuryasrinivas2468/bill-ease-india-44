
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { upiCollectionService, DecentroUPIRequest } from '@/services/upiCollectionService';

export interface UPICollection {
  id: string;
  user_id: string;
  invoice_id?: string;
  reference_id: string;
  payer_upi: string;
  payee_account: string;
  amount: number;
  purpose_message: string;
  expiry_time: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  decentro_txn_id?: string;
  transaction_id?: string;
  created_at: string;
  updated_at: string;
}

export const useUPICollections = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['upi-collections', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      // For now, return empty array since we don't have database integration yet
      console.log('UPI Collections - user authenticated:', user.id);
      return [] as UPICollection[];
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
      payer_upi: string;
      payee_account: string;
      amount: number;
      purpose_message: string;
      expiry_minutes?: number;
    }) => {
      if (!user) throw new Error('User not authenticated');
      
      const decentroRequest: DecentroUPIRequest = {
        payer_upi: collectionData.payer_upi,
        payee_account: collectionData.payee_account,
        amount: collectionData.amount,
        purpose_message: collectionData.purpose_message,
        expiry_minutes: collectionData.expiry_minutes || 30,
      };
      
      console.log('Creating UPI collection request:', decentroRequest);
      const response = await upiCollectionService.createUPICollectionRequest(decentroRequest);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create UPI collection');
      }
      
      return { 
        id: response.data!.reference_id,
        user_id: user.id,
        ...collectionData,
        reference_id: response.data!.reference_id,
        expiry_time: response.data!.expiry_time,
        status: 'pending' as const,
        decentro_txn_id: response.data!.decentroTxnId,
        transaction_id: response.data!.transactionId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upi-collections'] });
    },
  });
};

export const useCheckUPIStatus = () => {
  return useMutation({
    mutationFn: async (transactionId: string) => {
      return await upiCollectionService.checkTransactionStatus(transactionId);
    },
  });
};

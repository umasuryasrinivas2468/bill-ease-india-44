
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
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
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['upi-collections', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('upi_collections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching UPI collections:', error);
        throw error;
      }
      
      return data as UPICollection[];
    },
    enabled: !!user,
  });
};

export const useCreateUPICollection = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
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
      
      const reference_id = upiCollectionService.generateReferenceId();
      const expiry_time = upiCollectionService.generateExpiryTime(collectionData.expiry_minutes || 30);
      
      // Create UPI collection request with Decentro
      const decentroRequest: DecentroUPIRequest = {
        reference_id,
        payer_upi: collectionData.payer_upi,
        payee_account: collectionData.payee_account,
        amount: collectionData.amount,
        purpose_message: collectionData.purpose_message,
        expiry_time,
      };
      
      const decentroResponse = await upiCollectionService.createUPICollectionRequest(decentroRequest);
      
      // Save to database
      const { data, error } = await supabase
        .from('upi_collections')
        .insert([{
          user_id: user.id,
          invoice_id: collectionData.invoice_id || null,
          reference_id,
          payer_upi: collectionData.payer_upi,
          payee_account: collectionData.payee_account,
          amount: collectionData.amount,
          purpose_message: collectionData.purpose_message,
          expiry_time,
          status: 'pending',
          decentro_txn_id: decentroResponse.decentroTxnId,
          transaction_id: decentroResponse.data?.transactionId,
        }])
        .select()
        .single();
      
      if (error) {
        console.error('Error saving UPI collection:', error);
        throw error;
      }
      
      return { ...data, decentroResponse };
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

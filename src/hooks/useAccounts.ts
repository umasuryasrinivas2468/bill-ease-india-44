import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

export interface Account {
  id: string;
  user_id: string;
  account_code: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense';
  opening_balance: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useAccounts = () => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['accounts', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', normalizedUserId)
        .eq('is_active', true)
        .order('account_code');

      if (error) {
        throw new Error(`Failed to fetch accounts: ${error.message}`);
      }

      return data as Account[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useAccountsByType = (accountType: Account['account_type']) => {
  const { user } = useUser();
  
  return useQuery({
    queryKey: ['accounts', user?.id, accountType],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', normalizedUserId)
        .eq('account_type', accountType)
        .eq('is_active', true)
        .order('account_name');

      if (error) {
        throw new Error(`Failed to fetch ${accountType} accounts: ${error.message}`);
      }

      return data as Account[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateAccount = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (accountData: Omit<Account, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('accounts')
        .insert({
          ...accountData,
          user_id: normalizedUserId,
        })
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to create account: ${error.message}`);
      }

      return data as Account;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      
      toast({
        title: 'Account Created',
        description: 'New account has been created successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Account Creation Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    },
  });
};
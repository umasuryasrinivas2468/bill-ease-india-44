import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface TDSMaster {
  id: string;
  user_id: string;
  section_code: string;
  description?: string;
  rate: number;
  threshold_amount: number;
  payee_type: 'individual' | 'company';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const useTDSMasters = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['tds-masters', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('tds_master')
        .select('*')
        .eq('user_id', normalizedUserId)
        .or('user_id.eq.system,user_id.eq.' + normalizedUserId)
        .order('section_code');
      if (error) throw error;
      return data as TDSMaster[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateTDSMaster = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: Partial<TDSMaster>) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('tds_master')
        .insert({ ...payload, user_id: normalizedUserId })
        .select()
        .single();
      if (error) throw error;
      return data as TDSMaster;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-masters'] });
      toast({ title: 'Created', description: 'TDS rule created' });
    },
  });
};

export const useUpdateTDSMaster = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TDSMaster> }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      const { data: updated, error } = await supabase
        .from('tds_master')
        .update(data)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return updated as TDSMaster;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-masters'] });
      toast({ title: 'Updated', description: 'TDS rule updated' });
    },
  });
};

export const useTDSDeposits = (filters?: { startDate?: string; endDate?: string }) => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['tds-deposits', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      let query = supabase.from('tds_deposits').select('*').eq('user_id', normalizedUserId);
      if (filters?.startDate) query = query.gte('deposit_date', filters.startDate);
      if (filters?.endDate) query = query.lte('deposit_date', filters.endDate);
      const { data, error } = await query.order('deposit_date', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateTDSDeposit = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: { tds_transaction_id: string; deposit_date: string; amount: number; reference?: string }) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('tds_deposits')
        .insert({ ...payload, user_id: normalizedUserId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-deposits'] });
      toast({ title: 'Deposited', description: 'TDS deposit recorded' });
    },
  });
};

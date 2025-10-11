import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import type { TDSRule, CreateTDSRuleData } from '@/types/tds';

export interface UpdateTDSRuleData extends Partial<CreateTDSRuleData> {
  is_active?: boolean;
}

export const useTDSRules = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['tds-rules', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated or invalid user ID');
      }
      
      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('tds_rules')
        .select('*')
        .eq('user_id', normalizedUserId)
        .eq('is_active', true)
        .order('category');

      if (error) throw error;
      return data as TDSRule[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCreateTDSRule = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleData: CreateTDSRuleData) => {
      if (!user || !isValidUserId(user.id)) {
        throw new Error('User not authenticated');
      }

      const normalizedUserId = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('tds_rules')
        .insert([{
          ...ruleData,
          user_id: normalizedUserId,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-rules'] });
      toast({
        title: "Success",
        description: "TDS rule created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create TDS rule.",
        variant: "destructive",
      });
    },
  });
};

export const useUpdateTDSRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateTDSRuleData }) => {
      const { data, error } = await supabase
        .from('tds_rules')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-rules'] });
      toast({
        title: "Success",
        description: "TDS rule updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update TDS rule.",
        variant: "destructive",
      });
    },
  });
};

export const useDeleteTDSRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('tds_rules')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tds-rules'] });
      toast({
        title: "Success",
        description: "TDS rule deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete TDS rule.",
        variant: "destructive",
      });
    },
  });
};

// Utility function to calculate TDS
export const calculateTDS = (amount: number, rate: number) => {
  const tdsAmount = Math.round(amount * rate / 100 * 100) / 100;
  const netPayable = Math.round((amount - tdsAmount) * 100) / 100;
  return { tdsAmount, netPayable };
};
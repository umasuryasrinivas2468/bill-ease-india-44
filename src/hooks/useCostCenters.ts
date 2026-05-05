import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface CostCenter {
  id: string;
  user_id: string;
  code: string;
  name: string;
  type: 'department' | 'project' | 'branch' | 'team' | 'product' | 'other';
  parent_id: string | null;
  description: string | null;
  budget_amount: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CostCenterSpend extends CostCenter {
  bill_spend: number;
  expense_spend: number;
  total_spend: number;
}

export const useCostCenters = (opts: { activeOnly?: boolean } = {}) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['cost-centers', user?.id, opts.activeOnly],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('cost_centers')
        .select('*')
        .eq('user_id', uid)
        .order('code', { ascending: true });
      if (opts.activeOnly) q = q.eq('is_active', true);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CostCenter[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useCostCenterSpend = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['cost-center-spend', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('v_cost_center_spend')
        .select('*')
        .eq('user_id', uid);
      if (error) throw error;
      return (data || []) as CostCenterSpend[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useUpsertCostCenter = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<CostCenter> & { code: string; name: string }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const payload = {
        user_id: uid,
        code: input.code,
        name: input.name,
        type: input.type || 'department',
        parent_id: input.parent_id || null,
        description: input.description || null,
        budget_amount: input.budget_amount ?? 0,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from('cost_centers')
          .update(payload)
          .eq('id', input.id)
          .eq('user_id', uid)
          .select()
          .single();
        if (error) throw error;
        return data as CostCenter;
      }
      const { data, error } = await supabase
        .from('cost_centers')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as CostCenter;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-centers'] });
      qc.invalidateQueries({ queryKey: ['cost-center-spend'] });
      toast({ title: 'Cost center saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};

export const useDeleteCostCenter = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const { error } = await supabase
        .from('cost_centers')
        .delete()
        .eq('id', id)
        .eq('user_id', uid);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-centers'] });
      toast({ title: 'Cost center deleted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};

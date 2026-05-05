import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export interface AccountingPeriod {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  label: string | null;
  status: 'open' | 'soft_closed' | 'locked';
  locked_at: string | null;
  locked_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useAccountingPeriods = () => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['accounting-periods', user?.id],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .eq('user_id', uid)
        .order('period_start', { ascending: false });
      if (error) throw error;
      return (data || []) as AccountingPeriod[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

/**
 * Returns true when the supplied date sits in any locked period for the current user.
 * Use this client-side to surface a friendly error before the DB trigger fires.
 */
export const useIsPeriodLocked = (date?: string) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['period-locked', user?.id, date],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id) || !date) return false;
      const uid = normalizeUserId(user.id);
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('id')
        .eq('user_id', uid)
        .eq('status', 'locked')
        .lte('period_start', date)
        .gte('period_end', date)
        .limit(1);
      if (error) return false;
      return (data?.length || 0) > 0;
    },
    enabled: !!user && !!date && isValidUserId(user?.id),
  });
};

export const useUpsertPeriod = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<AccountingPeriod> & { period_start: string; period_end: string }) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      const payload: any = {
        user_id: uid,
        period_start: input.period_start,
        period_end: input.period_end,
        label: input.label || null,
        status: input.status || 'open',
        notes: input.notes || null,
      };
      if (input.status === 'locked') {
        payload.locked_at = new Date().toISOString();
        payload.locked_by = user.primaryEmailAddress?.emailAddress || user.id;
      }
      if (input.id) {
        const { data, error } = await supabase
          .from('accounting_periods')
          .update(payload)
          .eq('id', input.id)
          .eq('user_id', uid)
          .select()
          .single();
        if (error) throw error;
        return data as AccountingPeriod;
      }
      const { data, error } = await supabase
        .from('accounting_periods')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as AccountingPeriod;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting-periods'] });
      qc.invalidateQueries({ queryKey: ['period-locked'] });
      toast({ title: 'Accounting period saved' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
};

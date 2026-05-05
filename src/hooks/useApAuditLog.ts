import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export type ApAuditEntity =
  | 'bill' | 'payment' | 'advance' | 'advance_adjustment' | 'expense'
  | 'allocation' | 'vendor' | 'period_lock';
export type ApAuditAction =
  | 'create' | 'update' | 'delete' | 'post' | 'reverse'
  | 'approve' | 'reject' | 'lock' | 'unlock';

export interface ApAuditEntry {
  id: string;
  user_id: string;
  actor_id: string | null;
  actor_email: string | null;
  entity_type: ApAuditEntity;
  entity_id: string | null;
  action: ApAuditAction;
  amount: number | null;
  reference: string | null;
  before_json: any;
  after_json: any;
  notes: string | null;
  created_at: string;
}

interface RecordAuditInput {
  entity_type: ApAuditEntity;
  entity_id?: string;
  action: ApAuditAction;
  amount?: number;
  reference?: string;
  before_json?: any;
  after_json?: any;
  notes?: string;
}

/** Standalone helper – callable from mutations (no hooks). */
export const recordApAudit = async (
  userId: string,
  actor: { id?: string; email?: string },
  input: RecordAuditInput,
) => {
  try {
    await supabase.from('ap_audit_log').insert({
      user_id: userId,
      actor_id: actor.id || null,
      actor_email: actor.email || null,
      entity_type: input.entity_type,
      entity_id: input.entity_id || null,
      action: input.action,
      amount: input.amount ?? null,
      reference: input.reference || null,
      before_json: input.before_json ?? null,
      after_json: input.after_json ?? null,
      notes: input.notes || null,
    });
  } catch (err) {
    console.error('[recordApAudit] failed:', err);
  }
};

export const useApAuditLog = (filters?: { entity_type?: ApAuditEntity; entity_id?: string; limit?: number }) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['ap-audit-log', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('ap_audit_log')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (filters?.entity_type) q = q.eq('entity_type', filters.entity_type);
      if (filters?.entity_id)   q = q.eq('entity_id', filters.entity_id);
      q = q.limit(filters?.limit || 200);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ApAuditEntry[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useRecordApAudit = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordAuditInput) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      await recordApAudit(uid, {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
      }, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ap-audit-log'] }),
  });
};

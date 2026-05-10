import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/lib/supabase';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';

export type ArAuditEntity =
  | 'invoice' | 'credit_note' | 'payment_received' | 'customer_advance'
  | 'customer_advance_adjustment' | 'allocation' | 'client'
  | 'recurring_invoice' | 'dunning_rule'
  | 'quotation' | 'sales_order' | 'delivery_challan';

export type ArAuditAction =
  | 'create' | 'update' | 'delete' | 'post' | 'reverse'
  | 'approve' | 'reject' | 'send' | 'cancel' | 'adjust' | 'allocate' | 'remind';

export interface ArAuditEntry {
  id: string;
  user_id: string;
  actor_id: string | null;
  actor_email: string | null;
  entity_type: ArAuditEntity;
  entity_id: string | null;
  action: ArAuditAction;
  amount: number | null;
  reference: string | null;
  before_json: any;
  after_json: any;
  notes: string | null;
  created_at: string;
}

interface RecordAuditInput {
  entity_type: ArAuditEntity;
  entity_id?: string;
  action: ArAuditAction;
  amount?: number;
  reference?: string;
  before_json?: any;
  after_json?: any;
  notes?: string;
}

/** Standalone helper – callable from mutations (no hooks). */
export const recordArAudit = async (
  userId: string,
  actor: { id?: string; email?: string },
  input: RecordAuditInput,
) => {
  try {
    await supabase.from('ar_audit_log').insert({
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
    console.error('[recordArAudit] failed:', err);
  }
};

export const useArAuditLog = (filters?: { entity_type?: ArAuditEntity; entity_id?: string; limit?: number }) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['ar-audit-log', user?.id, filters],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) return [];
      const uid = normalizeUserId(user.id);
      let q = supabase
        .from('ar_audit_log')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      if (filters?.entity_type) q = q.eq('entity_type', filters.entity_type);
      if (filters?.entity_id)   q = q.eq('entity_id', filters.entity_id);
      q = q.limit(filters?.limit || 200);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ArAuditEntry[];
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useRecordArAudit = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RecordAuditInput) => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      const uid = normalizeUserId(user.id);
      await recordArAudit(uid, {
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress,
      }, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ar-audit-log'] }),
  });
};

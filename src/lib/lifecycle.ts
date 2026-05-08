import { supabase } from '@/lib/supabase';

/**
 * Lifecycle helpers for purchase_bills + expenses (Gap 3).
 * The DB enforces transition validity via the `enforce_lifecycle_transition`
 * trigger; this module just gives the app convenient wrappers.
 */

export const LIFECYCLE_STATES = [
  'draft',
  'pending_approval',
  'approved',
  'posted',
  'rejected',
  'void',
  'locked',
] as const;

export type LifecycleStatus = typeof LIFECYCLE_STATES[number];

export const LIFECYCLE_TRANSITIONS: Record<LifecycleStatus, LifecycleStatus[]> = {
  draft:            ['pending_approval', 'posted', 'void'],
  pending_approval: ['approved', 'rejected', 'draft'],
  approved:         ['posted', 'rejected'],
  rejected:         ['draft'],
  posted:           ['locked', 'void'],
  void:             [],
  locked:           [],
};

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  draft:            'Draft',
  pending_approval: 'Pending Approval',
  approved:         'Approved',
  posted:           'Posted',
  rejected:         'Rejected',
  void:             'Voided',
  locked:           'Locked',
};

export const canTransition = (from: LifecycleStatus, to: LifecycleStatus): boolean =>
  LIFECYCLE_TRANSITIONS[from]?.includes(to) ?? false;

export const transitionBill = async (
  billId: string,
  to: LifecycleStatus,
  opts?: { actorId?: string; notes?: string }
) => {
  const { error } = await supabase.rpc('transition_bill', {
    p_id: billId,
    p_to: to,
    p_actor: opts?.actorId ?? null,
    p_notes: opts?.notes ?? null,
  });
  if (error) throw error;
};

export const transitionExpense = async (
  expenseId: string,
  to: LifecycleStatus,
  opts?: { actorId?: string; notes?: string }
) => {
  const { error } = await supabase.rpc('transition_expense', {
    p_id: expenseId,
    p_to: to,
    p_actor: opts?.actorId ?? null,
    p_notes: opts?.notes ?? null,
  });
  if (error) throw error;
};

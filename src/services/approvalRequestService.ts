// ════════════════════════════════════════════════════════════════════════════
// Generalized Approval Workflow Service (Module 18)
//
// One source of truth for "needs approval before it can be posted/executed"
// across asset purchases, disposals, write-offs, transfers, revaluations,
// liability restructuring, loan closures, etc.
//
// This service handles STATE TRANSITIONS only. The actual *execution* of
// the approved action (posting a journal, mutating the asset, etc.) is the
// responsibility of the calling module — keeping this layer composable.
// Modules opt in by:
//   1) Creating an approval_request before performing the action.
//   2) On approve, listening to status='approved' and running their executor.
//   3) Calling markExecuted() with the resulting journal_id / new entity_id.
//
// Already-integrated example: assetDisposalService uses asset_disposal_requests
// (its own typed table) for the disposal-specific flow. This module is for
// EVERYTHING ELSE that needs generalised approval.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  CreateApprovalRequestInput,
} from '@/types/approvalRequest';

const today = () => new Date().toISOString().slice(0, 10);

export const listApprovalRequests = async (
  userId: string,
  filters?: {
    status?: ApprovalRequestStatus | 'all';
    requestType?: string;
  },
): Promise<ApprovalRequest[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('asset_approval_requests')
    .select('*')
    .eq('user_id', uid)
    .order('requested_on', { ascending: false });
  if (filters?.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters?.requestType) q = q.eq('request_type', filters.requestType);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ApprovalRequest[];
};

export const getApprovalRequest = async (
  userId: string,
  id: string,
): Promise<ApprovalRequest | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as ApprovalRequest) || null;
};

export const createApprovalRequest = async (
  userId: string,
  input: CreateApprovalRequestInput,
): Promise<ApprovalRequest> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .insert({
      user_id: uid,
      request_type: input.request_type,
      entity_type: input.entity_type || null,
      entity_id: input.entity_id || null,
      title: input.title,
      description: input.description || null,
      amount: input.amount ?? null,
      payload: input.payload || null,
      status: 'pending' as const,
      requested_by: uid,
      requested_on: today(),
      expires_on: input.expires_on || null,
      priority: input.priority || 'normal',
      notes: input.notes || null,
      document_url: input.document_url || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ApprovalRequest;
};

export const approveRequest = async (
  userId: string,
  id: string,
  comment?: string,
): Promise<ApprovalRequest> => {
  const uid = normalizeUserId(userId);
  const req = await getApprovalRequest(uid, id);
  if (!req) throw new Error('Request not found.');
  if (req.status !== 'pending') throw new Error(`Cannot approve a ${req.status} request.`);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .update({
      status: 'approved' as const,
      approver: uid,
      approved_on: today(),
      approval_comment: comment || null,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ApprovalRequest;
};

export const rejectRequest = async (
  userId: string,
  id: string,
  reason: string,
): Promise<ApprovalRequest> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .update({
      status: 'rejected' as const,
      approver: uid,
      approved_on: today(),
      rejection_reason: reason,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ApprovalRequest;
};

export const markExecuted = async (
  userId: string,
  id: string,
  executionRefId?: string,
): Promise<ApprovalRequest> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .update({
      status: 'executed' as const,
      executed_on: today(),
      execution_ref_id: executionRefId || null,
    })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ApprovalRequest;
};

export const cancelRequest = async (
  userId: string,
  id: string,
): Promise<ApprovalRequest> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .update({ status: 'cancelled' as const })
    .eq('user_id', uid)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ApprovalRequest;
};

/** Marks any pending requests past expires_on as 'expired'. */
export const expireOverdueRequests = async (userId: string): Promise<number> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_approval_requests')
    .update({ status: 'expired' as const })
    .eq('user_id', uid)
    .eq('status', 'pending')
    .not('expires_on', 'is', null)
    .lt('expires_on', today())
    .select('id');
  if (error) throw error;
  return (data || []).length;
};

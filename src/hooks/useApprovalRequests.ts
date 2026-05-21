import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listApprovalRequests,
  getApprovalRequest,
  createApprovalRequest,
  approveRequest,
  rejectRequest,
  markExecuted,
  cancelRequest,
  expireOverdueRequests,
} from '@/services/approvalRequestService';
import type {
  ApprovalRequestStatus,
  CreateApprovalRequestInput,
} from '@/types/approvalRequest';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['approval-requests'] });
  qc.invalidateQueries({ queryKey: ['approval-request'] });
};

export const useApprovalRequests = (filters?: {
  status?: ApprovalRequestStatus | 'all';
  requestType?: string;
}) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['approval-requests', uid, filters?.status || 'all', filters?.requestType || 'all'],
    queryFn: () => listApprovalRequests(uid!, filters),
    enabled,
  });
};

export const useApprovalRequest = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['approval-request', uid, id],
    queryFn: () => getApprovalRequest(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCreateApprovalRequest = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateApprovalRequestInput) => createApprovalRequest(uid!, input),
    onSuccess: () => { toast({ title: 'Approval requested' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Request failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useApproveRequest = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; comment?: string }) => approveRequest(uid!, args.id, args.comment),
    onSuccess: () => { toast({ title: 'Approved' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Approval failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRejectRequest = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; reason: string }) => rejectRequest(uid!, args.id, args.reason),
    onSuccess: () => { toast({ title: 'Rejected' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Rejection failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useMarkExecuted = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; executionRefId?: string }) =>
      markExecuted(uid!, args.id, args.executionRefId),
    onSuccess: () => { toast({ title: 'Marked executed' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCancelRequest = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => cancelRequest(uid!, id),
    onSuccess: () => { toast({ title: 'Cancelled' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useExpireOverdueRequests = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => expireOverdueRequests(uid!),
    onSuccess: () => invalidate(qc),
  });
};

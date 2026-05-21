import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listLeases,
  getLease,
  listLeaseSchedule,
  createLease,
  activateLease,
  postLeasePayment,
  terminateLease,
  listDueLeasePayments,
} from '@/services/leaseService';
import type {
  CreateLeaseInput,
  PostLeasePaymentInput,
  TerminateLeaseInput,
} from '@/types/lease';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['leases'] });
  qc.invalidateQueries({ queryKey: ['lease'] });
  qc.invalidateQueries({ queryKey: ['lease-schedule'] });
  qc.invalidateQueries({ queryKey: ['lease-due'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useLeases = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['leases', uid],
    queryFn: () => listLeases(uid!),
    enabled,
  });
};

export const useLease = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['lease', uid, id],
    queryFn: () => getLease(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useLeaseSchedule = (leaseId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['lease-schedule', uid, leaseId],
    queryFn: () => listLeaseSchedule(uid!, leaseId!),
    enabled: enabled && !!leaseId,
  });
};

export const useDueLeasePayments = (withinDays = 14) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['lease-due', uid, withinDays],
    queryFn: () => listDueLeasePayments(uid!, withinDays),
    enabled,
  });
};

export const useCreateLease = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateLeaseInput) => createLease(uid!, input),
    onSuccess: (l) => {
      toast({ title: 'Lease created', description: `${l.lease_code} (draft)` });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useActivateLease = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => activateLease(uid!, id),
    onSuccess: (res) => {
      toast({
        title: 'Lease activated',
        description: `${res.scheduleRows} payments scheduled${res.recognitionJournalId ? ' • Recognition journal posted' : ''}`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Activation failed', description: e?.message, variant: 'destructive' }),
  });
};

export const usePostLeasePayment = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: PostLeasePaymentInput) => postLeasePayment(uid!, input),
    onSuccess: () => { toast({ title: 'Lease payment posted' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useTerminateLease = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: TerminateLeaseInput) => terminateLease(uid!, input),
    onSuccess: () => { toast({ title: 'Lease terminated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Termination failed', description: e?.message, variant: 'destructive' }),
  });
};

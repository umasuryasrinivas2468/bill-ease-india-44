import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listLiabilities,
  getLiability,
  listEmiSchedule,
  listUpcomingEmis,
  createLiability,
  updateLiability,
  generateEmiSchedule,
  payEmi,
  type PayEmiInput,
} from '@/services/liabilityService';
import type { CreateLiabilityInput, Liability } from '@/types/liabilities';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useLiabilities = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['liabilities', uid],
    queryFn: () => listLiabilities(uid!),
    enabled,
  });
};

export const useLiability = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['liability', uid, id],
    queryFn: () => getLiability(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useEmiSchedule = (liabilityId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['emi-schedule', uid, liabilityId],
    queryFn: () => listEmiSchedule(uid!, liabilityId!),
    enabled: enabled && !!liabilityId,
  });
};

export const useUpcomingEmis = (withinDays = 30) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['upcoming-emis', uid, withinDays],
    queryFn: () => listUpcomingEmis(uid!, withinDays),
    enabled,
  });
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['liabilities'] });
  qc.invalidateQueries({ queryKey: ['liability'] });
  qc.invalidateQueries({ queryKey: ['emi-schedule'] });
  qc.invalidateQueries({ queryKey: ['upcoming-emis'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useCreateLiability = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateLiabilityInput) => createLiability(uid!, input),
    onSuccess: (res) => {
      toast({
        title: 'Liability recorded',
        description: `${res.liability.liability_code} • Outstanding ₹${res.liability.outstanding_principal.toLocaleString('en-IN')}${res.emiRows ? ` • ${res.emiRows} EMIs scheduled` : ''}`,
      });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({ title: 'Create failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useUpdateLiability = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<Liability> }) =>
      updateLiability(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Liability updated' }); invalidate(qc); },
    onError: (err: any) => {
      toast({ title: 'Update failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useGenerateEmiSchedule = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (liabilityId: string) => generateEmiSchedule(uid!, liabilityId),
    onSuccess: (n) => { toast({ title: 'EMI schedule generated', description: `${n} EMIs.` }); invalidate(qc); },
    onError: (err: any) => {
      toast({ title: 'Schedule failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const usePayEmi = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: PayEmiInput) => payEmi(uid!, input),
    onSuccess: () => { toast({ title: 'EMI paid' }); invalidate(qc); },
    onError: (err: any) => {
      toast({ title: 'Payment failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

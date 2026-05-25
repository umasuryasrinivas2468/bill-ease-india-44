import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listAllocations,
  getAllocation,
  getAssetAllocationSummary,
  listEmployeeAllocationSummaries,
  listOverdueAllocations,
  createAllocation,
  returnAllocation,
  refreshOverdueStatus,
} from '@/services/assetAllocationService';
import type {
  CreateAllocationInput,
  ReturnAllocationInput,
} from '@/types/assetAllocation';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['allocations'] });
  qc.invalidateQueries({ queryKey: ['allocation'] });
  qc.invalidateQueries({ queryKey: ['allocation-summary'] });
  qc.invalidateQueries({ queryKey: ['employee-allocations'] });
  qc.invalidateQueries({ queryKey: ['overdue-allocations'] });
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
};

export const useAllocations = (filters?: { assetId?: string; employeeId?: string; statusIn?: string[] }) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['allocations', uid, filters?.assetId || 'all', filters?.employeeId || 'all', (filters?.statusIn || []).join(',')],
    queryFn: () => listAllocations(uid!, filters),
    enabled,
  });
};

export const useAllocation = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['allocation', uid, id],
    queryFn: () => getAllocation(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useAssetAllocationSummary = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['allocation-summary', uid, assetId],
    queryFn: () => getAssetAllocationSummary(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

export const useEmployeeAllocationSummaries = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['employee-allocations', uid],
    queryFn: () => listEmployeeAllocationSummaries(uid!),
    enabled,
  });
};

export const useOverdueAllocations = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['overdue-allocations', uid],
    queryFn: () => listOverdueAllocations(uid!),
    enabled,
  });
};

export const useCreateAllocation = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateAllocationInput) => createAllocation(uid!, input),
    onSuccess: (a) => { toast({ title: 'Asset allocated', description: `Issued to ${a.employee_name}` }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Allocation failed', description: e?.message, variant: 'destructive' }),
  });
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

export const useReturnAllocation = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ReturnAllocationInput) => returnAllocation(uid!, input),
    onSuccess: (res) => {
      const { allocation, journal_kind, journal_amount } = res;
      const title =
        allocation.status === 'lost' ? 'Marked lost' :
        allocation.status === 'damaged' ? 'Returned (damaged)' :
        'Asset returned';
      const description =
        journal_kind === 'write_off' ? `Write-off journal posted — ${inr(journal_amount)} removed from books`
        : journal_kind === 'impairment' ? `Impairment journal posted — ${inr(journal_amount)} loss recognised`
        : undefined;
      toast({ title, description });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Return failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRefreshOverdue = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => refreshOverdueStatus(uid!),
    onSuccess: () => invalidate(qc),
  });
};

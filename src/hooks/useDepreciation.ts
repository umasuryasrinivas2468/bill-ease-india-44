import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  generateDepreciationSchedule,
  postDepreciationForPeriod,
  runDepreciationBatch,
  adjustPlannedPeriod,
} from '@/services/depreciationService';

const useUid = () => {
  const { user } = useUser();
  return user && isValidUserId(user.id) ? normalizeUserId(user.id) : null;
};

export const useRegenerateSchedule = () => {
  const uid = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (assetId: string) => generateDepreciationSchedule(uid!, assetId),
    onSuccess: (n) => {
      toast({ title: 'Depreciation schedule generated', description: `${n} periods planned.` });
      qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
    },
    onError: (err: any) => {
      toast({ title: 'Schedule generation failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const usePostDepreciationPeriod = () => {
  const uid = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (scheduleRowId: string) => postDepreciationForPeriod(uid!, scheduleRowId),
    onSuccess: () => {
      toast({ title: 'Depreciation posted' });
      qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
    },
    onError: (err: any) => {
      toast({ title: 'Posting failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useRunDepreciationBatch = () => {
  const uid = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { asOf: string; assetIds?: string[] }) =>
      runDepreciationBatch(uid!, args.asOf, args.assetIds),
    onSuccess: (res) => {
      toast({
        title: 'Depreciation run complete',
        description: `Posted ${res.posted} periods • Total ₹${res.totalAmount.toLocaleString('en-IN')}${res.skipped ? ` • ${res.skipped} skipped` : ''}`,
      });
      qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
    },
    onError: (err: any) => {
      toast({ title: 'Batch failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useAdjustPlannedPeriod = () => {
  const uid = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; amount: number; note?: string }) =>
      adjustPlannedPeriod(uid!, args.id, args.amount, args.note),
    onSuccess: () => {
      toast({ title: 'Period adjusted' });
      qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
    },
    onError: (err: any) => {
      toast({ title: 'Adjust failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

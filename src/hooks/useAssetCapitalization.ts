import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listUncapitalizedBills,
  listBillAssetLines,
  previewBillCapitalization,
  capitalizeBillLines,
  markBillSkipped,
  unskipBill,
  type CapitalizationLineInput,
} from '@/services/assetCapitalizationService';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useUncapitalizedBills = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['uncapitalized-bills', uid],
    queryFn: () => listUncapitalizedBills(uid!),
    enabled,
  });
};

export const useBillAssetLines = (billId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['bill-asset-lines', uid, billId],
    queryFn: () => listBillAssetLines(uid!, billId!),
    enabled: enabled && !!billId,
  });
};

export const useCapitalizationPreview = (billId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['capitalization-preview', uid, billId],
    queryFn: () => previewBillCapitalization(uid!, billId!),
    enabled: enabled && !!billId,
  });
};

export const useCapitalizeBillLines = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { billId: string; lines: CapitalizationLineInput[] }) =>
      capitalizeBillLines(uid!, args.billId, args.lines),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['uncapitalized-bills'] });
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['capitalization-preview', uid, result.bill_id] });
      qc.invalidateQueries({ queryKey: ['bill-asset-lines', uid, result.bill_id] });
      qc.invalidateQueries({ queryKey: ['purchase-bills'] });
      const createdCount = result.created.length;
      const skippedCount = result.skipped.length;
      toast({
        title: createdCount > 0 ? `${createdCount} asset${createdCount === 1 ? '' : 's'} capitalized` : 'Nothing capitalized',
        description: skippedCount > 0 ? `${skippedCount} line${skippedCount === 1 ? '' : 's'} skipped.` : undefined,
      });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Capitalization failed',
        description: err?.message || String(err),
      });
    },
  });
};

export const useMarkBillSkipped = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (billId: string) => markBillSkipped(uid!, billId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uncapitalized-bills'] });
      toast({ title: 'Bill removed from capitalization queue' });
    },
    onError: (err: any) => {
      toast({ variant: 'destructive', title: 'Failed', description: err?.message || String(err) });
    },
  });
};

export const useUnskipBill = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (billId: string) => unskipBill(uid!, billId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['uncapitalized-bills'] });
    },
  });
};

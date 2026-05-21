import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listRevaluations,
  previewRevaluation,
  revalueAsset,
} from '@/services/assetRevaluationService';
import type { RevalueAssetInput } from '@/types/assetRevaluation';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['asset-revaluations'] });
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
  qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useAssetRevaluations = (assetId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['asset-revaluations', uid, assetId || 'all'],
    queryFn: () => listRevaluations(uid!, assetId),
    enabled,
  });
};

export const usePreviewRevaluation = () => {
  const { uid } = useUid();
  return useMutation({
    mutationFn: (args: { assetId: string; newFairValue: number }) =>
      previewRevaluation(uid!, args.assetId, args.newFairValue),
  });
};

export const useRevalueAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: RevalueAssetInput) => revalueAsset(uid!, input),
    onSuccess: (res) => {
      const sign = res.revaluation.direction === 'upward' ? '+' : '−';
      toast({
        title: `Revalued ${res.revaluation.direction}`,
        description: `${sign}₹${res.revaluation.revaluation_amount.toLocaleString('en-IN')} • Journal posted • ${res.scheduleRowsRegenerated} depreciation rows regenerated`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Revaluation failed', description: e?.message, variant: 'destructive' }),
  });
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listFixedAssets,
  getFixedAsset,
  listAssetCategories,
  listAssetTransactions,
  listAssetDepreciationSchedule,
  createFixedAsset,
  updateFixedAsset,
  convertBillToAsset,
  convertExpenseToAsset,
} from '@/services/fixedAssetService';
import { disposeFixedAsset, type DisposalInput } from '@/services/assetDisposalService';
import type { CreateAssetInput, FixedAsset } from '@/types/fixedAssets';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useFixedAssets = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['fixed-assets', uid],
    queryFn: () => listFixedAssets(uid!),
    enabled,
  });
};

export const useFixedAsset = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['fixed-asset', uid, assetId],
    queryFn: () => getFixedAsset(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

export const useAssetCategories = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['fixed-asset-categories', uid],
    queryFn: () => listAssetCategories(uid!),
    enabled,
  });
};

export const useAssetTransactions = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['asset-transactions', uid, assetId],
    queryFn: () => listAssetTransactions(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

export const useAssetDepreciationSchedule = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['asset-depreciation-schedule', uid, assetId],
    queryFn: () => listAssetDepreciationSchedule(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

const invalidateAssets = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
  qc.invalidateQueries({ queryKey: ['asset-depreciation-schedule'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useCreateAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateAssetInput) => createFixedAsset(uid!, input),
    onSuccess: (res) => {
      toast({
        title: 'Asset created',
        description: `${res.asset.asset_code} • Book value ₹${res.asset.book_value.toLocaleString('en-IN')}${res.purchaseJournalId ? ' • Journal posted' : ''}`,
      });
      invalidateAssets(qc);
    },
    onError: (err: any) => {
      toast({ title: 'Failed to create asset', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useUpdateAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<FixedAsset> }) =>
      updateFixedAsset(uid!, args.id, args.patch),
    onSuccess: () => {
      toast({ title: 'Asset updated' });
      invalidateAssets(qc);
    },
    onError: (err: any) => {
      toast({ title: 'Update failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useConvertBillToAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { billId: string; overrides?: Partial<CreateAssetInput> }) =>
      convertBillToAsset(uid!, args.billId, args.overrides),
    onSuccess: () => { toast({ title: 'Bill converted to asset' }); invalidateAssets(qc); },
    onError: (err: any) => {
      toast({ title: 'Conversion failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useConvertExpenseToAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { expenseId: string; overrides?: Partial<CreateAssetInput> }) =>
      convertExpenseToAsset(uid!, args.expenseId, args.overrides),
    onSuccess: () => { toast({ title: 'Expense converted to asset' }); invalidateAssets(qc); },
    onError: (err: any) => {
      toast({ title: 'Conversion failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

export const useDisposeAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: DisposalInput) => disposeFixedAsset(uid!, input),
    onSuccess: (res) => {
      const verdict = res.profitLoss >= 0
        ? `Profit ₹${res.profitLoss.toLocaleString('en-IN')}`
        : `Loss ₹${Math.abs(res.profitLoss).toLocaleString('en-IN')}`;
      toast({ title: 'Asset disposed', description: verdict });
      invalidateAssets(qc);
    },
    onError: (err: any) => {
      toast({ title: 'Disposal failed', description: err?.message || String(err), variant: 'destructive' });
    },
  });
};

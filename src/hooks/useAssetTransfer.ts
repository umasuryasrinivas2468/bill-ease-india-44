import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listAssetTransfers,
  getAssetTransfer,
  createAssetTransfer,
  approveTransfer,
  rejectTransfer,
  revertTransfer,
  getBranchAssetBreakdown,
} from '@/services/assetTransferService';
import type { CreateTransferInput, TransferStatus } from '@/types/assetTransfer';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['asset-transfers'] });
  qc.invalidateQueries({ queryKey: ['asset-transfer'] });
  qc.invalidateQueries({ queryKey: ['branch-asset-breakdown'] });
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useAssetTransfers = (filters?: { assetId?: string; status?: TransferStatus }) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['asset-transfers', uid, filters?.assetId || 'all', filters?.status || 'all'],
    queryFn: () => listAssetTransfers(uid!, filters),
    enabled,
  });
};

export const useAssetTransfer = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['asset-transfer', uid, id],
    queryFn: () => getAssetTransfer(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCreateAssetTransfer = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateTransferInput) => createAssetTransfer(uid!, input),
    onSuccess: (res) => {
      const parts: string[] = [];
      if (res.assetUpdated) parts.push('asset updated');
      if (res.journalId) parts.push('journal posted');
      toast({
        title: res.transfer.status === 'pending_approval' ? 'Transfer awaiting approval' : 'Transfer completed',
        description: parts.join(' • ') || undefined,
      });
      invalidate(qc);
    },
    onError: (e: any) => {
      toast({ title: 'Transfer failed', description: e?.message || String(e), variant: 'destructive' });
    },
  });
};

export const useApproveTransfer = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; notes?: string }) => approveTransfer(uid!, args.id, args.notes),
    onSuccess: () => { toast({ title: 'Transfer approved' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Approval failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRejectTransfer = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; reason: string }) => rejectTransfer(uid!, args.id, args.reason),
    onSuccess: () => { toast({ title: 'Transfer rejected' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Rejection failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRevertTransfer = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; reason: string }) => revertTransfer(uid!, args.id, args.reason),
    onSuccess: () => { toast({ title: 'Transfer reverted' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Reversal failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useBranchAssetBreakdown = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['branch-asset-breakdown', uid],
    queryFn: () => getBranchAssetBreakdown(uid!),
    enabled,
  });
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  approvePurchaseReturn,
  cancelPurchaseReturn,
  createPurchaseReturn,
  getReturnedQuantitiesByBill,
  getPurchaseReturnWithItems,
  listPurchaseReturns,
  type PurchaseReturnInput,
  type PurchaseReturnRow,
} from '@/services/purchaseReturnService';

export const usePurchaseReturns = (opts: { billId?: string } = {}) => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<PurchaseReturnRow[]>({
    queryKey: ['purchase-returns', uid, opts.billId ?? null],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      return listPurchaseReturns(user.id, opts);
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const usePurchaseReturnWithItems = (returnId: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['purchase-return-detail', returnId],
    queryFn: async () => {
      if (!user || !returnId) throw new Error('Missing context');
      return getPurchaseReturnWithItems(user.id, returnId);
    },
    enabled: !!user && !!returnId,
  });
};

export const useReturnedQuantitiesForBill = (billId: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['returned-qty-bill', billId],
    queryFn: async () => {
      if (!user || !billId) return {};
      return getReturnedQuantitiesByBill(user.id, billId);
    },
    enabled: !!user && !!billId,
  });
};

export const useCreatePurchaseReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PurchaseReturnInput) => {
      if (!user) throw new Error('Not authenticated');
      return createPurchaseReturn(user.id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      qc.invalidateQueries({ queryKey: ['returned-qty-bill'] });
    },
  });
};

export const useApprovePurchaseReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      if (!user) throw new Error('Not authenticated');
      return approvePurchaseReturn(user.id, returnId, { approvedBy: user.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
      qc.invalidateQueries({ queryKey: ['debit-notes'] });
      qc.invalidateQueries({ queryKey: ['purchase-bills'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['vendor-ledger'] });
      qc.invalidateQueries({ queryKey: ['ap-dashboard'] });
      qc.invalidateQueries({ queryKey: ['payables'] });
    },
  });
};

export const useCancelPurchaseReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      if (!user) throw new Error('Not authenticated');
      return cancelPurchaseReturn(user.id, returnId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase-returns'] });
    },
  });
};

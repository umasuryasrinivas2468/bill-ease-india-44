import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  approveSalesReturn,
  cancelSalesReturn,
  createSalesReturn,
  getReturnedQuantitiesByInvoice,
  getSalesReturnWithItems,
  listSalesReturns,
  type SalesReturnInput,
  type SalesReturnRow,
} from '@/services/salesReturnService';

export const useSalesReturns = (opts: { invoiceId?: string } = {}) => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<SalesReturnRow[]>({
    queryKey: ['sales-returns', uid, opts.invoiceId ?? null],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      return listSalesReturns(user.id, opts);
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useSalesReturnWithItems = (returnId: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['sales-return-detail', returnId],
    queryFn: async () => {
      if (!user || !returnId) throw new Error('Missing context');
      return getSalesReturnWithItems(user.id, returnId);
    },
    enabled: !!user && !!returnId,
  });
};

export const useReturnedQuantitiesForInvoice = (invoiceId: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['returned-qty', invoiceId],
    queryFn: async () => {
      if (!user || !invoiceId) return {};
      return getReturnedQuantitiesByInvoice(user.id, invoiceId);
    },
    enabled: !!user && !!invoiceId,
  });
};

export const useCreateSalesReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalesReturnInput) => {
      if (!user) throw new Error('Not authenticated');
      return createSalesReturn(user.id, input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      qc.invalidateQueries({ queryKey: ['returned-qty'] });
    },
  });
};

export const useApproveSalesReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      if (!user) throw new Error('Not authenticated');
      return approveSalesReturn(user.id, returnId, { approvedBy: user.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
      qc.invalidateQueries({ queryKey: ['credit-notes'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['customer-ledger'] });
      qc.invalidateQueries({ queryKey: ['ar-dashboard'] });
    },
  });
};

export const useCancelSalesReturn = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (returnId: string) => {
      if (!user) throw new Error('Not authenticated');
      return cancelSalesReturn(user.id, returnId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales-returns'] });
    },
  });
};

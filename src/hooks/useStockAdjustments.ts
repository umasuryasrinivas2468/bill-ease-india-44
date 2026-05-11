import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  approveStockAdjustment,
  cancelStockAdjustment,
  createStockAdjustment,
  getStockAdjustmentWithItems,
  listStockAdjustments,
  type StockAdjustmentInput,
  type StockAdjustmentRow,
  type StockAdjustmentStatus,
} from '@/services/stockAdjustmentService';

export const useStockAdjustments = (opts: { status?: StockAdjustmentStatus } = {}) => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<StockAdjustmentRow[]>({
    queryKey: ['stock-adjustments', uid, opts.status ?? 'all'],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      return listStockAdjustments(user.id, opts);
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useStockAdjustmentDetail = (id: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['stock-adjustment-detail', id],
    queryFn: async () => {
      if (!user || !id) throw new Error('Missing context');
      return getStockAdjustmentWithItems(user.id, id);
    },
    enabled: !!user && !!id,
  });
};

export const useCreateStockAdjustment = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: StockAdjustmentInput) => {
      if (!user) throw new Error('Not authenticated');
      return createStockAdjustment(user.id, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-adjustments'] }),
  });
};

export const useApproveStockAdjustment = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      return approveStockAdjustment(user.id, id, { approvedBy: user.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-adjustments'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-reconciliation'] });
    },
  });
};

export const useCancelStockAdjustment = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      return cancelStockAdjustment(user.id, id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stock-adjustments'] }),
  });
};

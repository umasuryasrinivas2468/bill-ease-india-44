import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { normalizeUserId, isValidUserId } from '@/lib/userUtils';
import {
  approveWarehouseTransfer,
  cancelWarehouseTransfer,
  createWarehouseTransfer,
  getWarehouseTransferWithItems,
  listWarehouseTransfers,
  type WarehouseTransferInput,
  type WarehouseTransferRow,
  type WarehouseTransferStatus,
} from '@/services/warehouseTransferService';

export const useWarehouseTransfers = (opts: { status?: WarehouseTransferStatus } = {}) => {
  const { user } = useUser();
  const uid = user ? normalizeUserId(user.id) : null;
  return useQuery<WarehouseTransferRow[]>({
    queryKey: ['warehouse-transfers', uid, opts.status ?? 'all'],
    queryFn: async () => {
      if (!user || !isValidUserId(user.id)) throw new Error('Not authenticated');
      return listWarehouseTransfers(user.id, opts);
    },
    enabled: !!user && isValidUserId(user?.id),
  });
};

export const useWarehouseTransferDetail = (id: string | null) => {
  const { user } = useUser();
  return useQuery({
    queryKey: ['warehouse-transfer-detail', id],
    queryFn: async () => {
      if (!user || !id) throw new Error('Missing context');
      return getWarehouseTransferWithItems(user.id, id);
    },
    enabled: !!user && !!id,
  });
};

export const useCreateWarehouseTransfer = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: WarehouseTransferInput) => {
      if (!user) throw new Error('Not authenticated');
      return createWarehouseTransfer(user.id, input);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse-transfers'] }),
  });
};

export const useApproveWarehouseTransfer = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      return approveWarehouseTransfer(user.id, id, { approvedBy: user.id });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['warehouse-transfers'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['warehouse-stock'] });
    },
  });
};

export const useCancelWarehouseTransfer = () => {
  const { user } = useUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error('Not authenticated');
      return cancelWarehouseTransfer(user.id, id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['warehouse-transfers'] }),
  });
};

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  convertInventoryToAsset,
  getInventoryItemSnapshot,
  type ConvertInventoryToAssetInput,
} from '@/services/inventoryToAssetService';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useInventoryItemSnapshot = (itemId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['inventory-snapshot', uid, itemId],
    queryFn: () => getInventoryItemSnapshot(uid!, itemId!),
    enabled: enabled && !!itemId,
  });
};

export const useConvertInventoryToAsset = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ConvertInventoryToAssetInput) => convertInventoryToAsset(uid!, input),
    onSuccess: (result, vars) => {
      qc.invalidateQueries({ queryKey: ['inventory-snapshot', uid, vars.item_id] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['item-movement-ledger', vars.item_id] });
      toast({
        title: 'Converted to fixed asset',
        description: `${result.asset.asset_code} created at ₹${result.capitalized_value.toLocaleString('en-IN')}.`,
      });
    },
    onError: (err: any) => {
      toast({
        variant: 'destructive',
        title: 'Conversion failed',
        description: err?.message || String(err),
      });
    },
  });
};

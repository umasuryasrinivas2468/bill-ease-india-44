import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import {
  listAssetByBranch,
  listAssetByDepartment,
  listAssetByCostCenter,
  listLiabilityByLender,
  listAssetRoi,
  getCfoSnapshot,
  getCfoIntelligence,
} from '@/services/misService';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useAssetByBranch = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['mis', 'asset-by-branch', uid],
    queryFn: () => listAssetByBranch(uid!),
    enabled,
  });
};

export const useAssetByDepartment = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['mis', 'asset-by-department', uid],
    queryFn: () => listAssetByDepartment(uid!),
    enabled,
  });
};

export const useAssetByCostCenter = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['mis', 'asset-by-cc', uid],
    queryFn: () => listAssetByCostCenter(uid!),
    enabled,
  });
};

export const useLiabilityByLender = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['mis', 'liability-by-lender', uid],
    queryFn: () => listLiabilityByLender(uid!),
    enabled,
  });
};

export const useAssetRoi = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['mis', 'asset-roi', uid],
    queryFn: () => listAssetRoi(uid!),
    enabled,
  });
};

export const useCfoSnapshot = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['cfo-snapshot', uid],
    queryFn: () => getCfoSnapshot(uid!),
    enabled,
  });
};

export const useCfoIntelligence = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['cfo-intelligence', uid],
    queryFn: () => getCfoIntelligence(uid!),
    enabled,
  });
};

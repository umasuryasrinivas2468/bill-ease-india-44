import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import {
  listAllAlerts,
  listIdleAssets,
  listDuplicateAssets,
  type AutomationHubOptions,
} from '@/services/automationHubService';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

export const useBusinessAlerts = (options: AutomationHubOptions = {}) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['business-alerts', uid, options],
    queryFn: () => listAllAlerts(uid!, options),
    enabled,
    staleTime: 60_000,
  });
};

export const useIdleAssets = (thresholdDays = 180) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['idle-assets', uid, thresholdDays],
    queryFn: () => listIdleAssets(uid!, thresholdDays),
    enabled,
  });
};

export const useDuplicateAssets = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['duplicate-assets', uid],
    queryFn: () => listDuplicateAssets(uid!),
    enabled,
  });
};

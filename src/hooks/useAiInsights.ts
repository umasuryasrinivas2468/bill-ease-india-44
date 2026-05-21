import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { generateInsights } from '@/services/aiInsightsService';

export const useAiInsights = () => {
  const { user } = useUser();
  const uid = user && isValidUserId(user.id) ? normalizeUserId(user.id) : null;
  return useQuery({
    queryKey: ['ai-insights', uid],
    queryFn: () => generateInsights(uid!),
    enabled: !!uid,
    staleTime: 60_000,
  });
};

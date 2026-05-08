import { useUser } from '@clerk/clerk-react';
import type { KYCData } from '@/components/KYCVerification';

export interface KycStatusResult {
  kyc: KYCData;
  isVerified: boolean;
  isPending: boolean;
  isLoaded: boolean;
}

// Reads the KYC payload from Clerk unsafeMetadata.kyc. Used by gating
// surfaces (e.g. Razorpay activation) to enforce KYC before money flow.
export function useKycStatus(): KycStatusResult {
  const { user, isLoaded } = useUser();
  const kyc = ((user?.unsafeMetadata as any)?.kyc as KYCData | undefined) ?? {
    status: 'not_started',
  };
  return {
    kyc,
    isVerified: kyc.status === 'verified',
    isPending: kyc.status === 'pending',
    isLoaded,
  };
}

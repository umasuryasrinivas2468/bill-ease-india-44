import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';

export interface PaymentSettings {
  id: string;
  user_id: string;
  razorpay_account_id: string | null;
  razorpay_account_status: string;
  razorpay_access_token: string | null;
  razorpay_refresh_token: string | null;
  razorpay_public_token: string | null;
  razorpay_token_expires_at: string | null;
  razorpay_product_id: string | null;
  created_at: string;
  updated_at: string;
}

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://vhntnkvtzmerpdhousfr.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

export const usePaymentSettings = () => {
  const { user } = useUser();

  return useQuery({
    queryKey: ['payment-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data as PaymentSettings | null;
    },
    enabled: !!user?.id,
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Start Razorpay Tech Partner OAuth onboarding.
// Returns { authorize_url }. Caller should `window.location.href = authorize_url`.
// ─────────────────────────────────────────────────────────────────────────
export const useStartRazorpayOnboarding = () => {
  const { user } = useUser();

  return useMutation({
    mutationFn: async (): Promise<{ authorize_url: string }> => {
      if (!user?.id) throw new Error('Not authenticated');

      const resp = await fetch(
        `${SUPABASE_URL}/functions/v1/razorpay-partner-authorize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ user_id: user.id }),
        },
      );
      const result = await resp.json();
      if (!resp.ok || !result.authorize_url) {
        throw new Error(result.error || 'Failed to start onboarding');
      }
      return result;
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Custom Onboarding SDK (KYC pre-fill)
// Step 1: create the sub-merchant account via Razorpay's onboarding API.
// Step 2: build the authorize URL with onboarding_signature.
// Caller should `window.location.href = authorize_url` on success.
// ─────────────────────────────────────────────────────────────────────────
export interface CustomOnboardingInput {
  email: string;
  phone: string;
  legal_business_name: string;
  business_type:
    | 'proprietorship'
    | 'partnership'
    | 'private_limited'
    | 'public_limited'
    | 'llp'
    | 'ngo'
    | 'trust'
    | 'society'
    | 'huf'
    | 'individual'
    | 'not_yet_registered';
  contact_name?: string;
  customer_facing_business_name?: string;
  business_pan?: string;
}

export const useStartCustomOnboarding = () => {
  const { user } = useUser();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (
      kyc: CustomOnboardingInput,
    ): Promise<{ authorize_url: string; submerchant_id: string }> => {
      if (!user?.id) throw new Error('Not authenticated');

      // Step 1 — create (or reuse) the sub-merchant account
      const createResp = await fetch(
        `${SUPABASE_URL}/functions/v1/razorpay-create-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ user_id: user.id, kyc }),
        },
      );
      const createResult = await createResp.json();
      if (!createResp.ok || !createResult.razorpay_account_id) {
        throw new Error(
          createResult.error || 'Failed to create Razorpay account',
        );
      }
      const submerchantId = createResult.razorpay_account_id as string;

      // Step 2 — build authorize URL with onboarding_signature
      const authResp = await fetch(
        `${SUPABASE_URL}/functions/v1/razorpay-partner-authorize`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            submerchant_id: submerchantId,
          }),
        },
      );
      const authResult = await authResp.json();
      if (!authResp.ok || !authResult.authorize_url) {
        throw new Error(authResult.error || 'Failed to build authorize URL');
      }

      // Refresh local payment_settings so the UI shows "Under Review" if the
      // user navigates away before completing the Razorpay redirect.
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });

      return {
        authorize_url: authResult.authorize_url as string,
        submerchant_id: submerchantId,
      };
    },
  });
};

// ─────────────────────────────────────────────────────────────────────────
// Force-refresh local payment_settings from Supabase (e.g. after callback).
// ─────────────────────────────────────────────────────────────────────────
export const useRefreshPaymentSettings = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
};

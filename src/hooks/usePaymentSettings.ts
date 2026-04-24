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
// Force-refresh local payment_settings from Supabase (e.g. after callback).
// ─────────────────────────────────────────────────────────────────────────
export const useRefreshPaymentSettings = () => {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useUser } from '@clerk/clerk-react';

export interface PaymentSettings {
  id: string;
  user_id: string;
  razorpay_account_id: string | null;
  razorpay_account_status: string;
  razorpay_product_id: string | null;
  created_at: string;
  updated_at: string;
}

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

export const useActivateRazorpayAccount = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const metadata = user.unsafeMetadata as any;
      const biz = metadata?.businessInfo;
      const bank = metadata?.bankDetails;

      if (!biz?.businessName || !biz?.email || !biz?.phone) {
        throw new Error('Please save your Business Information in the Business tab first.');
      }
      if (!bank?.accountNumber || !bank?.ifscCode || !bank?.accountHolderName) {
        throw new Error('Please save your Bank Details in the Banking tab first.');
      }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vhntnkvtzmerpdhousfr.supabase.co';
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          business: {
            legal_business_name: biz.businessName,
            contact_name: biz.ownerName || biz.businessName,
            email: biz.email,
            phone: biz.phone.replace(/[^\d]/g, '').slice(-10), // last 10 digits
            business_type: 'proprietorship',
            gst: biz.gstNumber || undefined,
            pan: biz.panNumber || undefined,
            address: {
              street1: biz.address || 'N/A',
              city: biz.city || 'N/A',
              state: biz.state || 'N/A',
              postal_code: biz.pincode ? String(biz.pincode) : '000000',
              country: 'IN',
            },
          },
          bank: {
            account_number: bank.accountNumber,
            ifsc_code: bank.ifscCode,
            beneficiary_name: bank.accountHolderName,
          },
        }),
      });

      const result = await resp.json();
      if (!resp.ok || result.error) {
        throw new Error(result.error || 'Failed to create Razorpay account');
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
    },
  });
};

export const useRefreshRazorpayStatus = () => {
  const queryClient = useQueryClient();
  const { user } = useUser();

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Not authenticated');

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://vhntnkvtzmerpdhousfr.supabase.co';
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k';

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          user_id: user.id,
          action: 'check_status',
        }),
      });

      const result = await resp.json();
      if (!resp.ok || result.error) {
        throw new Error(result.error || 'Failed to check status');
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-settings'] });
    },
  });
};

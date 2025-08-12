
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GSTVerificationResult {
  isValid: boolean;
  businessName?: string;
  address?: string;
  registrationDate?: string;
  status?: string;
  error?: string;
}

export const useSecureGSTVerification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifyGST = async (gstNumber: string): Promise<GSTVerificationResult> => {
    if (!gstNumber || gstNumber.length !== 15) {
      return { isValid: false, error: 'Invalid GST number format' };
    }

    setIsLoading(true);
    setError(null);

    try {
      // Call Supabase Edge Function for secure GST verification
      const { data, error: functionError } = await supabase.functions.invoke('verify-gst', {
        body: { gstNumber: gstNumber.toUpperCase() }
      });

      if (functionError) {
        console.error('GST verification error:', functionError);
        setError('Failed to verify GST number');
        return { isValid: false, error: 'Verification service unavailable' };
      }

      return data;
    } catch (err) {
      console.error('Unexpected error during GST verification:', err);
      setError('Verification failed');
      return { isValid: false, error: 'Unexpected error occurred' };
    } finally {
      setIsLoading(false);
    }
  };

  return { verifyGST, isLoading, error };
};


import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface GSTData {
  tradeNam?: string;
  lgnm?: string;
  pradr?: {
    addr?: {
      bno?: string;
      st?: string;
      loc?: string;
      dst?: string;
      stcd?: string;
      pncd?: string;
    };
  };
}

interface GSTVerificationResult {
  success: boolean;
  data?: GSTData;
  message?: string;
}

export const useGSTVerification = () => {
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const verifyGST = async (gstNumber: string): Promise<GSTVerificationResult> => {
    setIsVerifying(true);
    
    try {
      const apiKey = 'a086e21b711ed6dafa702fad477af597';
      const url = `https://sheet.gstincheck.co.in/check/${apiKey}/${gstNumber}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok && data) {
        return {
          success: true,
          data: data,
        };
      } else {
        toast({
          title: "GST Verification Failed",
          description: "Invalid GST number or verification service unavailable.",
          variant: "destructive",
        });
        return {
          success: false,
          message: "Invalid GST number",
        };
      }
    } catch (error) {
      console.error('GST verification error:', error);
      toast({
        title: "Verification Error",
        description: "Unable to verify GST number. Please check your internet connection.",
        variant: "destructive",
      });
      return {
        success: false,
        message: "Network error",
      };
    } finally {
      setIsVerifying(false);
    }
  };

  return {
    verifyGST,
    isVerifying,
  };
};

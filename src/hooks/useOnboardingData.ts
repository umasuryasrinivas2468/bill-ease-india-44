
import { useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BusinessInfo {
  businessName: string;
  ownerName: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  currency: string;
  gstRate: string;
  isImportExportApplicable: string;
  iecNumber: string;
  lutNumber: string;
}

export interface BankDetails {
  accountNumber: string;
  ifscCode: string;
  bankName: string;
  branchName: string;
  accountHolderName: string;
}

export interface BusinessAssets {
  logoUrl: string;
  signatureUrl: string;
}

export const useOnboardingData = (sessionId: string) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const saveBusinessInfo = async (businessInfo: BusinessInfo) => {
    if (!user?.id) {
      console.error('No user ID found');
      return false;
    }

    setIsLoading(true);
    try {
      console.log('Saving business info for user:', user.id);
      console.log('Business info data:', businessInfo);

      const { error } = await supabase
        .from('business_profiles')
        .upsert({
          user_id: user.id,
          business_name: businessInfo.businessName,
          owner_name: businessInfo.ownerName,
          email: businessInfo.email,
          phone: businessInfo.phone,
          gst_number: businessInfo.gstNumber,
          address: businessInfo.address,
          city: businessInfo.city,
          state: businessInfo.state,
          pincode: businessInfo.pincode,
          country: businessInfo.country,
          currency: businessInfo.currency,
          gst_rate: businessInfo.gstRate,
          is_import_export_applicable: businessInfo.isImportExportApplicable,
          iec_number: businessInfo.iecNumber,
          lut_number: businessInfo.lutNumber,
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving business info:', error);
        toast({
          title: "Error",
          description: "Failed to save business information. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      console.log('Business info saved successfully');
      toast({
        title: "Success",
        description: "Business information saved successfully!",
      });
      return true;
    } catch (error) {
      console.error('Error saving business info:', error);
      toast({
        title: "Error",
        description: "Failed to save business information. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const saveBankDetails = async (bankDetails: BankDetails) => {
    if (!user?.id) {
      console.error('No user ID found');
      return false;
    }

    setIsLoading(true);
    try {
      console.log('Saving bank details for user:', user.id);
      console.log('Bank details data:', bankDetails);

      const { error } = await supabase
        .from('bank_details')
        .upsert({
          user_id: user.id,
          account_number: bankDetails.accountNumber,
          ifsc_code: bankDetails.ifscCode,
          bank_name: bankDetails.bankName,
          branch_name: bankDetails.branchName,
          account_holder_name: bankDetails.accountHolderName,
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error('Error saving bank details:', error);
        toast({
          title: "Error",
          description: "Failed to save bank details. Please try again.",
          variant: "destructive",
        });
        return false;
      }

      console.log('Bank details saved successfully');
      toast({
        title: "Success",
        description: "Bank details saved successfully!",
      });
      return true;
    } catch (error) {
      console.error('Error saving bank details:', error);
      toast({
        title: "Error",
        description: "Failed to save bank details. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const saveBusinessAssets = async (assets: BusinessAssets) => {
    if (!user?.id) {
      console.error('No user ID found');
      return false;
    }

    setIsLoading(true);
    try {
      console.log('Saving business assets for user:', user.id);
      console.log('Business assets data:', assets);

      // Save both logo and signature in one record
      const { error } = await supabase
        .from('user_branding' as any)
        .upsert({
          user_id: user.id,
          logo_url: assets.logoUrl || null,
          signature_url: assets.signatureUrl || null,
        });

      if (error) {
        console.error('Error saving branding assets:', error);
        throw error;
      }

      console.log('Business assets saved successfully');
      toast({
        title: "Success",
        description: "Business branding assets saved successfully!",
      });
      return true;
    } catch (error) {
      console.error('Error saving business assets:', error);
      toast({
        title: "Error",
        description: "Failed to save business assets. Please try again.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    saveBusinessInfo,
    saveBankDetails,
    saveBusinessAssets,
    isLoading,
  };
};


import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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

// Generate a proper session ID for onboarding URL
const generateSessionId = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}${random}`;
};

export const useOnboardingState = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [sessionId] = useState(() => generateSessionId());
  const [currentStep, setCurrentStep] = useState('business');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);

  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    businessName: '',
    ownerName: '',
    email: user?.primaryEmailAddress?.emailAddress || '',
    phone: user?.primaryPhoneNumber?.phoneNumber || '',
    gstNumber: '',
    address: '',
    city: '',
    state: '',
    pincode: '',
    country: 'india',
    currency: 'INR',
    gstRate: '18',
    isImportExportApplicable: 'no',
    iecNumber: '',
    lutNumber: '',
  });

  const [bankDetails, setBankDetails] = useState<BankDetails>({
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountHolderName: '',
  });

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);

  useEffect(() => {
    console.log('Onboarding session started with ID:', sessionId);
    console.log('Session URL would be: /onboarding/', sessionId);
  }, [sessionId]);

  useEffect(() => {
    if (user) {
      setBusinessInfo(prev => ({
        ...prev,
        email: user.primaryEmailAddress?.emailAddress || prev.email,
        phone: user.primaryPhoneNumber?.phoneNumber || prev.phone,
      }));
    }
  }, [user]);

  // Update currency and GST rate when country changes
  useEffect(() => {
    if (businessInfo.country === 'singapore') {
      setBusinessInfo(prev => ({
        ...prev,
        currency: 'SGD',
        gstRate: prev.gstRate === '18' ? '8' : prev.gstRate,
      }));
    } else if (businessInfo.country === 'india') {
      setBusinessInfo(prev => ({
        ...prev,
        currency: 'INR',
        gstRate: prev.gstRate === '8' || prev.gstRate === '7' || prev.gstRate === '9' ? '18' : prev.gstRate,
      }));
    }
  }, [businessInfo.country]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const createUserAccount = async () => {
    try {
      // Create user profile in Supabase
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('clerk_id', user?.id)
        .single();

      if (!existingUser) {
        const { error: userError } = await supabase
          .from('users')
          .insert({
            clerk_id: user?.id,
            email: user?.primaryEmailAddress?.emailAddress || '',
            phone_number: user?.primaryPhoneNumber?.phoneNumber || null,
            full_name: user?.fullName || null,
          });

        if (userError) {
          console.error('Error creating user account:', userError);
          throw userError;
        }
      }

      // Create business profile
      const { error: businessError } = await supabase
        .from('business_profiles')
        .insert({
          user_id: user?.id,
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
        });

      if (businessError) {
        console.error('Error creating business profile:', businessError);
        throw businessError;
      }

      // Create bank details
      const { error: bankError } = await supabase
        .from('bank_details')
        .insert({
          user_id: user?.id,
          account_number: bankDetails.accountNumber,
          ifsc_code: bankDetails.ifscCode,
          bank_name: bankDetails.bankName,
          branch_name: bankDetails.branchName,
          account_holder_name: bankDetails.accountHolderName,
        });

      if (bankError) {
        console.error('Error creating bank details:', bankError);
        throw bankError;
      }

      console.log('User account created successfully');
    } catch (error) {
      console.error('Error creating user account:', error);
      throw error;
    }
  };

  const handleComplete = async () => {
    if (!logoFile || !signatureFile) {
      toast({
        title: "Missing Files",
        description: "Both business logo and digital signature are mandatory.",
        variant: "destructive",
      });
      return;
    }

    setIsCompleting(true);
    
    try {
      const logoBase64 = await fileToBase64(logoFile);
      const signatureBase64 = await fileToBase64(signatureFile);

      // Store business assets
      await supabase
        .from('business_assets')
        .insert([
          {
            user_id: user?.id,
            asset_type: 'logo',
            asset_data: logoBase64,
            file_name: logoFile.name,
            mime_type: logoFile.type,
          },
          {
            user_id: user?.id,
            asset_type: 'signature',
            asset_data: signatureBase64,
            file_name: signatureFile.name,
            mime_type: signatureFile.type,
          }
        ]);

      // Create user account and related data
      await createUserAccount();

      // Update Clerk user metadata
      await user?.update({
        unsafeMetadata: {
          onboardingCompleted: true,
          onboardingSessionId: sessionId,
        }
      });

      console.log('Onboarding completed successfully with session ID:', sessionId);

      toast({
        title: "Setup Complete!",
        description: "Welcome to Aczen Bilz. You're ready to start creating invoices.",
      });

      navigate('/', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast({
        title: "Error",
        description: "There was an issue completing your setup. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCompleting(false);
    }
  };

  return {
    sessionId,
    currentStep,
    setCurrentStep,
    completedSteps,
    setCompletedSteps,
    businessInfo,
    setBusinessInfo,
    bankDetails,
    setBankDetails,
    logoFile,
    setLogoFile,
    signatureFile,
    setSignatureFile,
    isCompleting,
    handleComplete,
    toast,
  };
};


import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
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

export const useOnboardingState = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
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
    if (user) {
      setBusinessInfo(prev => ({
        ...prev,
        email: user.primaryEmailAddress?.emailAddress || prev.email,
        phone: user.primaryPhoneNumber?.phoneNumber || prev.phone,
      }));
    }
  }, [user]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
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

      await user?.update({
        unsafeMetadata: {
          businessInfo,
          bankDetails,
          logoBase64,
          signatureBase64,
          onboardingCompleted: true,
        }
      });

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

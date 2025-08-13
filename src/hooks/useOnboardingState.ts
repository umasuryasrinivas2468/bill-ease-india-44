
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

const generateSessionId = (): string => {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');
  return `${dateStr}-${timeStr}`;
};

export const useOnboardingState = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState('business');
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sessionId] = useState(() => generateSessionId());

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

  const [logoUrl, setLogoUrl] = useState<string>('');
  const [signatureUrl, setSignatureUrl] = useState<string>('');

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

  // Update URL with session ID
  useEffect(() => {
    const currentUrl = window.location.pathname;
    if (currentUrl === '/onboarding' && sessionId) {
      window.history.replaceState(null, '', `/onboarding/${sessionId}`);
    }
  }, [sessionId]);

  const handleComplete = async () => {
    if (!logoUrl || !signatureUrl) {
      toast({
        title: "Missing Links",
        description: "Both business logo and digital signature links are mandatory.",
        variant: "destructive",
      });
      return;
    }

    setIsCompleting(true);
    
    try {
      await user?.update({
        unsafeMetadata: {
          businessInfo,
          bankDetails,
          logoUrl,
          signatureUrl,
          onboardingCompleted: true,
          sessionId,
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
    logoUrl,
    setLogoUrl,
    signatureUrl,
    setSignatureUrl,
    isCompleting,
    handleComplete,
    sessionId,
    toast,
  };
};


import { useUser } from '@clerk/clerk-react';

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
  logoBase64?: string;
  signatureBase64?: string;
  logoUrl?: string;
  signatureUrl?: string;
}

export const useBusinessData = () => {
  const { user } = useUser();

  const getBusinessInfo = (): BusinessInfo | null => {
    if (!user?.unsafeMetadata?.businessInfo) return null;
    return user.unsafeMetadata.businessInfo as BusinessInfo;
  };

  const getBankDetails = (): BankDetails | null => {
    if (!user?.unsafeMetadata?.bankDetails) return null;
    return user.unsafeMetadata.bankDetails as BankDetails;
  };

  const getBusinessAssets = (): BusinessAssets => {
    const metadata = user?.unsafeMetadata as any;
    return {
      logoBase64: metadata?.logoBase64 || '',
      signatureBase64: metadata?.signatureBase64 || '',
      logoUrl: metadata?.logoUrl || '',
      signatureUrl: metadata?.signatureUrl || '',
    };
  };

  const isOnboardingComplete = (): boolean => {
    return user?.unsafeMetadata?.onboardingCompleted === true;
  };

  return {
    getBusinessInfo,
    getBankDetails,
    getBusinessAssets,
    isOnboardingComplete,
    user,
  };
};

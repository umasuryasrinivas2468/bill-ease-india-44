import { useUser } from '@clerk/clerk-react';
import { useSimpleBranding } from './useSimpleBranding';

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
  // New database-based assets
  defaultLogo?: string;
  defaultSignature?: string;
  allLogos?: Array<{ id: string; name: string; url: string; isDefault: boolean }>;
  allSignatures?: Array<{ id: string; name: string; url: string; isDefault: boolean }>;
}

export const useEnhancedBusinessData = () => {
  const { user } = useUser();
  const { getBrandingWithFallback } = useSimpleBranding();

  const getBusinessInfo = (): BusinessInfo | null => {
    if (!user?.unsafeMetadata?.businessInfo) return null;
    return user.unsafeMetadata.businessInfo as BusinessInfo;
  };

  const getBankDetails = (): BankDetails | null => {
    if (!user?.unsafeMetadata?.bankDetails) return null;
    return user.unsafeMetadata.bankDetails as BankDetails;
  };

  const getBusinessAssets = (): BusinessAssets => {
    const brandingData = getBrandingWithFallback();
    const metadata = user?.unsafeMetadata as any;
    
    return {
      // Legacy Clerk metadata assets (for backward compatibility)
      logoBase64: metadata?.logoBase64 || '',
      signatureBase64: metadata?.signatureBase64 || '',
      logoUrl: brandingData.logo_url || metadata?.logoUrl || '',
      signatureUrl: brandingData.signature_url || metadata?.signatureUrl || '',
      
      // New database-based assets
      defaultLogo: brandingData.logo_url,
      defaultSignature: brandingData.signature_url,
      
      allLogos: [],
      allSignatures: []
    };
  };

  const isOnboardingComplete = (): boolean => {
    return user?.unsafeMetadata?.onboardingCompleted === true;
  };

  const hasLogo = (): boolean => {
    const assets = getBusinessAssets();
    return !!(assets.defaultLogo || assets.logoBase64 || assets.logoUrl);
  };

  const hasSignature = (): boolean => {
    const assets = getBusinessAssets();
    return !!(assets.defaultSignature || assets.signatureBase64 || assets.signatureUrl);
  };

  const getPreferredLogo = (): string => {
    const brandingData = getBrandingWithFallback();
    return brandingData.logo_url;
  };

  const getPreferredSignature = (): string => {
    const brandingData = getBrandingWithFallback();
    return brandingData.signature_url;
  };

  return {
    getBusinessInfo,
    getBankDetails,
    getBusinessAssets,
    isOnboardingComplete,
    hasLogo,
    hasSignature,
    getPreferredLogo,
    getPreferredSignature,
    user
  };
};
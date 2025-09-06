import { useBusinessData, BusinessInfo, BankDetails, BusinessAssets } from './useBusinessData';

export interface SettingsValidation {
  isBusinessInfoComplete: boolean;
  isBankDetailsComplete: boolean;
  isBrandingComplete: boolean;
  isAllSettingsComplete: boolean;
  missingFields: string[];
}

export const useSettingsValidation = (): SettingsValidation => {
  const { getBusinessInfo, getBankDetails, getBusinessAssets } = useBusinessData();

  const businessInfo = getBusinessInfo();
  const bankDetails = getBankDetails();
  const businessAssets = getBusinessAssets();

  const validateBusinessInfo = (info: BusinessInfo | null): boolean => {
    if (!info) return false;
    
    // Check required fields for business info
    const requiredFields = [
      'businessName',
      'ownerName', 
      'email',
      'phone',
      'address',
      'city',
      'state'
    ];
    
    return requiredFields.every(field => 
      info[field as keyof BusinessInfo] && 
      String(info[field as keyof BusinessInfo]).trim() !== ''
    );
  };

  const validateBankDetails = (details: BankDetails | null): boolean => {
    if (!details) return false;
    
    // Check required fields for bank details
    const requiredFields = [
      'accountNumber',
      'ifscCode',
      'bankName',
      'branchName',
      'accountHolderName'
    ];
    
    return requiredFields.every(field => 
      details[field as keyof BankDetails] && 
      String(details[field as keyof BankDetails]).trim() !== ''
    );
  };

  const validateBranding = (assets: BusinessAssets): boolean => {
    // At least logo should be present for branding
    return !!(assets.logoBase64 && assets.logoBase64.trim() !== '');
  };

  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    
    if (!validateBusinessInfo(businessInfo)) {
      missing.push('Business Information (Name, Owner, Email, Phone, Address, City, State)');
    }
    
    if (!validateBankDetails(bankDetails)) {
      missing.push('Bank Details (Account Number, IFSC Code, Bank Name, Branch Name, Account Holder Name)');
    }
    
    if (!validateBranding(businessAssets)) {
      missing.push('Business Logo');
    }
    
    return missing;
  };

  const isBusinessInfoComplete = validateBusinessInfo(businessInfo);
  const isBankDetailsComplete = validateBankDetails(bankDetails);
  const isBrandingComplete = validateBranding(businessAssets);
  const isAllSettingsComplete = isBusinessInfoComplete && isBankDetailsComplete && isBrandingComplete;
  const missingFields = getMissingFields();

  return {
    isBusinessInfoComplete,
    isBankDetailsComplete,
    isBrandingComplete,
    isAllSettingsComplete,
    missingFields,
  };
};
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useSettingsValidation } from './useSettingsValidation';
import { useBusinessData } from './useBusinessData';

// Mock the useBusinessData hook
vi.mock('./useBusinessData');

const mockUseBusinessData = vi.mocked(useBusinessData);

describe('useSettingsValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns all complete when all required fields are filled', () => {
    mockUseBusinessData.mockReturnValue({
      getBusinessInfo: () => ({
        businessName: 'Test Business',
        ownerName: 'John Doe',
        email: 'john@test.com',
        phone: '+1234567890',
        gstNumber: 'GST123456789',
        address: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        pincode: '12345',
        country: 'India',
        currency: 'INR',
        gstRate: '18',
        isImportExportApplicable: 'No',
        iecNumber: '',
        lutNumber: '',
      }),
      getBankDetails: () => ({
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234',
        bankName: 'Test Bank',
        branchName: 'Test Branch',
        accountHolderName: 'John Doe',
      }),
      getBusinessAssets: () => ({
        logoBase64: 'some-logo-base64',
        signatureBase64: 'some-signature-base64',
      }),
      isOnboardingComplete: () => true,
      user: null,
    });

    const { result } = renderHook(() => useSettingsValidation());

    expect(result.current.isBusinessInfoComplete).toBe(true);
    expect(result.current.isBankDetailsComplete).toBe(true);
    expect(result.current.isBrandingComplete).toBe(true);
    expect(result.current.isAllSettingsComplete).toBe(true);
    expect(result.current.missingFields).toHaveLength(0);
  });

  test('returns incomplete when business info is missing', () => {
    mockUseBusinessData.mockReturnValue({
      getBusinessInfo: () => null,
      getBankDetails: () => ({
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234',
        bankName: 'Test Bank',
        branchName: 'Test Branch',
        accountHolderName: 'John Doe',
      }),
      getBusinessAssets: () => ({
        logoBase64: 'some-logo-base64',
        signatureBase64: 'some-signature-base64',
      }),
      isOnboardingComplete: () => false,
      user: null,
    });

    const { result } = renderHook(() => useSettingsValidation());

    expect(result.current.isBusinessInfoComplete).toBe(false);
    expect(result.current.isBankDetailsComplete).toBe(true);
    expect(result.current.isBrandingComplete).toBe(true);
    expect(result.current.isAllSettingsComplete).toBe(false);
    expect(result.current.missingFields).toContain('Business Information (Name, Owner, Email, Phone, Address, City, State)');
  });

  test('returns incomplete when bank details are missing', () => {
    mockUseBusinessData.mockReturnValue({
      getBusinessInfo: () => ({
        businessName: 'Test Business',
        ownerName: 'John Doe',
        email: 'john@test.com',
        phone: '+1234567890',
        gstNumber: 'GST123456789',
        address: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        pincode: '12345',
        country: 'India',
        currency: 'INR',
        gstRate: '18',
        isImportExportApplicable: 'No',
        iecNumber: '',
        lutNumber: '',
      }),
      getBankDetails: () => null,
      getBusinessAssets: () => ({
        logoBase64: 'some-logo-base64',
        signatureBase64: 'some-signature-base64',
      }),
      isOnboardingComplete: () => false,
      user: null,
    });

    const { result } = renderHook(() => useSettingsValidation());

    expect(result.current.isBusinessInfoComplete).toBe(true);
    expect(result.current.isBankDetailsComplete).toBe(false);
    expect(result.current.isBrandingComplete).toBe(true);
    expect(result.current.isAllSettingsComplete).toBe(false);
    expect(result.current.missingFields).toContain('Bank Details (Account Number, IFSC Code, Bank Name, Branch Name, Account Holder Name)');
  });

  test('returns incomplete when logo is missing', () => {
    mockUseBusinessData.mockReturnValue({
      getBusinessInfo: () => ({
        businessName: 'Test Business',
        ownerName: 'John Doe',
        email: 'john@test.com',
        phone: '+1234567890',
        gstNumber: 'GST123456789',
        address: '123 Test St',
        city: 'Test City',
        state: 'Test State',
        pincode: '12345',
        country: 'India',
        currency: 'INR',
        gstRate: '18',
        isImportExportApplicable: 'No',
        iecNumber: '',
        lutNumber: '',
      }),
      getBankDetails: () => ({
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234',
        bankName: 'Test Bank',
        branchName: 'Test Branch',
        accountHolderName: 'John Doe',
      }),
      getBusinessAssets: () => ({
        logoBase64: '',
        signatureBase64: 'some-signature-base64',
      }),
      isOnboardingComplete: () => false,
      user: null,
    });

    const { result } = renderHook(() => useSettingsValidation());

    expect(result.current.isBusinessInfoComplete).toBe(true);
    expect(result.current.isBankDetailsComplete).toBe(true);
    expect(result.current.isBrandingComplete).toBe(false);
    expect(result.current.isAllSettingsComplete).toBe(false);
    expect(result.current.missingFields).toContain('Business Logo');
  });

  test('handles incomplete business info with missing fields', () => {
    mockUseBusinessData.mockReturnValue({
      getBusinessInfo: () => ({
        businessName: 'Test Business',
        ownerName: '', // Missing
        email: 'john@test.com',
        phone: '', // Missing
        gstNumber: 'GST123456789',
        address: '123 Test St',
        city: '', // Missing
        state: 'Test State',
        pincode: '12345',
        country: 'India',
        currency: 'INR',
        gstRate: '18',
        isImportExportApplicable: 'No',
        iecNumber: '',
        lutNumber: '',
      }),
      getBankDetails: () => ({
        accountNumber: '1234567890',
        ifscCode: 'TEST0001234',
        bankName: 'Test Bank',
        branchName: 'Test Branch',
        accountHolderName: 'John Doe',
      }),
      getBusinessAssets: () => ({
        logoBase64: 'some-logo-base64',
        signatureBase64: 'some-signature-base64',
      }),
      isOnboardingComplete: () => false,
      user: null,
    });

    const { result } = renderHook(() => useSettingsValidation());

    expect(result.current.isBusinessInfoComplete).toBe(false);
    expect(result.current.isAllSettingsComplete).toBe(false);
    expect(result.current.missingFields).toContain('Business Information (Name, Owner, Email, Phone, Address, City, State)');
  });
});
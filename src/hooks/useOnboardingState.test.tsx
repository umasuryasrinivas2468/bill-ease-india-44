import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useOnboardingState } from './useOnboardingState';

// Mock Clerk user
const mockUser = {
  primaryEmailAddress: { emailAddress: 'test@example.com' },
  primaryPhoneNumber: { phoneNumber: '+1234567890' },
  update: vi.fn(),
};

const mockNavigate = vi.fn();
const mockToast = vi.fn();

// Mock dependencies
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: mockUser }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('./useOnboardingData', () => ({
  useOnboardingData: () => ({
    saveBusinessInfo: vi.fn().mockResolvedValue(true),
    saveBankDetails: vi.fn().mockResolvedValue(true),
    saveBusinessAssets: vi.fn().mockResolvedValue(true),
    isLoading: false,
  }),
}));

describe('useOnboardingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.location and history
    Object.defineProperty(window, 'location', {
      value: { pathname: '/onboarding' },
      writable: true,
    });
    Object.defineProperty(window, 'history', {
      value: { replaceState: vi.fn() },
      writable: true,
    });
  });

  describe('Happy Path Scenarios', () => {
    it('should redirect to dashboard on completion', async () => {
      const { result } = renderHook(() => useOnboardingState());

      // Set up completed state with valid assets
      act(() => {
        result.current.setBusinessAssets({
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        });
      });

      // Complete onboarding
      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });

    it('should generate unique session ID', () => {
      const { result } = renderHook(() => useOnboardingState());
      
      expect(result.current.sessionId).toBeDefined();
      expect(result.current.sessionId).toMatch(/^\d{8}-\d{6}$/);
    });

    it('should initialize with business step', () => {
      const { result } = renderHook(() => useOnboardingState());
      
      expect(result.current.currentStep).toBe('business');
      expect(result.current.completedSteps).toEqual([]);
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should validate required logo and signature URLs', async () => {
      const { result } = renderHook(() => useOnboardingState());

      // Try to complete with empty assets
      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Missing Links",
        description: "Both business logo and digital signature links are mandatory.",
        variant: "destructive",
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('should validate logo URL only missing', async () => {
      const { result } = renderHook(() => useOnboardingState());

      // Set only signature URL
      act(() => {
        result.current.setBusinessAssets({
          logoUrl: '',
          signatureUrl: 'https://example.com/signature.png',
        });
      });

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Missing Links",
        description: "Both business logo and digital signature links are mandatory.",
        variant: "destructive",
      });
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle navigation failure gracefully', async () => {
      const { result } = renderHook(() => useOnboardingState());
      
      // Mock navigation failure
      mockNavigate.mockImplementation(() => {
        throw new Error('Navigation failed');
      });

      // Set up valid assets
      act(() => {
        result.current.setBusinessAssets({
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        });
      });

      // Attempt completion
      await act(async () => {
        try {
          await result.current.handleComplete();
        } catch (error) {
          // Expected to catch the error
        }
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "There was an issue completing your setup. Please try again.",
        variant: "destructive",
      });
    });

    it('should handle user update errors', async () => {
      const { result } = renderHook(() => useOnboardingState());
      
      // Mock user update failure
      mockUser.update.mockRejectedValue(new Error('Update failed'));

      // Set up valid assets
      act(() => {
        result.current.setBusinessAssets({
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        });
      });

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: "Error",
        description: "There was an issue completing your setup. Please try again.",
        variant: "destructive",
      });
    });
  });

  describe('Additional Functionality', () => {
    it('should update business info with user email and phone', () => {
      const { result } = renderHook(() => useOnboardingState());
      
      expect(result.current.businessInfo.email).toBe('test@example.com');
      expect(result.current.businessInfo.phone).toBe('+1234567890');
    });

    it('should progress through steps correctly', async () => {
      const { result } = renderHook(() => useOnboardingState());

      // Complete business step
      await act(async () => {
        await result.current.handleBusinessNext();
      });

      expect(result.current.completedSteps).toContain('business');
      expect(result.current.currentStep).toBe('banking');

      // Complete banking step
      await act(async () => {
        await result.current.handleBankingNext();
      });

      expect(result.current.completedSteps).toContain('banking');
      expect(result.current.currentStep).toBe('branding');
    });

    it('should update currency based on country selection', () => {
      const { result } = renderHook(() => useOnboardingState());

      // Change to Singapore
      act(() => {
        result.current.setBusinessInfo({
          ...result.current.businessInfo,
          country: 'singapore',
        });
      });

      expect(result.current.businessInfo.currency).toBe('SGD');

      // Change back to India
      act(() => {
        result.current.setBusinessInfo({
          ...result.current.businessInfo,
          country: 'india',
        });
      });

      expect(result.current.businessInfo.currency).toBe('INR');
    });

    it('should update URL with session ID', () => {
      renderHook(() => useOnboardingState());

      expect(window.history.replaceState).toHaveBeenCalled();
    });

    it('should save onboarding completion to user metadata', async () => {
      const { result } = renderHook(() => useOnboardingState());

      // Set up valid assets
      act(() => {
        result.current.setBusinessAssets({
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        });
      });

      await act(async () => {
        await result.current.handleComplete();
      });

      expect(mockUser.update).toHaveBeenCalledWith({
        unsafeMetadata: expect.objectContaining({
          businessInfo: expect.any(Object),
          bankDetails: expect.any(Object),
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
          onboardingCompleted: true,
          sessionId: expect.stringMatching(/^\d{8}-\d{6}$/),
        }),
      });
    });
  });
});
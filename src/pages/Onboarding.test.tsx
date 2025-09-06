import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Onboarding from './Onboarding';
import { useOnboardingState } from '@/hooks/useOnboardingState';

// Mock the useOnboardingState hook
vi.mock('@/hooks/useOnboardingState', () => ({
  useOnboardingState: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock navigation hook
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Mock onboarding step components
vi.mock('@/components/onboarding/BusinessInfoStep', () => ({
  BusinessInfoStep: ({ onNext }: { onNext: () => void }) => (
    <div data-testid="business-info-step">
      <button onClick={onNext} data-testid="business-next-btn">Next</button>
    </div>
  ),
}));

vi.mock('@/components/onboarding/BankingDetailsStep', () => ({
  BankingDetailsStep: ({ onNext }: { onNext: () => void }) => (
    <div data-testid="banking-details-step">
      <button onClick={onNext} data-testid="banking-next-btn">Next</button>
    </div>
  ),
}));

vi.mock('@/components/onboarding/BrandingStep', () => ({
  BrandingStep: ({ onComplete }: { onComplete: () => void }) => (
    <div data-testid="branding-step">
      <button onClick={onComplete} data-testid="complete-btn">Complete</button>
    </div>
  ),
}));

const createTestQueryClient = () => {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
};

const renderWithProviders = (component: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </QueryClientProvider>
  );
};

const mockOnboardingState = {
  currentStep: 'business',
  setCurrentStep: vi.fn(),
  completedSteps: [],
  businessInfo: {
    businessName: '',
    ownerName: '',
    email: '',
    phone: '',
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
  },
  setBusinessInfo: vi.fn(),
  bankDetails: {
    accountNumber: '',
    ifscCode: '',
    bankName: '',
    branchName: '',
    accountHolderName: '',
  },
  setBankDetails: vi.fn(),
  businessAssets: {
    logoUrl: '',
    signatureUrl: '',
  },
  setBusinessAssets: vi.fn(),
  isCompleting: false,
  handleBusinessNext: vi.fn(),
  handleBankingNext: vi.fn(),
  handleComplete: vi.fn(),
  sessionId: '20240115-100000',
};

describe('Onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useOnboardingState).mockReturnValue(mockOnboardingState);
  });

  describe('Happy Path Scenarios', () => {
    it('should redirect to dashboard on completion', async () => {
      const user = userEvent.setup();
      const mockHandleComplete = vi.fn().mockResolvedValue(undefined);
      
      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        currentStep: 'branding',
        completedSteps: ['business', 'banking'],
        businessAssets: {
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        },
        handleComplete: mockHandleComplete,
      });

      renderWithProviders(<Onboarding />);

      const completeButton = screen.getByTestId('complete-btn');
      await user.click(completeButton);

      expect(mockHandleComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should validate required logo and signature URLs', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();
      const mockHandleComplete = vi.fn().mockImplementation(() => {
        mockToast({
          title: "Missing Links",
          description: "Both business logo and digital signature links are mandatory.",
          variant: "destructive",
        });
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        currentStep: 'branding',
        completedSteps: ['business', 'banking'],
        businessAssets: {
          logoUrl: '', // Empty logo URL
          signatureUrl: '', // Empty signature URL
        },
        handleComplete: mockHandleComplete,
      });

      renderWithProviders(<Onboarding />);

      const completeButton = screen.getByTestId('complete-btn');
      await user.click(completeButton);

      expect(mockHandleComplete).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Missing Links",
        description: "Both business logo and digital signature links are mandatory.",
        variant: "destructive",
      });
    });

    it('should validate logo URL only missing', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();
      const mockHandleComplete = vi.fn().mockImplementation(() => {
        mockToast({
          title: "Missing Links",
          description: "Both business logo and digital signature links are mandatory.",
          variant: "destructive",
        });
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        currentStep: 'branding',
        completedSteps: ['business', 'banking'],
        businessAssets: {
          logoUrl: '', // Empty logo URL
          signatureUrl: 'https://example.com/signature.png',
        },
        handleComplete: mockHandleComplete,
      });

      renderWithProviders(<Onboarding />);

      const completeButton = screen.getByTestId('complete-btn');
      await user.click(completeButton);

      expect(mockHandleComplete).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith({
        title: "Missing Links",
        description: "Both business logo and digital signature links are mandatory.",
        variant: "destructive",
      });
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle navigation failure gracefully', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();
      const mockHandleComplete = vi.fn().mockRejectedValue(new Error('Navigation failed'));

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        currentStep: 'branding',
        completedSteps: ['business', 'banking'],
        businessAssets: {
          logoUrl: 'https://example.com/logo.png',
          signatureUrl: 'https://example.com/signature.png',
        },
        handleComplete: mockHandleComplete,
      });

      renderWithProviders(<Onboarding />);

      const completeButton = screen.getByTestId('complete-btn');
      await user.click(completeButton);

      expect(mockHandleComplete).toHaveBeenCalledTimes(1);
    });

    it('should handle onboarding state loading errors', () => {
      vi.mocked(useOnboardingState).mockImplementation(() => {
        throw new Error('Failed to load onboarding state');
      });

      expect(() => {
        renderWithProviders(<Onboarding />);
      }).toThrow('Failed to load onboarding state');
    });
  });

  describe('Additional Functionality', () => {
    it('should display session ID correctly', () => {
      renderWithProviders(<Onboarding />);

      expect(screen.getByText(/Session: 20240115-100000/)).toBeInTheDocument();
    });

    it('should show correct step progression', () => {
      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        completedSteps: ['business'],
      });

      renderWithProviders(<Onboarding />);

      // Business tab should show as completed
      const businessTab = screen.getByRole('tab', { name: /Business/ });
      expect(businessTab).toBeInTheDocument();
    });

    it('should disable banking tab when business not completed', () => {
      renderWithProviders(<Onboarding />);

      const bankingTab = screen.getByRole('tab', { name: /Banking/ });
      expect(bankingTab).toHaveAttribute('data-disabled', 'true');
    });

    it('should enable banking tab when business completed', () => {
      vi.mocked(useOnboardingState).mockReturnValue({
        ...mockOnboardingState,
        completedSteps: ['business'],
      });

      renderWithProviders(<Onboarding />);

      const bankingTab = screen.getByRole('tab', { name: /Banking/ });
      expect(bankingTab).not.toHaveAttribute('data-disabled', 'true');
    });

    it('should display welcome message', () => {
      renderWithProviders(<Onboarding />);

      expect(screen.getByText('Welcome to Aczen Bilz!')).toBeInTheDocument();
      expect(screen.getByText("Let's set up your business profile")).toBeInTheDocument();
    });
  });
});
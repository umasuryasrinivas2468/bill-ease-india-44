import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import Settings from './Settings';

// Mock Clerk user
const mockUser = {
  unsafeMetadata: {
    businessInfo: {
      businessName: 'Test Business',
      ownerName: 'John Doe',
      email: 'john@test.com',
      phone: '+1234567890',
      gstNumber: '123456789',
      address: '123 Test Street',
      city: 'Test City',
      state: 'Test State',
      pincode: '123456',
    },
    bankDetails: {
      accountNumber: '1234567890',
      ifscCode: 'TEST0123456',
      bankName: 'Test Bank',
      branchName: 'Test Branch',
      accountHolderName: 'John Doe',
    },
    logoUrl: 'https://example.com/logo.png',
    signatureUrl: 'https://example.com/signature.png',
  },
  update: vi.fn(),
};

const mockUserWithoutAssets = {
  unsafeMetadata: {
    businessInfo: {
      businessName: 'Test Business',
      ownerName: 'John Doe',
    },
    bankDetails: {
      accountNumber: '1234567890',
    },
  },
  update: vi.fn(),
};

vi.mock('@clerk/clerk-react', () => ({
  useUser: vi.fn(),
}));

// Mock the toast hook
vi.mock('@/hooks/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock UI components
vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

describe('Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Happy Path Scenarios', () => {
    it('should display logo links from onboarding', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      // Check that logo URL from onboarding is displayed
      const logoDisplays = screen.getAllByText('https://example.com/logo.png');
      expect(logoDisplays.length).toBeGreaterThan(0);

      // Check that signature URL from onboarding is displayed
      const signatureDisplays = screen.getAllByText('https://example.com/signature.png');
      expect(signatureDisplays.length).toBeGreaterThan(0);
    });

    it('should save business information successfully', async () => {
      const user = userEvent.setup();
      const mockUpdate = vi.fn().mockResolvedValue({});

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: { ...mockUser, update: mockUpdate },
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      render(<Settings />);

      // Update business name
      const businessNameInput = screen.getByDisplayValue('Test Business');
      await user.clear(businessNameInput);
      await user.type(businessNameInput, 'Updated Business');

      // Save business info
      const saveBusinessBtn = screen.getByRole('button', { name: /Save Business Info/i });
      await user.click(saveBusinessBtn);

      await waitFor(() => {
        expect(mockUpdate).toHaveBeenCalledWith({
          unsafeMetadata: expect.objectContaining({
            businessInfo: expect.objectContaining({
              businessName: 'Updated Business',
            }),
          }),
        });
      });

      expect(mockToast).toHaveBeenCalledWith({
        title: 'Success',
        description: 'Business information updated successfully',
      });
    });
  });

  describe('Branching Scenarios', () => {
    it('should prevent logo signature upload functionality', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      // Check that file upload inputs are not present
      const logoUploadInput = screen.queryByLabelText(/upload.*logo/i);
      const signatureUploadInput = screen.queryByLabelText(/upload.*signature/i);

      expect(logoUploadInput).not.toBeInTheDocument();
      expect(signatureUploadInput).not.toBeInTheDocument();

      // Check that upload buttons are not present
      const uploadButtons = screen.queryAllByRole('button', { name: /upload/i });
      expect(uploadButtons).toHaveLength(0);
    });

    it('should show logo and signature as read-only links', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      // Logo and signature should be displayed as text/links, not as uploadable inputs
      expect(screen.getByText('https://example.com/logo.png')).toBeInTheDocument();
      expect(screen.getByText('https://example.com/signature.png')).toBeInTheDocument();

      // Verify no file input elements exist for logo/signature
      const fileInputs = document.querySelectorAll('input[type="file"]');
      const logoFileInput = Array.from(fileInputs).find(input => 
        input.getAttribute('accept')?.includes('image')
      );
      expect(logoFileInput).toBeUndefined();
    });
  });

  describe('Exception Handling Scenarios', () => {
    it('should handle missing onboarding assets gracefully', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUserWithoutAssets,
      });

      render(<Settings />);

      // Should render without crashing even when logo/signature URLs are missing
      expect(screen.getByText('Settings')).toBeInTheDocument();

      // Should show placeholder or empty state for missing assets
      const brandingTab = screen.getByRole('tab', { name: /Branding/i });
      expect(brandingTab).toBeInTheDocument();
    });

    it('should handle user metadata update errors', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();
      const mockUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: { ...mockUser, update: mockUpdate },
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      render(<Settings />);

      // Try to save business info
      const saveBusinessBtn = screen.getByRole('button', { name: /Save Business Info/i });
      await user.click(saveBusinessBtn);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Failed to update business information',
          variant: 'destructive',
        });
      });
    });

    it('should handle null user gracefully', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: null,
      });

      render(<Settings />);

      // Should render basic structure even without user
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  describe('Input Verification Scenarios', () => {
    it('should validate account number format', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      render(<Settings />);

      // Switch to banking tab
      const bankingTab = screen.getByRole('tab', { name: /Banking/i });
      await user.click(bankingTab);

      // Enter invalid account number
      const accountNumberInput = screen.getByDisplayValue('1234567890');
      await user.clear(accountNumberInput);
      await user.type(accountNumberInput, '123'); // Too short

      // Try to save
      const saveBankBtn = screen.getByRole('button', { name: /Save Banking Details/i });
      await user.click(saveBankBtn);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Validation Error',
          description: 'Please check your account number format (9-18 digits)',
          variant: 'destructive',
        });
      });
    });

    it('should validate IFSC code format', async () => {
      const user = userEvent.setup();
      const mockToast = vi.fn();

      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      vi.mocked(require('@/hooks/use-toast').useToast).mockReturnValue({
        toast: mockToast,
      });

      render(<Settings />);

      // Switch to banking tab
      const bankingTab = screen.getByRole('tab', { name: /Banking/i });
      await user.click(bankingTab);

      // Enter invalid IFSC code
      const ifscInput = screen.getByDisplayValue('TEST0123456');
      await user.clear(ifscInput);
      await user.type(ifscInput, 'INVALID'); // Invalid format

      // Try to save
      const saveBankBtn = screen.getByRole('button', { name: /Save Banking Details/i });
      await user.click(saveBankBtn);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Validation Error',
          description: 'Please enter a valid IFSC code (e.g., ABCD0123456)',
          variant: 'destructive',
        });
      });
    });
  });

  describe('Additional Functionality', () => {
    it('should display all tabs correctly', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      expect(screen.getByRole('tab', { name: /Business/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Banking/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Branding/i })).toBeInTheDocument();
    });

    it('should show business info form fields', () => {
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      expect(screen.getByDisplayValue('Test Business')).toBeInTheDocument();
      expect(screen.getByDisplayValue('John Doe')).toBeInTheDocument();
      expect(screen.getByDisplayValue('john@test.com')).toBeInTheDocument();
      expect(screen.getByDisplayValue('+1234567890')).toBeInTheDocument();
    });

    it('should switch between tabs correctly', async () => {
      const user = userEvent.setup();
      
      vi.mocked(require('@clerk/clerk-react').useUser).mockReturnValue({
        user: mockUser,
      });

      render(<Settings />);

      // Switch to banking tab
      const bankingTab = screen.getByRole('tab', { name: /Banking/i });
      await user.click(bankingTab);

      expect(screen.getByDisplayValue('1234567890')).toBeInTheDocument(); // Account number

      // Switch to branding tab
      const brandingTab = screen.getByRole('tab', { name: /Branding/i });
      await user.click(brandingTab);

      expect(screen.getByText('https://example.com/logo.png')).toBeInTheDocument();
    });
  });
});
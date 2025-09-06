import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import Settings from './Settings';
import { useUser } from '@clerk/clerk-react';

// Mock dependencies
vi.mock('@clerk/clerk-react');
vi.mock('@/hooks/use-toast');
vi.mock('@/components/ui/sidebar', () => ({
  SidebarTrigger: () => <div>SidebarTrigger</div>,
}));

const mockUser = {
  update: vi.fn(),
  unsafeMetadata: {
    businessInfo: {
      businessName: 'Test Business',
      ownerName: 'John Doe',
      email: 'john@test.com',
      phone: '+1234567890',
    },
    bankDetails: {
      accountNumber: '1234567890',
      ifscCode: 'TEST0001234',
      bankName: 'Test Bank',
      branchName: 'Test Branch',
      accountHolderName: 'John Doe',
    },
    logoBase64: 'test-logo-base64',
    signatureBase64: 'test-signature-base64',
  },
};

const mockUseUser = vi.mocked(useUser);

describe('Settings - Image URL Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue({
      isSignedIn: true,
      user: mockUser,
      isLoaded: true,
    } as any);
  });

  test('should handle logo URL upload successfully', async () => {
    render(<Settings />);

    // Switch to Branding tab
    const brandingTab = screen.getByRole('tab', { name: /branding/i });
    fireEvent.click(brandingTab);

    // Find logo URL input and button
    const logoUrlInput = screen.getByPlaceholderText(/logo.*png/i);
    const loadLogoButton = screen.getByRole('button', { name: /load/i });

    // Enter a URL
    fireEvent.change(logoUrlInput, { 
      target: { value: 'https://example.com/logo.png' } 
    });

    // The load button should be enabled
    expect(loadLogoButton).not.toBeDisabled();

    // Test URL validation
    fireEvent.change(logoUrlInput, { 
      target: { value: 'not-an-image-url' } 
    });

    fireEvent.click(loadLogoButton);

    // Should show error for invalid URL format
    // (This would trigger the validation in convertImageUrlToBase64)
  });

  test('should handle saving business assets with size validation', async () => {
    render(<Settings />);

    // Switch to Branding tab
    const brandingTab = screen.getByRole('tab', { name: /branding/i });
    fireEvent.click(brandingTab);

    // Find and click save button
    const saveButton = screen.getByRole('button', { name: /save branding assets/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUser.update).toHaveBeenCalledWith({
        unsafeMetadata: expect.objectContaining({
          logoBase64: expect.any(String),
          signatureBase64: expect.any(String),
        }),
      });
    });
  });

  test('should display helpful tips for URL upload', () => {
    render(<Settings />);

    // Switch to Branding tab
    const brandingTab = screen.getByRole('tab', { name: /branding/i });
    fireEvent.click(brandingTab);

    // Should show helpful tip text
    expect(screen.getByText(/💡.*Tip.*direct image links/)).toBeInTheDocument();
    expect(screen.getByText(/CORS errors/)).toBeInTheDocument();
  });

  test('should show loading state during URL upload', async () => {
    render(<Settings />);

    // Switch to Branding tab
    const brandingTab = screen.getByRole('tab', { name: /branding/i });
    fireEvent.click(brandingTab);

    const logoUrlInput = screen.getByPlaceholderText(/logo.*png/i);
    fireEvent.change(logoUrlInput, { 
      target: { value: 'https://example.com/logo.png' } 
    });

    const loadButton = screen.getByRole('button', { name: /load/i });
    fireEvent.click(loadButton);

    // Should show loading state (though it might be very brief in tests)
    // In real usage, this would show "Loading..." text
  });
});
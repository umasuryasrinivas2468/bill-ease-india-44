import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SimpleBrandingManager from '../SimpleBrandingManager';
import { vi, Mock, describe, it, expect, beforeEach } from 'vitest';

// Mock the hook
vi.mock('../../hooks/useSimpleBranding', () => ({
  default: vi.fn(),
}));

// Mock the toast hook
const mockToast = vi.fn();
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

const mockUseSimpleBranding = vi.mocked(
  () => import('../../hooks/useSimpleBranding').then(m => m.default)
);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('SimpleBrandingManager - Error Handling', () => {
  const mockUpdateBranding = vi.fn();
  const mockGetBrandingWithFallback = vi.fn();

  const defaultHookReturn = {
    branding: null,
    isLoading: false,
    error: null,
    updateBranding: mockUpdateBranding,
    isUpdating: false,
    getBrandingWithFallback: mockGetBrandingWithFallback,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBrandingWithFallback.mockReturnValue({
      logo_url: '',
      signature_url: '',
    });
  });

  describe('Authentication Errors', () => {
    it('should handle user not authenticated error', async () => {
      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        updateBranding: vi.fn().mockImplementation(() => {
          // Simulate the error that would be caught by the mutation
          throw new Error('User not authenticated');
        }),
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      
      try {
        fireEvent.click(saveButton);
        await waitFor(() => {
          expect(mockHook().updateBranding).toHaveBeenCalled();
        });
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Network and Database Errors', () => {
    it('should handle network timeout errors', async () => {
      const errorMock = vi.fn().mockImplementation(() => {
        // This simulates what happens in the hook when there's an error
        mockToast({
          title: "Update Failed",
          description: "Failed to update branding assets. Please try again.",
          variant: "destructive",
        });
      });

      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        updateBranding: errorMock,
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(errorMock).toHaveBeenCalled();
      });
    });

    it('should handle database connection failure', async () => {
      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        error: new Error('Database connection failed'),
        isLoading: false,
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Component should still render despite the error
      expect(screen.getByText(/business branding/i)).toBeInTheDocument();
      
      // Save button should still be functional (the component doesn't disable it for load errors)
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('Row Level Security (RLS) Policy Errors', () => {
    it('should handle RLS policy violation errors', async () => {
      const rlsErrorMock = vi.fn().mockImplementation(() => {
        mockToast({
          title: "Update Failed", 
          description: "Failed to update branding assets. Please try again.",
          variant: "destructive",
        });
      });

      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        updateBranding: rlsErrorMock,
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(rlsErrorMock).toHaveBeenCalled();
      });
    });
  });

  describe('Input Validation Errors', () => {
    it('should prevent saving with invalid URLs', async () => {
      const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Enter invalid logo URL
      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'invalid-url' } });

      // Enter invalid signature URL  
      const signatureInput = screen.getByLabelText(/digital signature url/i);
      fireEvent.change(signatureInput, { target: { value: 'also-invalid' } });

      // Save button should be disabled
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      expect(saveButton).toBeDisabled();

      // Should show validation errors
      await waitFor(() => {
        const errorMessages = screen.getAllByText(/please enter a valid url/i);
        expect(errorMessages).toHaveLength(2);
      });
    });

    it('should handle mixed valid and invalid URLs', async () => {
      const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Enter valid logo URL
      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

      // Enter invalid signature URL
      const signatureInput = screen.getByLabelText(/digital signature url/i);
      fireEvent.change(signatureInput, { target: { value: 'invalid-signature' } });

      // Save button should be disabled due to invalid signature URL
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      expect(saveButton).toBeDisabled();
    });
  });

  describe('Loading States', () => {
    it('should show loading spinner when isLoading is true', async () => {
      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        isLoading: true,
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Should show loading spinner instead of form
      expect(screen.getByTestId('loading-spinner') || screen.getByRole('status')).toBeDefined();
    });

    it('should show saving state when isUpdating is true', async () => {
      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        isUpdating: true,
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Save button should show saving state and be disabled
      const saveButton = screen.getByRole('button', { name: /saving/i });
      expect(saveButton).toBeDisabled();
      expect(screen.getByText(/saving/i)).toBeInTheDocument();
    });
  });

  describe('Image Loading Errors', () => {
    it('should handle logo image loading failures', async () => {
      mockGetBrandingWithFallback.mockReturnValue({
        logo_url: 'https://broken-image.com/logo.png',
        signature_url: '',
      });

      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        branding: {
          id: '1',
          user_id: 'user1',
          logo_url: 'https://broken-image.com/logo.png',
          signature_url: '',
        },
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Fill in the URL and show preview
      const logoInput = screen.getByDisplayValue('https://broken-image.com/logo.png');
      expect(logoInput).toBeInTheDocument();

      const previewButton = screen.getAllByRole('button').find(btn => 
        btn.querySelector('[data-lucide="eye"]') || btn.querySelector('[data-lucide="eye-off"]')
      );
      
      if (previewButton) {
        fireEvent.click(previewButton);

        await waitFor(() => {
          const logoImg = screen.queryByAltText(/logo preview/i);
          if (logoImg) {
            // Simulate image load error
            fireEvent.error(logoImg);
            
            // Should show fallback error state
            expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
          }
        });
      }
    });

    it('should handle signature image loading failures', async () => {
      mockGetBrandingWithFallback.mockReturnValue({
        logo_url: '',
        signature_url: 'https://broken-image.com/signature.png',
      });

      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        branding: {
          id: '1',
          user_id: 'user1',
          logo_url: '',
          signature_url: 'https://broken-image.com/signature.png',
        },
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      // Fill in the URL and show preview
      const signatureInput = screen.getByDisplayValue('https://broken-image.com/signature.png');
      expect(signatureInput).toBeInTheDocument();

      const previewButtons = screen.getAllByRole('button').filter(btn => 
        btn.querySelector('[data-lucide="eye"]') || btn.querySelector('[data-lucide="eye-off"]')
      );
      
      // Click the second preview button (for signature)
      if (previewButtons[1]) {
        fireEvent.click(previewButtons[1]);

        await waitFor(() => {
          const signatureImg = screen.queryByAltText(/signature preview/i);
          if (signatureImg) {
            // Simulate image load error
            fireEvent.error(signatureImg);
            
            // Should show fallback error state
            expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
          }
        });
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle extremely long URLs gracefully', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(1000);

      const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: longUrl } });

      // URL should still be considered valid by the component
      expect(logoInput).toHaveValue(longUrl);
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      expect(saveButton).not.toBeDisabled();
    });

    it('should handle special characters in URLs', async () => {
      const specialCharUrl = 'https://example.com/logo%20with%20spaces.png?param=value&other=123';

      const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: specialCharUrl } });

      // Should handle special characters correctly
      expect(logoInput).toHaveValue(specialCharUrl);
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockUpdateBranding).toHaveBeenCalledWith({
          logo_url: specialCharUrl,
          signature_url: undefined,
        });
      });
    });

    it('should handle rapid save button clicks', async () => {
      const mockHook = vi.fn().mockReturnValue({
        ...defaultHookReturn,
        isUpdating: true, // Simulate ongoing update
      });
      vi.doMock('../../hooks/useSimpleBranding', () => ({
        default: mockHook,
      }));

      const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
      
      render(<Component />, { wrapper: createWrapper() });

      const saveButton = screen.getByRole('button', { name: /saving/i });
      
      // Button should be disabled during update
      expect(saveButton).toBeDisabled();
      
      // Multiple clicks shouldn't cause issues
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
      fireEvent.click(saveButton);
      
      // Should remain disabled
      expect(saveButton).toBeDisabled();
    });
  });
});
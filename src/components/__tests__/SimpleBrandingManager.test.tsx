import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SimpleBrandingManager from '../SimpleBrandingManager';
import { vi, Mock } from 'vitest';

// Mock the hook
vi.mock('../../hooks/useSimpleBranding', () => ({
  default: vi.fn(),
}));

// Mock the toast hook
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
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

describe('SimpleBrandingManager', () => {
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

  it('should save branding URLs successfully', async () => {
    const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
    vi.doMock('../../hooks/useSimpleBranding', () => ({
      default: mockHook,
    }));

    const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
    
    render(<Component />, { wrapper: createWrapper() });

    // Fill in logo URL
    const logoInput = screen.getByLabelText(/business logo url/i);
    fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });

    // Fill in signature URL
    const signatureInput = screen.getByLabelText(/digital signature url/i);
    fireEvent.change(signatureInput, { target: { value: 'https://example.com/signature.png' } });

    // Click save
    const saveButton = screen.getByRole('button', { name: /save branding assets/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        logo_url: 'https://example.com/logo.png',
        signature_url: 'https://example.com/signature.png',
      });
    });
  });

  it('should handle empty URL values', async () => {
    const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
    vi.doMock('../../hooks/useSimpleBranding', () => ({
      default: mockHook,
    }));

    const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
    
    render(<Component />, { wrapper: createWrapper() });

    // Click save without entering URLs
    const saveButton = screen.getByRole('button', { name: /save branding assets/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateBranding).toHaveBeenCalledWith({
        logo_url: undefined,
        signature_url: undefined,
      });
    });
  });

  it('should validate URL format correctly', async () => {
    const mockHook = vi.fn().mockReturnValue(defaultHookReturn);
    vi.doMock('../../hooks/useSimpleBranding', () => ({
      default: mockHook,
    }));

    const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
    
    render(<Component />, { wrapper: createWrapper() });

    // Enter invalid URL
    const logoInput = screen.getByLabelText(/business logo url/i);
    fireEvent.change(logoInput, { target: { value: 'invalid-url' } });

    // Check for error message
    await waitFor(() => {
      expect(screen.getByText(/please enter a valid url/i)).toBeInTheDocument();
    });

    // Save button should be disabled for invalid URLs
    const saveButton = screen.getByRole('button', { name: /save branding assets/i });
    expect(saveButton).toBeDisabled();
  });

  it('should show onboarding data in settings', async () => {
    mockGetBrandingWithFallback.mockReturnValue({
      logo_url: 'https://onboarding-logo.com/logo.png',
      signature_url: 'https://onboarding-signature.com/signature.png',
    });

    const mockHook = vi.fn().mockReturnValue({
      ...defaultHookReturn,
      branding: {
        id: '1',
        user_id: 'user1',
        logo_url: 'https://onboarding-logo.com/logo.png',
        signature_url: 'https://onboarding-signature.com/signature.png',
      },
    });
    vi.doMock('../../hooks/useSimpleBranding', () => ({
      default: mockHook,
    }));

    const { SimpleBrandingManager: Component } = await import('../SimpleBrandingManager');
    
    render(<Component />, { wrapper: createWrapper() });

    // Check if onboarding data is loaded
    await waitFor(() => {
      const logoInput = screen.getByDisplayValue('https://onboarding-logo.com/logo.png');
      const signatureInput = screen.getByDisplayValue('https://onboarding-signature.com/signature.png');
      
      expect(logoInput).toBeInTheDocument();
      expect(signatureInput).toBeInTheDocument();
    });
  });

  it('should handle database connection errors', async () => {
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

    // Component should still render even with errors
    expect(screen.getByText(/business branding/i)).toBeInTheDocument();
  });
});
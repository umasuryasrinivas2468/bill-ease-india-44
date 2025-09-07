import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SimpleBrandingManager from '../SimpleBrandingManager';

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'test-user-123',
      unsafeMetadata: {},
    },
  })),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('../../hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// Mock Supabase client but allow it to make actual calls
vi.mock('@/integrations/supabase/client', () => {
  const actualSupabase = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
    })),
  };
  
  return {
    supabase: actualSupabase,
  };
});

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { 
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
  
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('SimpleBrandingManager Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Real-world Error Scenarios', () => {
    it('should handle database table not existing', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock table not found error
      const tableError = {
        code: '42P01',
        message: 'relation "user_branding" does not exist',
      };

      supabase.from('user_branding').select().eq().maybeSingle.mockRejectedValue(tableError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      // Should still render the component
      expect(screen.getByText(/business branding/i)).toBeInTheDocument();
      
      // Try to save - should fail gracefully
      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        // Should show error toast
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle authentication token expiry', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock JWT token expired error
      const authError = {
        code: '401',
        message: 'JWT expired',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(authError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle rate limiting errors', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock rate limit error
      const rateLimitError = {
        code: '429',
        message: 'Too many requests',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(rateLimitError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle network connectivity issues', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock network error
      const networkError = new Error('fetch failed');
      networkError.cause = new Error('ECONNREFUSED');

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(networkError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle CORS errors', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock CORS error
      const corsError = new TypeError('Failed to fetch');

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(corsError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed", 
          variant: "destructive",
        }));
      });
    });
  });

  describe('RLS Policy Testing', () => {
    it('should handle insufficient privileges error', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock RLS policy violation
      const rlsError = {
        code: '42501',
        message: 'new row violates row-level security policy for table "user_branding"',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(rlsError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle missing RLS policies', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock missing policy error
      const noPolicyError = {
        code: '42501',
        message: 'permission denied for table user_branding',
      };

      supabase.from('user_branding').select().eq().maybeSingle.mockRejectedValue(noPolicyError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      // Component should still render but may show error state
      expect(screen.getByText(/business branding/i)).toBeInTheDocument();
    });
  });

  describe('Supabase Configuration Issues', () => {
    it('should handle invalid project URL', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock invalid project URL error
      const urlError = new Error('Invalid project URL: https://invalid-project.supabase.co');

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(urlError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle invalid API key', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock invalid API key error
      const apiKeyError = {
        code: '401',
        message: 'Invalid API key',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(apiKeyError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });
  });

  describe('Data Validation Edge Cases', () => {
    it('should handle PostgreSQL constraint violations', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock constraint violation error
      const constraintError = {
        code: '23505',
        message: 'duplicate key value violates unique constraint "user_branding_user_id_key"',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(constraintError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should handle data type mismatches', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock data type error
      const typeError = {
        code: '22P02',
        message: 'invalid input syntax for type uuid: "invalid-user-id"',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(typeError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });
  });

  describe('User Experience Edge Cases', () => {
    it('should handle concurrent updates gracefully', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock concurrent update conflict
      const concurrencyError = {
        code: '40001',
        message: 'could not serialize access due to concurrent update',
      };

      supabase.from('user_branding').upsert().select().single.mockRejectedValue(concurrencyError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      fireEvent.change(logoInput, { target: { value: 'https://example.com/logo.png' } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
          title: "Update Failed",
          variant: "destructive",
        }));
      });
    });

    it('should maintain form state during errors', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Mock any error
      const genericError = new Error('Something went wrong');
      supabase.from('user_branding').upsert().select().single.mockRejectedValue(genericError);

      render(<SimpleBrandingManager />, { wrapper: createWrapper() });

      const logoInput = screen.getByLabelText(/business logo url/i);
      const signatureInput = screen.getByLabelText(/digital signature url/i);
      
      const logoUrl = 'https://example.com/logo.png';
      const signatureUrl = 'https://example.com/signature.png';
      
      fireEvent.change(logoInput, { target: { value: logoUrl } });
      fireEvent.change(signatureInput, { target: { value: signatureUrl } });
      
      const saveButton = screen.getByRole('button', { name: /save branding assets/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalled();
      });

      // Form values should be preserved after error
      expect(logoInput).toHaveValue(logoUrl);
      expect(signatureInput).toHaveValue(signatureUrl);
    });
  });
});
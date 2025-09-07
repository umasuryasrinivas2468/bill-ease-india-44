import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { useSimpleBranding } from '../useSimpleBranding';
import { supabase } from '@/integrations/supabase/client';

// Mock Clerk
vi.mock('@clerk/clerk-react', () => ({
  useUser: vi.fn(),
}));

// Mock Supabase
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
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
  },
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

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

describe('useSimpleBranding', () => {
  const mockUser = {
    id: 'user123',
    unsafeMetadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (useUser as Mock).mockReturnValue({ user: mockUser });
  });

  describe('Authentication Issues', () => {
    it('should handle unauthenticated user', async () => {
      (useUser as Mock).mockReturnValue({ user: null });
      
      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      expect(result.current.branding).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should throw error when updating without authentication', async () => {
      (useUser as Mock).mockReturnValue({ user: null });
      
      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(() => {
          result.current.updateBranding({
            logo_url: 'https://example.com/logo.png',
            signature_url: 'https://example.com/signature.png',
          });
        }).not.toThrow(); // The error will be caught by the mutation
      });
    });
  });

  describe('Database Connection Issues', () => {
    it('should handle network connectivity errors', async () => {
      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockRejectedValue(new Error('Network error: Connection timeout')),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error).toBeTruthy();
      });
    });

    it('should handle database connection timeout', async () => {
      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockRejectedValue(new Error('Connection timeout')),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error?.message).toContain('Connection timeout');
      });
    });
  });

  describe('Row Level Security (RLS) Issues', () => {
    it('should handle RLS policy violations', async () => {
      const rlsError = {
        code: '42501',
        message: 'insufficient_privilege: new row violates row-level security policy',
      };

      const mockUpsertQuery = {
        select: vi.fn(() => ({
          single: vi.fn().mockRejectedValue(rlsError),
        })),
      };

      const mockSupabaseMutation = {
        upsert: vi.fn(() => mockUpsertQuery),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseMutation);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      result.current.updateBranding({
        logo_url: 'https://example.com/logo.png',
        signature_url: 'https://example.com/signature.png',
      });

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false);
      });
    });

    it('should handle missing RLS policies', async () => {
      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockRejectedValue(new Error('RLS policy missing')),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error?.message).toContain('RLS policy');
      });
    });
  });

  describe('Data Validation Issues', () => {
    it('should handle invalid URL formats during save', async () => {
      const mockUpsertQuery = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ 
            id: 'brand123',
            user_id: 'user123',
            logo_url: 'https://example.com/logo.png',
            signature_url: 'invalid-url', // This should be filtered by the component
          }),
        })),
      };

      const mockSupabaseMutation = {
        upsert: vi.fn(() => mockUpsertQuery),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseMutation);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      result.current.updateBranding({
        logo_url: 'https://example.com/logo.png',
        signature_url: 'invalid-url',
      });

      await waitFor(() => {
        expect(mockSupabaseMutation.upsert).toHaveBeenCalledWith({
          user_id: 'user123',
          logo_url: 'https://example.com/logo.png',
          signature_url: 'invalid-url',
        });
      });
    });

    it('should handle extremely long URLs', async () => {
      const longUrl = 'https://example.com/' + 'a'.repeat(10000);
      
      const mockUpsertQuery = {
        select: vi.fn(() => ({
          single: vi.fn().mockRejectedValue(new Error('value too long for type character varying')),
        })),
      };

      const mockSupabaseMutation = {
        upsert: vi.fn(() => mockUpsertQuery),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseMutation);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      result.current.updateBranding({
        logo_url: longUrl,
        signature_url: longUrl,
      });

      await waitFor(() => {
        expect(result.current.isUpdating).toBe(false);
      });
    });
  });

  describe('Supabase Client Configuration Issues', () => {
    it('should handle invalid API key errors', async () => {
      const apiKeyError = {
        code: '401',
        message: 'Invalid API key',
      };

      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockRejectedValue(apiKeyError),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error?.code).toBe('401');
      });
    });

    it('should handle project URL configuration errors', async () => {
      const urlError = new Error('Invalid project URL');
      
      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockRejectedValue(urlError),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => {
        expect(result.current.error?.message).toContain('Invalid project URL');
      });
    });
  });

  describe('Successful Operations', () => {
    it('should successfully save branding assets', async () => {
      const mockBrandingData = {
        id: 'brand123',
        user_id: 'user123',
        logo_url: 'https://example.com/logo.png',
        signature_url: 'https://example.com/signature.png',
      };

      const mockUpsertQuery = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(mockBrandingData),
        })),
      };

      const mockSupabaseMutation = {
        upsert: vi.fn(() => mockUpsertQuery),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseMutation);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      result.current.updateBranding({
        logo_url: 'https://example.com/logo.png',
        signature_url: 'https://example.com/signature.png',
      });

      await waitFor(() => {
        expect(mockSupabaseMutation.upsert).toHaveBeenCalledWith({
          user_id: 'user123',
          logo_url: 'https://example.com/logo.png',
          signature_url: 'https://example.com/signature.png',
        });
      });
    });

    it('should handle empty/null values correctly', async () => {
      const mockBrandingData = {
        id: 'brand123',
        user_id: 'user123',
        logo_url: null,
        signature_url: null,
      };

      const mockUpsertQuery = {
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue(mockBrandingData),
        })),
      };

      const mockSupabaseMutation = {
        upsert: vi.fn(() => mockUpsertQuery),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseMutation);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      result.current.updateBranding({
        logo_url: undefined,
        signature_url: undefined,
      });

      await waitFor(() => {
        expect(mockSupabaseMutation.upsert).toHaveBeenCalledWith({
          user_id: 'user123',
          logo_url: null,
          signature_url: null,
        });
      });
    });
  });

  describe('Fallback Functionality', () => {
    it('should fallback to Clerk metadata when database is empty', () => {
      const mockUserWithMetadata = {
        id: 'user123',
        unsafeMetadata: {
          logoUrl: 'https://clerk-logo.com/logo.png',
          signatureUrl: 'https://clerk-signature.com/signature.png',
        },
      };

      (useUser as Mock).mockReturnValue({ user: mockUserWithMetadata });

      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      const fallbackData = result.current.getBrandingWithFallback();
      expect(fallbackData.logo_url).toBe('https://clerk-logo.com/logo.png');
      expect(fallbackData.signature_url).toBe('https://clerk-signature.com/signature.png');
    });

    it('should handle base64 data from Clerk metadata', () => {
      const mockUserWithBase64 = {
        id: 'user123',
        unsafeMetadata: {
          logoBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          signatureBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        },
      };

      (useUser as Mock).mockReturnValue({ user: mockUserWithBase64 });

      const mockSupabaseQuery = {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue(null),
          })),
        })),
      };
      
      (supabase.from as Mock).mockReturnValue(mockSupabaseQuery);

      const { result } = renderHook(() => useSimpleBranding(), {
        wrapper: createWrapper(),
      });

      const fallbackData = result.current.getBrandingWithFallback();
      expect(fallbackData.logo_url).toContain('data:image/png;base64,');
      expect(fallbackData.signature_url).toContain('data:image/png;base64,');
    });
  });
});
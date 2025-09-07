import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/integrations/supabase/client';

// Mock Clerk for testing
vi.mock('@clerk/clerk-react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'test-user-123',
      unsafeMetadata: {},
    },
  })),
}));

describe('Branding Diagnostics - Identify Save Failure Issues', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Database Connection Diagnostics', () => {
    it('should test basic Supabase connection', async () => {
      try {
        // Test basic Supabase client initialization
        expect(supabase).toBeDefined();
        expect(supabase.from).toBeDefined();
        
        console.log('✅ Supabase client is properly initialized');
      } catch (error) {
        console.log('❌ Supabase client initialization failed:', error);
        throw error;
      }
    });

    it('should test table existence', async () => {
      try {
        // Try to query the user_branding table structure
        const { error } = await supabase
          .from('user_branding')
          .select('id')
          .limit(0);

        if (error) {
          console.log('❌ Table query failed:', error);
          
          // Check specific error types
          if (error.code === '42P01') {
            console.log('💡 Diagnosis: user_branding table does not exist');
            console.log('💡 Solution: Run the database migration file');
          } else if (error.code === '42501') {
            console.log('💡 Diagnosis: Permission denied - RLS policies not configured correctly');
            console.log('💡 Solution: Check RLS policies for user_branding table');
          } else {
            console.log('💡 Diagnosis: Unknown database error');
          }
          
          throw error;
        }
        
        console.log('✅ user_branding table exists and is accessible');
      } catch (error) {
        console.log('❌ Table existence check failed:', error);
        throw error;
      }
    });

    it('should test authentication with database', async () => {
      try {
        // Test if we can authenticate and check current user
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          console.log('❌ Authentication check failed:', error);
          
          if (error.message?.includes('JWT')) {
            console.log('💡 Diagnosis: JWT token issue');
            console.log('💡 Solution: User needs to re-authenticate');
          } else if (error.message?.includes('Invalid API key')) {
            console.log('💡 Diagnosis: Invalid Supabase API key');
            console.log('💡 Solution: Check SUPABASE_PUBLISHABLE_KEY in client.ts');
          }
          
          throw error;
        }
        
        if (!user) {
          console.log('⚠️ No authenticated user found');
          console.log('💡 Diagnosis: User not logged in to Supabase');
          console.log('💡 Solution: Implement proper Supabase authentication flow');
        } else {
          console.log('✅ User authenticated with Supabase:', user.id);
        }
      } catch (error) {
        console.log('❌ Authentication test failed:', error);
        throw error;
      }
    });
  });

  describe('RLS Policy Diagnostics', () => {
    it('should test RLS policies for SELECT', async () => {
      try {
        const testUserId = 'test-user-123';
        
        // Test SELECT policy
        const { data, error } = await supabase
          .from('user_branding')
          .select('*')
          .eq('user_id', testUserId)
          .maybeSingle();

        if (error) {
          console.log('❌ SELECT policy test failed:', error);
          
          if (error.code === '42501') {
            console.log('💡 Diagnosis: SELECT RLS policy is blocking the query');
            console.log('💡 Solution: Check "Users can view their own branding" policy');
            console.log('💡 Verify: auth.uid() = user_id condition is working');
          }
          
          throw error;
        }
        
        console.log('✅ SELECT RLS policy is working correctly');
        console.log('📊 Query result:', data);
      } catch (error) {
        console.log('❌ SELECT RLS policy test failed:', error);
        throw error;
      }
    });

    it('should test RLS policies for INSERT/UPSERT', async () => {
      try {
        const testUserId = 'test-user-123';
        const testData = {
          user_id: testUserId,
          logo_url: 'https://test.com/logo.png',
          signature_url: 'https://test.com/signature.png',
        };
        
        // Test UPSERT policy (covers both INSERT and UPDATE)
        const { data, error } = await supabase
          .from('user_branding')
          .upsert(testData)
          .select()
          .single();

        if (error) {
          console.log('❌ UPSERT policy test failed:', error);
          
          if (error.code === '42501') {
            console.log('💡 Diagnosis: INSERT/UPDATE RLS policy is blocking the operation');
            console.log('💡 Solution: Check INSERT and UPDATE policies for user_branding');
            console.log('💡 Verify: auth.uid() = user_id condition in WITH CHECK clause');
          } else if (error.code === '23505') {
            console.log('💡 Diagnosis: Unique constraint violation');
            console.log('💡 This might be expected if record already exists');
          } else if (error.code === '23503') {
            console.log('💡 Diagnosis: Foreign key constraint violation');
            console.log('💡 Solution: Ensure user_id exists in auth.users table');
          }
          
          throw error;
        }
        
        console.log('✅ UPSERT RLS policy is working correctly');
        console.log('📊 UPSERT result:', data);
      } catch (error) {
        console.log('❌ UPSERT RLS policy test failed:', error);
        throw error;
      }
    });
  });

  describe('Network and Configuration Diagnostics', () => {
    it('should test Supabase project URL', async () => {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // Check if the Supabase URL is properly configured
      const supabaseUrl = 'https://vhntnkvtzmerpdhousfr.supabase.co';
      
      try {
        // Test if we can reach the Supabase endpoint
        const response = await fetch(supabaseUrl + '/rest/v1/', {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZobnRua3Z0em1lcnBkaG91c2ZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgxMTEyMTEsImV4cCI6MjA2MzY4NzIxMX0.sQ5Xz5RrCrDJoJHpNC9RzqFNb05Qi4gsFL5PrntlV4k',
          },
        });
        
        if (!response.ok) {
          console.log('❌ Supabase endpoint not reachable:', response.status);
          
          if (response.status === 401) {
            console.log('💡 Diagnosis: API key authentication failed');
            console.log('💡 Solution: Verify SUPABASE_PUBLISHABLE_KEY is correct');
          } else if (response.status === 404) {
            console.log('💡 Diagnosis: Project URL is incorrect');
            console.log('💡 Solution: Verify SUPABASE_URL in client.ts');
          }
          
          throw new Error(`HTTP ${response.status}`);
        }
        
        console.log('✅ Supabase endpoint is reachable');
      } catch (error) {
        console.log('❌ Network connectivity test failed:', error);
        
        if (error.message?.includes('ECONNREFUSED')) {
          console.log('💡 Diagnosis: Network connection refused');
          console.log('💡 Solution: Check internet connectivity');
        } else if (error.message?.includes('CORS')) {
          console.log('💡 Diagnosis: CORS policy blocking request');
          console.log('💡 Solution: Check Supabase CORS settings');
        }
        
        throw error;
      }
    });

    it('should test API key validity', async () => {
      try {
        // Test API key by making a simple authenticated request
        const { error } = await supabase.from('user_branding').select('id').limit(1);
        
        if (error) {
          console.log('❌ API key test failed:', error);
          
          if (error.message?.includes('Invalid API key') || error.message?.includes('JWT')) {
            console.log('💡 Diagnosis: Invalid or expired API key');
            console.log('💡 Solution: Update SUPABASE_PUBLISHABLE_KEY in client.ts');
          }
          
          throw error;
        }
        
        console.log('✅ API key is valid');
      } catch (error) {
        console.log('❌ API key validation failed:', error);
        throw error;
      }
    });
  });

  describe('Clerk Integration Diagnostics', () => {
    it('should test Clerk user integration', async () => {
      const { useUser } = await import('@clerk/clerk-react');
      const mockUser = {
        id: 'clerk-user-123',
        unsafeMetadata: {
          logoUrl: 'https://clerk-logo.com/logo.png',
        },
      };
      
      try {
        // Check if Clerk user exists
        expect(mockUser).toBeDefined();
        expect(mockUser.id).toBeDefined();
        
        console.log('✅ Clerk user is available:', mockUser.id);
        
        // Test if user ID format is compatible with UUID
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mockUser.id)) {
          console.log('⚠️ Clerk user ID is not in UUID format');
          console.log('💡 Diagnosis: user_id column expects UUID format');
          console.log('💡 Solution: Convert Clerk user ID to UUID or change column type');
        }
        
      } catch (error) {
        console.log('❌ Clerk user integration test failed:', error);
        throw error;
      }
    });
  });

  describe('Common Error Pattern Diagnostics', () => {
    it('should identify common save failure patterns', async () => {
      const commonErrors = [
        {
          pattern: /relation.*does not exist/,
          diagnosis: 'Table does not exist',
          solution: 'Run database migrations',
        },
        {
          pattern: /row-level security policy/,
          diagnosis: 'RLS policy violation',
          solution: 'Check RLS policies and user authentication',
        },
        {
          pattern: /JWT.*expired/,
          diagnosis: 'Authentication token expired',
          solution: 'Re-authenticate user',
        },
        {
          pattern: /Invalid API key/,
          diagnosis: 'Supabase API key is invalid',
          solution: 'Update API key in configuration',
        },
        {
          pattern: /ECONNREFUSED/,
          diagnosis: 'Network connectivity issue',
          solution: 'Check internet connection and Supabase status',
        },
        {
          pattern: /CORS/,
          diagnosis: 'Cross-origin request blocked',
          solution: 'Check Supabase CORS configuration',
        },
        {
          pattern: /duplicate key.*unique constraint/,
          diagnosis: 'Attempting to insert duplicate record',
          solution: 'Use UPSERT instead of INSERT',
        },
        {
          pattern: /permission denied/,
          diagnosis: 'Database permission issue',
          solution: 'Check user permissions and RLS policies',
        },
      ];
      
      console.log('📋 Common Branding Save Error Patterns:');
      commonErrors.forEach((error, index) => {
        console.log(`${index + 1}. Pattern: ${error.pattern}`);
        console.log(`   Diagnosis: ${error.diagnosis}`);
        console.log(`   Solution: ${error.solution}`);
        console.log('');
      });
      
      console.log('💡 To debug your specific error:');
      console.log('1. Check the browser developer console for detailed error messages');
      console.log('2. Look at the Network tab to see the failed request');
      console.log('3. Check the Supabase dashboard for any issues');
      console.log('4. Verify user authentication status');
      
      expect(commonErrors.length).toBeGreaterThan(0);
    });
  });
});
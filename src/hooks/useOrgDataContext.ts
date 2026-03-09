/**
 * Hook to get the current organization context for data queries.
 * Provides the org_id to pass when inserting/querying data,
 * enabling org-scoped data sharing among team members.
 */

import { useMemo } from 'react';
import { useClerkOrganization } from '@/hooks/useClerkOrganization';
import { useAuth } from '@/components/ClerkAuthProvider';

export interface OrgDataContext {
  /** The current org UUID from Supabase organizations table (not Clerk org ID) */
  orgId: string | null;
  /** The current user's Clerk ID */
  userId: string | null;
  /** Whether the context is ready */
  isReady: boolean;
  /** Helper to add org_id to insert data */
  withOrgId: <T extends Record<string, any>>(data: T) => T & { org_id: string | null };
}

/**
 * Returns the current organization data context.
 * Use this when inserting or querying org-scoped data.
 * 
 * @example
 * const { orgId, withOrgId } = useOrgDataContext();
 * // When inserting:
 * supabase.from('invoices').insert(withOrgId({ ...invoiceData }));
 * // When querying org data:
 * supabase.from('invoices').select('*').eq('org_id', orgId);
 */
export function useOrgDataContext(): OrgDataContext {
  const { user } = useAuth();
  const { orgId: clerkOrgId, isLoading } = useClerkOrganization();

  // The Clerk org ID may differ from Supabase org ID.
  // For now, we store the Clerk org ID in sessionStorage and use it.
  // In production, you'd map Clerk org -> Supabase org via a lookup.
  const orgId = useMemo(() => {
    // Check if we have a mapped Supabase org ID in session
    const mappedOrgId = sessionStorage.getItem('supabase-org-id');
    if (mappedOrgId) return mappedOrgId;
    return null;
  }, [clerkOrgId]);

  const withOrgId = <T extends Record<string, any>>(data: T): T & { org_id: string | null } => {
    return { ...data, org_id: orgId };
  };

  return {
    orgId,
    userId: user?.id || null,
    isReady: !isLoading && !!user,
    withOrgId,
  };
}

export default useOrgDataContext;

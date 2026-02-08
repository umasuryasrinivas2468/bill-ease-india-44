/**
 * Clerk Organization Context Hook
 * Manages single active organization context using Clerk organizations
 * Supports multi-org users with enforced single session context
 */

import { useOrganization, useAuth } from '@clerk/clerk-react';
import { useEffect, useState } from 'react';

export interface Branch {
  id: string;
  name: string;
  code: string;
}

export interface ClerkOrgContext {
  organization: any | null;
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  userRole: string | null;
  branches: Branch[];
  activeBranch: Branch | null;
  isLoading: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isAccountant: boolean;
  error: string | null;
  switchBranch: (branchId: string) => void;
}

export function useClerkOrganization(): ClerkOrgContext {
  const { organization, isLoaded } = useOrganization();
  const { sessionId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract branches from org metadata
  useEffect(() => {
    if (!organization) {
      setBranches([]);
      setActiveBranch(null);
      return;
    }

    try {
      // Branches stored in organization metadata: { branches: [...] }
      const orgMetadata = organization.privateMetadata || {};
      const branchesData = (orgMetadata.branches as Branch[]) || [];
      
      setBranches(branchesData);

      // Set active branch from session storage for this org
      const sessionKey = `active-branch-${organization.id}`;
      const savedBranchId = sessionStorage.getItem(sessionKey);
      
      if (savedBranchId && branchesData.some(b => b.id === savedBranchId)) {
        setActiveBranch(branchesData.find(b => b.id === savedBranchId) || branchesData[0]);
      } else {
        // Default to first branch
        setActiveBranch(branchesData[0] || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load branches');
    }
  }, [organization]);

  const switchBranch = (branchId: string) => {
    const branch = branches.find(b => b.id === branchId);
    if (branch && organization) {
      setActiveBranch(branch);
      sessionStorage.setItem(`active-branch-${organization.id}`, branchId);
    }
  };

  // Get user's role in current organization
  const userRole = organization?.members
    ?.find(m => m.userId === organization.verifySession?.userId)
    ?.role || null;

  return {
    organization,
    orgId: organization?.id || null,
    orgName: organization?.name || null,
    orgSlug: organization?.slug || null,
    userRole,
    branches,
    activeBranch,
    isLoading: !isLoaded,
    isAdmin: userRole === 'admin' || userRole === 'org:admin',
    isManager: ['admin', 'org:admin', 'org:member'].includes(userRole || ''),
    isAccountant: userRole !== null,
    error,
    switchBranch,
  };
}

export default useClerkOrganization;

/**
 * Clerk Organization Context Hook
 * Manages single active organization context using Clerk organizations
 * Supports multi-org users with enforced single session context
 */

import { useOrganization, useOrganizationList, useAuth } from '@clerk/clerk-react';
import { useEffect, useState, useCallback } from 'react';

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
  switchOrganization: (orgId: string) => Promise<void>;
  organizations: any[];
}

export function useClerkOrganization(): ClerkOrgContext {
  const { organization, isLoaded, membership } = useOrganization();
  const { userMemberships, setActive, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: { infinite: true }
  });
  const { userId } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Extract branches from org public metadata (privateMetadata is not accessible client-side)
  useEffect(() => {
    if (!organization) {
      setBranches([]);
      setActiveBranch(null);
      return;
    }

    try {
      // Branches stored in organization publicMetadata: { branches: [...] }
      const orgMetadata = organization.publicMetadata || {};
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

  const switchOrganization = useCallback(async (orgId: string) => {
    if (setActive) {
      try {
        await setActive({ organization: orgId });
        // Reload to refresh all data for new org context
        window.location.reload();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to switch organization');
      }
    }
  }, [setActive]);

  // Get user's role in current organization from membership
  const userRole = membership?.role || null;

  // Map user memberships to organization list
  const organizations = userMemberships?.data?.map(item => ({
    id: item.organization.id,
    name: item.organization.name,
    slug: item.organization.slug,
    imageUrl: item.organization.imageUrl,
    role: item.role,
  })) || [];

  return {
    organization,
    orgId: organization?.id || null,
    orgName: organization?.name || null,
    orgSlug: organization?.slug || null,
    userRole,
    branches,
    activeBranch,
    isLoading: !isLoaded || !listLoaded,
    isAdmin: userRole === 'org:admin',
    isManager: ['org:admin', 'org:member'].includes(userRole || ''),
    isAccountant: userRole !== null,
    error,
    switchBranch,
    switchOrganization,
    organizations,
  };
}

export default useClerkOrganization;

/**
 * Organization Provider Component
 * Provides organization context to the entire application
 * Wraps children with Clerk organization context
 */

import React, { createContext, useContext, ReactNode, useCallback } from 'react';
import { useOrganization, useOrganizationList } from '@clerk/clerk-react';

interface OrganizationContextType {
  organization: any | null;
  isLoaded: boolean;
  membership: any | null;
  organizations: any[];
  switchOrganization: (orgId: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function useOrganizationContext() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganizationContext must be used within OrganizationProvider');
  }
  return context;
}

interface OrganizationProviderProps {
  children: ReactNode;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const { organization, isLoaded, membership } = useOrganization();
  const { userMemberships, setActive, isLoaded: listLoaded } = useOrganizationList({
    userMemberships: { infinite: true }
  });

  const switchOrganization = useCallback(async (orgId: string) => {
    if (setActive) {
      await setActive({ organization: orgId });
      window.location.reload();
    }
  }, [setActive]);

  // Map user memberships to organization list
  const organizations = userMemberships?.data?.map(item => ({
    id: item.organization.id,
    name: item.organization.name,
    slug: item.organization.slug,
    imageUrl: item.organization.imageUrl,
    role: item.role,
  })) || [];

  const value: OrganizationContextType = {
    organization,
    isLoaded: isLoaded && listLoaded,
    membership,
    organizations,
    switchOrganization,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};

export default OrganizationProvider;

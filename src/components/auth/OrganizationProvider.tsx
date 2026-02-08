import React from 'react';
import { useOrganizationState, Organization, OrganizationContext } from '@/hooks/useOrganization';

interface OrganizationProviderProps {
  children: React.ReactNode;
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ children }) => {
  const organizationState = useOrganizationState();

  return (
    <OrganizationContext.Provider value={organizationState}>
      {children}
    </OrganizationContext.Provider>
  );
};

export default OrganizationProvider;

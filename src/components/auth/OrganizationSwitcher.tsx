/**
 * Organization Switcher Component
 * Allows users to switch between organizations they belong to
 * Uses Clerk's organization system
 */

import React from 'react';
import { OrganizationSwitcher as ClerkOrgSwitcher } from '@clerk/clerk-react';

interface OrganizationSwitcherProps {
  className?: string;
  hidePersonal?: boolean;
  afterSelectOrganizationUrl?: string;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  className,
  hidePersonal = true,
  afterSelectOrganizationUrl = '/dashboard',
}) => {
  return (
    <div className={className}>
      <ClerkOrgSwitcher
        hidePersonal={hidePersonal}
        afterSelectOrganizationUrl={afterSelectOrganizationUrl}
        appearance={{
          elements: {
            rootBox: 'w-full',
            organizationSwitcherTrigger: 'w-full justify-start px-2 py-1.5 rounded-md hover:bg-accent',
            organizationPreview: 'gap-2',
            organizationSwitcherTriggerIcon: 'hidden',
          },
        }}
      />
    </div>
  );
};

export default OrganizationSwitcher;

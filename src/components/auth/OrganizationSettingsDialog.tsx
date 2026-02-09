/**
 * Organization Settings Dialog
 * Wrapper around Clerk's OrganizationProfile component
 */

import React from 'react';
import { OrganizationProfile } from '@clerk/clerk-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

interface OrganizationSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export const OrganizationSettingsDialog: React.FC<OrganizationSettingsDialogProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <OrganizationProfile
          appearance={{
            elements: {
              rootBox: 'w-full',
              card: 'shadow-none',
              navbar: 'hidden',
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
};

export default OrganizationSettingsDialog;

/**
 * Create Organization Dialog
 * Wrapper around Clerk's CreateOrganization component
 */

import React from 'react';
import { CreateOrganization } from '@clerk/clerk-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CreateOrganizationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  afterCreateOrganizationUrl?: string;
}

export const CreateOrganizationDialog: React.FC<CreateOrganizationDialogProps> = ({
  isOpen,
  onClose,
  afterCreateOrganizationUrl = '/dashboard',
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <CreateOrganization
            afterCreateOrganizationUrl={afterCreateOrganizationUrl}
            appearance={{
              elements: {
                rootBox: 'w-full',
                card: 'shadow-none p-0',
                headerTitle: 'hidden',
                headerSubtitle: 'hidden',
              },
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreateOrganizationDialog;

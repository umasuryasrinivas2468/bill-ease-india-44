import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AlertTriangle, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BankingUnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BankingUnavailableModal: React.FC<BankingUnavailableModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-orange-100 rounded-full">
              <Banknote className="h-6 w-6 text-orange-600" />
            </div>
            <DialogTitle className="text-xl">Banking Services</DialogTitle>
          </div>
          <DialogDescription className="space-y-3">
            <div className="flex items-start gap-3 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-orange-800 mb-1">
                  Banking is currently unavailable in your country
                </p>
                <p className="text-sm text-orange-700">
                  We're working to expand our banking services to more regions. 
                  Please check back later for updates.
                </p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              In the meantime, you can continue using our other features like invoicing, 
              reporting, and client management.
            </p>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end mt-6">
          <Button onClick={onClose} variant="default">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Settings, AlertTriangle } from 'lucide-react';

interface SettingsPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToSettings: () => void;
  missingFields: string[];
}

const SettingsPromptDialog: React.FC<SettingsPromptDialogProps> = ({
  open,
  onOpenChange,
  onGoToSettings,
  missingFields,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Complete Your Profile
          </DialogTitle>
          <DialogDescription>
            Please complete your business profile before creating invoices. 
            This information is required for professional invoices.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <div className="space-y-3">
            <p className="text-sm font-medium text-gray-700">Missing information:</p>
            <ul className="space-y-2">
              {missingFields.map((field, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                  <div className="w-2 h-2 bg-red-400 rounded-full flex-shrink-0" />
                  {field}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onGoToSettings} className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Go to Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsPromptDialog;
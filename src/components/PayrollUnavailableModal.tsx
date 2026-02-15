import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserCheck, AlertCircle, ExternalLink } from 'lucide-react';

interface PayrollUnavailableModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PayrollUnavailableModal: React.FC<PayrollUnavailableModalProps> = ({
  isOpen,
  onClose,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-primary" />
            Payroll Management
          </DialogTitle>
          <DialogDescription>
            Manage employee payroll and salary processing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert className="border-orange-200 bg-orange-50">
            <AlertCircle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div className="space-y-2">
                <p className="font-medium">
                  Payroll is currently unavailable in your country
                </p>
                <p className="text-sm">
                  We're working to bring payroll management to your region. 
                  This feature will be available soon with support for local 
                  tax regulations and compliance requirements.
                </p>
              </div>
            </AlertDescription>
          </Alert>

          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-2">
              What Payroll Management Will Include:
            </h3>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>• Employee salary processing</li>
              <li>• Tax deductions and calculations</li>
              <li>• EPF and ESI compliance</li>
              <li>• Payslip generation</li>
              <li>• Attendance integration</li>
              <li>• Leave management</li>
              <li>• Statutory reports</li>
            </ul>
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={() => window.open('https://www.aczen.in/contact', '_blank')}
              variant="outline"
              className="w-full"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Get Notified When Available
            </Button>
            <Button onClick={onClose} className="w-full">
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
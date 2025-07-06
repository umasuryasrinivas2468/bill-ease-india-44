
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BankDetails } from '@/hooks/useOnboardingState';
import { validateAccountNumber, validateIFSCCode } from '@/utils/onboardingValidation';

interface BankingDetailsStepProps {
  bankDetails: BankDetails;
  setBankDetails: (details: BankDetails) => void;
  onNext: () => void;
}

export const BankingDetailsStep: React.FC<BankingDetailsStepProps> = ({
  bankDetails,
  setBankDetails,
  onNext,
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!bankDetails.accountNumber || !bankDetails.ifscCode || !bankDetails.bankName || !bankDetails.accountHolderName) {
      return;
    }

    if (!validateAccountNumber(bankDetails.accountNumber)) {
      return;
    }

    if (!validateIFSCCode(bankDetails.ifscCode)) {
      return;
    }

    onNext();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banking Details</CardTitle>
        <CardDescription>Add your bank account information for payments</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="accountHolderName">Account Holder Name *</Label>
            <Input
              id="accountHolderName"
              value={bankDetails.accountHolderName}
              onChange={(e) => setBankDetails({ ...bankDetails, accountHolderName: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="accountNumber">Account Number *</Label>
              <Input
                id="accountNumber"
                value={bankDetails.accountNumber}
                onChange={(e) => setBankDetails({ ...bankDetails, accountNumber: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="ifscCode">IFSC Code *</Label>
              <Input
                id="ifscCode"
                value={bankDetails.ifscCode}
                onChange={(e) => setBankDetails({ ...bankDetails, ifscCode: e.target.value.toUpperCase() })}
                placeholder="ABCD0123456"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="bankName">Bank Name *</Label>
              <Input
                id="bankName"
                value={bankDetails.bankName}
                onChange={(e) => setBankDetails({ ...bankDetails, bankName: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="branchName">Branch Name</Label>
              <Input
                id="branchName"
                value={bankDetails.branchName}
                onChange={(e) => setBankDetails({ ...bankDetails, branchName: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" className="w-full">
            Continue to Branding
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

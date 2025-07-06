
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateAccountNumber, validateIFSCCode } from '@/utils/onboardingValidation';
import { BankDetails } from '@/hooks/useOnboardingState';

interface BankingDetailsStepProps {
  bankDetails: BankDetails;
  setBankDetails: (details: BankDetails) => void;
  onNext: () => void;
  toast: any;
}

export const BankingDetailsStep: React.FC<BankingDetailsStepProps> = ({
  bankDetails,
  setBankDetails,
  onNext,
  toast,
}) => {
  const handleSubmit = () => {
    if (!bankDetails.accountNumber || !bankDetails.ifscCode || !bankDetails.bankName || 
        !bankDetails.branchName || !bankDetails.accountHolderName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required banking fields.",
        variant: "destructive",
      });
      return;
    }

    if (!validateAccountNumber(bankDetails.accountNumber)) {
      toast({
        title: "Invalid Account Number",
        description: "Account number must be 9-18 digits long.",
        variant: "destructive",
      });
      return;
    }

    if (!validateIFSCCode(bankDetails.ifscCode)) {
      toast({
        title: "Invalid IFSC Code",
        description: "IFSC code format is invalid. Example: SBIN0001234",
        variant: "destructive",
      });
      return;
    }

    onNext();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Banking Details</CardTitle>
        <CardDescription>Add your bank account for payment information (All fields are mandatory)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="accountNumber">Account Number *</Label>
            <Input
              id="accountNumber"
              value={bankDetails.accountNumber}
              onChange={(e) => setBankDetails({...bankDetails, accountNumber: e.target.value})}
              placeholder="1234567890123456"
              maxLength={18}
              pattern="\d*"
              title="Please enter a valid account number (9-18 digits)"
              required
            />
            {bankDetails.accountNumber && !validateAccountNumber(bankDetails.accountNumber) && (
              <p className="text-sm text-red-500">Account number must be 9-18 digits long</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ifscCode">IFSC Code *</Label>
            <Input
              id="ifscCode"
              value={bankDetails.ifscCode}
              onChange={(e) => setBankDetails({...bankDetails, ifscCode: e.target.value.toUpperCase()})}
              placeholder="SBIN0001234"
              maxLength={11}
              style={{ textTransform: 'uppercase' }}
              required
            />
            {bankDetails.ifscCode && !validateIFSCCode(bankDetails.ifscCode) && (
              <p className="text-sm text-red-500">Invalid IFSC format. Example: SBIN0001234</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bankName">Bank Name *</Label>
            <Input
              id="bankName"
              value={bankDetails.bankName}
              onChange={(e) => setBankDetails({...bankDetails, bankName: e.target.value})}
              placeholder="State Bank of India"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="branchName">Branch Name *</Label>
            <Input
              id="branchName"
              value={bankDetails.branchName}
              onChange={(e) => setBankDetails({...bankDetails, branchName: e.target.value})}
              placeholder="Mumbai Main Branch"
              required
            />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label htmlFor="accountHolderName">Account Holder Name *</Label>
            <Input
              id="accountHolderName"
              value={bankDetails.accountHolderName}
              onChange={(e) => setBankDetails({...bankDetails, accountHolderName: e.target.value})}
              placeholder="As per bank records"
              required
            />
          </div>
        </div>
        
        <Button onClick={handleSubmit} className="w-full">
          Continue to Branding
        </Button>
      </CardContent>
    </Card>
  );
};

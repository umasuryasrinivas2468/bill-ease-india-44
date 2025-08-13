
import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BankDetails } from '@/hooks/useOnboardingData';
import { validateAccountNumber, validateIFSCCode } from '@/utils/onboardingValidation';
import { useToast } from '@/hooks/use-toast';

interface BankingDetailsStepProps {
  bankDetails: BankDetails;
  setBankDetails: (details: BankDetails) => void;
  onNext: () => Promise<void>;
  isLoading?: boolean;
}

export const BankingDetailsStep: React.FC<BankingDetailsStepProps> = ({
  bankDetails,
  setBankDetails,
  onNext,
  isLoading = false,
}) => {
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!bankDetails.accountHolderName?.trim()) {
      toast({
        title: "Validation Error",
        description: "Account holder name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!bankDetails.accountNumber?.trim()) {
      toast({
        title: "Validation Error",
        description: "Account number is required.",
        variant: "destructive",
      });
      return;
    }

    if (!validateAccountNumber(bankDetails.accountNumber)) {
      toast({
        title: "Validation Error",
        description: "Account number should be 9-18 digits.",
        variant: "destructive",
      });
      return;
    }

    if (!bankDetails.ifscCode?.trim()) {
      toast({
        title: "Validation Error",
        description: "IFSC code is required.",
        variant: "destructive",
      });
      return;
    }

    if (!validateIFSCCode(bankDetails.ifscCode)) {
      toast({
        title: "Validation Error",
        description: "Invalid IFSC code format.",
        variant: "destructive",
      });
      return;
    }

    if (!bankDetails.bankName?.trim()) {
      toast({
        title: "Validation Error",
        description: "Bank name is required.",
        variant: "destructive",
      });
      return;
    }

    await onNext();
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

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              "Continue to Branding"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

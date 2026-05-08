import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import KYCVerification from '@/components/KYCVerification';
import { useKycStatus } from '@/hooks/useKycStatus';

interface KYCStepProps {
  onNext: () => void;
}

export const KYCStep: React.FC<KYCStepProps> = ({ onNext }) => {
  const { isVerified } = useKycStatus();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-violet-600" />
          Identity Verification
        </CardTitle>
        <CardDescription>
          Verify your identity via DigiLocker (MeriPehchaan, Govt. of India). This is required to
          link a payment gateway and create invoices that move money.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <KYCVerification />
        <div className="flex justify-end">
          <Button onClick={onNext} disabled={!isVerified} className="gap-2">
            Continue to Banking
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {!isVerified && (
          <p className="text-xs text-muted-foreground text-right">
            Complete KYC above to continue.
          </p>
        )}
      </CardContent>
    </Card>
  );
};

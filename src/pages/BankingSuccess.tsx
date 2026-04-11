import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const BankingSuccess = () => {
  const [searchParams] = useSearchParams();
  const status = searchParams.get('status') || 'success';
  const reference = searchParams.get('reference') || searchParams.get('ref') || searchParams.get('requestId');

  return (
    <div className="p-4 md:p-6">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <div className="mb-3 flex items-center gap-3 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
            <CardTitle>Banking Connection Status</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The banking flow returned to Bill Ease.
          </p>
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <p><strong>Status:</strong> {status}</p>
            {reference && <p><strong>Reference:</strong> {reference}</p>}
          </div>
          <div className="flex gap-2">
            <Button asChild>
              <Link to="/dashboard">Go to Dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/banking">Open Banking Again</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BankingSuccess;

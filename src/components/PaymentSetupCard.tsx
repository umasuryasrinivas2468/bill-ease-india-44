import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUser } from '@clerk/clerk-react';
import {
  usePaymentSettings,
  useActivateRazorpayAccount,
  useRefreshRazorpayStatus,
} from '@/hooks/usePaymentSettings';
import { useToast } from '@/hooks/use-toast';
import {
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
  Loader2,
  Banknote,
  Shield,
} from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  not_created: {
    label: 'Not Set Up',
    color: 'bg-gray-100 text-gray-700',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  created: {
    label: 'Under Review',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Clock className="h-4 w-4" />,
  },
  needs_clarification: {
    label: 'Needs Clarification',
    color: 'bg-orange-100 text-orange-800',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  under_review: {
    label: 'Under Review',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Clock className="h-4 w-4" />,
  },
  activated: {
    label: 'Activated',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 className="h-4 w-4" />,
  },
  suspended: {
    label: 'Suspended',
    color: 'bg-red-100 text-red-800',
    icon: <AlertCircle className="h-4 w-4" />,
  },
};

const PaymentSetupCard: React.FC = () => {
  const { user } = useUser();
  const { data: settings, isLoading } = usePaymentSettings();
  const activate = useActivateRazorpayAccount();
  const refreshStatus = useRefreshRazorpayStatus();
  const { toast } = useToast();

  const metadata = user?.unsafeMetadata as any;
  const hasBusiness = !!metadata?.businessInfo?.businessName;
  const hasBank = !!metadata?.bankDetails?.accountNumber;

  const status = settings?.razorpay_account_status || 'not_created';
  const cfg = statusConfig[status] || statusConfig.not_created;

  const handleActivate = async () => {
    try {
      const result = await activate.mutateAsync();
      toast({
        title: 'Razorpay Account Created!',
        description:
          result.status === 'activated'
            ? 'Your account is active. Payments will route directly to your bank.'
            : 'Your account is under review by Razorpay. This usually takes 1-2 business days.',
      });
    } catch (err: any) {
      toast({
        title: 'Activation Failed',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  const handleRefresh = async () => {
    try {
      const result = await refreshStatus.mutateAsync();
      toast({
        title: 'Status Updated',
        description: `Account status: ${statusConfig[result.status]?.label || result.status}`,
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'destructive',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Online Payment Collection
          </CardTitle>
          <CardDescription>
            Receive payments directly to your bank account via Razorpay Route.
            When your clients pay an invoice, money goes straight to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current status */}
          <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${cfg.color}`}>{cfg.icon}</div>
              <div>
                <p className="font-medium text-sm">Payment Account Status</p>
                <Badge variant="outline" className={cfg.color}>
                  {cfg.label}
                </Badge>
              </div>
            </div>
            {settings?.razorpay_account_id && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshStatus.isPending}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-1 ${refreshStatus.isPending ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            )}
          </div>

          {/* Account ID if exists */}
          {settings?.razorpay_account_id && (
            <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Account ID</span>
                <span className="font-mono text-xs">{settings.razorpay_account_id}</span>
              </div>
            </div>
          )}

          {/* Not set up — show activate flow */}
          {status === 'not_created' && (
            <div className="space-y-4">
              {/* Prerequisite check */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  {hasBusiness ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>Business Information {hasBusiness ? 'saved' : '— fill in the Business tab first'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {hasBank ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500" />
                  )}
                  <span>Bank Details {hasBank ? 'saved' : '— fill in the Banking tab first'}</span>
                </div>
              </div>

              <Button
                onClick={handleActivate}
                disabled={!hasBusiness || !hasBank || activate.isPending}
                className="w-full sm:w-auto gap-2"
                variant="orange"
              >
                {activate.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Activate Online Payments
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Under review */}
          {(status === 'created' || status === 'under_review') && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-yellow-800">Account Under Review</p>
              <p className="text-yellow-700">
                Razorpay is reviewing your account. This usually takes 1-2 business days.
                Once activated, all invoice payments will route directly to your bank account.
              </p>
              <p className="text-yellow-600 text-xs">
                Click "Refresh" above to check the latest status.
              </p>
            </div>
          )}

          {/* Needs clarification */}
          {status === 'needs_clarification' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-orange-800">Action Required</p>
              <p className="text-orange-700">
                Razorpay needs additional information. Please check your Razorpay dashboard
                or email for details, then click "Refresh" to update the status.
              </p>
            </div>
          )}

          {/* Activated */}
          {status === 'activated' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Payments Active
              </p>
              <p className="text-green-700">
                Your account is fully activated. When clients pay your invoices via the
                "Pay Now" link, money goes directly to your bank account.
              </p>
            </div>
          )}

          {/* Suspended */}
          {status === 'suspended' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-red-800">Account Suspended</p>
              <p className="text-red-700">
                Your Razorpay account has been suspended. Please contact Razorpay support
                for resolution.
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
            <Shield className="h-3.5 w-3.5" />
            Powered by Razorpay Route — your data is encrypted and secure.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSetupCard;

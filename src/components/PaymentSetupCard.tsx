import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePaymentSettings,
  useStartRazorpayOnboarding,
} from '@/hooks/usePaymentSettings';
import { useToast } from '@/hooks/use-toast';
import {
  Zap,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Banknote,
  Shield,
  ExternalLink,
} from 'lucide-react';

const statusConfig: Record<
  string,
  { label: string; color: string; icon: React.ReactNode }
> = {
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
  const { data: settings, isLoading } = usePaymentSettings();
  const startOnboarding = useStartRazorpayOnboarding();
  const { toast } = useToast();

  const status = settings?.razorpay_account_status || 'not_created';
  const cfg = statusConfig[status] || statusConfig.not_created;
  const isLinked = !!settings?.razorpay_access_token;

  const handleActivate = async () => {
    try {
      const { authorize_url } = await startOnboarding.mutateAsync();
      // Hand off to Razorpay's hosted onboarding form
      window.location.href = authorize_url;
    } catch (err: any) {
      toast({
        title: 'Activation Failed',
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Online Payment Collection
          </CardTitle>
          <CardDescription>
            Accept card, UPI, and netbanking payments on your invoices. Money
            settles directly into your bank account via Razorpay.
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
          </div>

          {/* Account ID if linked */}
          {settings?.razorpay_account_id && (
            <div className="text-sm bg-gray-50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Account ID</span>
                <span className="font-mono text-xs">
                  {settings.razorpay_account_id}
                </span>
              </div>
            </div>
          )}

          {/* Not yet linked — show activate flow */}
          {!isLinked && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-blue-900">What happens next</p>
                <ol className="text-blue-800 space-y-1 list-decimal pl-4 text-xs">
                  <li>Click "Activate Online Payments" below.</li>
                  <li>You'll be redirected to Razorpay's secure onboarding page.</li>
                  <li>Enter your business info, bank details, and upload KYC documents.</li>
                  <li>You'll come back here automatically once done.</li>
                </ol>
              </div>

              <Button
                onClick={handleActivate}
                disabled={startOnboarding.isPending}
                className="w-full sm:w-auto gap-2"
                variant="orange"
              >
                {startOnboarding.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Activate Online Payments
                    <ExternalLink className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Under review */}
          {isLinked &&
            (status === 'created' || status === 'under_review') && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-yellow-800">Account Under Review</p>
                <p className="text-yellow-700">
                  Razorpay is reviewing your account. This usually takes 1–2
                  business days. Once activated, your invoice payments will
                  route directly to your bank account.
                </p>
              </div>
            )}

          {/* Needs clarification */}
          {isLinked && status === 'needs_clarification' && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-orange-800">Action Required</p>
              <p className="text-orange-700">
                Razorpay needs additional information. Please check your
                Razorpay dashboard or email for details.
              </p>
            </div>
          )}

          {/* Activated */}
          {isLinked && status === 'activated' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-green-800 flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4" />
                Payments Active
              </p>
              <p className="text-green-700">
                Your account is fully activated. When clients pay your invoices
                via the "Pay Now" link, money goes directly to your bank
                account.
              </p>
            </div>
          )}

          {/* Suspended */}
          {isLinked && status === 'suspended' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm space-y-2">
              <p className="font-medium text-red-800">Account Suspended</p>
              <p className="text-red-700">
                Your Razorpay account has been suspended. Please contact
                Razorpay support for resolution.
              </p>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-2">
            <Shield className="h-3.5 w-3.5" />
            Onboarding powered by Razorpay Tech Partners — your KYC data is
            collected and encrypted by Razorpay, never stored on Aczen.
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentSetupCard;

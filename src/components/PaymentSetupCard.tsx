import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePaymentSettings,
  useStartRazorpayOnboarding,
  useDisconnectRazorpay,
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
  Unlink,
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
  const disconnect = useDisconnectRazorpay();
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

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        'Disconnect Razorpay? Your existing invoices will keep working but new payment links will fail until you reconnect. You can reconnect any time.',
      )
    ) {
      return;
    }
    try {
      await disconnect.mutateAsync();
      toast({
        title: 'Razorpay disconnected',
        description: 'Click "Activate Online Payments" to reconnect.',
      });
    } catch (err: any) {
      toast({
        title: 'Disconnect failed',
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
      <Card className="overflow-hidden">
        {/* Branded gradient banner with logo */}
        <div
          className="relative px-6 py-5 text-white overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #528FF0 0%, #3b6fd1 100%)' }}
        >
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/15 blur-2xl" />
          <div className="absolute -bottom-12 -left-8 w-28 h-28 rounded-full bg-white/10 blur-xl" />
          <div className="relative flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-white shadow-md flex items-center justify-center shrink-0">
              <img
                src="/aczen-logo.png"
                alt="Aczen"
                className="h-7 w-7 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                <h3 className="font-bold text-lg leading-tight">Online Payment Collection</h3>
              </div>
              <p className="text-xs text-white/85 mt-0.5">
                Accept card, UPI, and netbanking — settled directly to your bank via Razorpay.
              </p>
            </div>
          </div>
        </div>
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
              <div className="bg-[#528FF0]/10 border border-[#528FF0]/30 rounded-lg p-4 text-sm space-y-2">
                <p className="font-medium text-[#1e4fa8]">What happens next</p>
                <ol className="text-[#28579e] space-y-1 list-decimal pl-4 text-xs">
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
                variant="brand"
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

          {/* Disconnect / Reconnect (visible whenever a token is linked) */}
          {isLinked && (
            <div className="border-t pt-4">
              <Button
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
                variant="outline"
                size="sm"
                className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                {disconnect.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Unlink className="h-3.5 w-3.5" />
                )}
                Disconnect Razorpay
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Use this if payments are failing with an authorization error or
                if you need to re-link with updated permissions. Your account on
                Razorpay's side stays intact — only the local link is cleared.
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

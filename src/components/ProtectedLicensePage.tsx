import React from 'react';
import { useReferrerProtection } from '@/hooks/useReferrerProtection';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Shield, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedLicensePageProps {
  planType: 'starter' | 'growth' | 'scale';
  children: React.ReactNode;
}

export const ProtectedLicensePage: React.FC<ProtectedLicensePageProps> = ({ 
  planType, 
  children 
}) => {
  const { isAuthorized, isLoading, paymentInfo, simulateRazorpayReferrer } = useReferrerProtection(planType);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
        <Card className="w-96">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Verifying Access...</h3>
            <p className="text-gray-600 text-center text-sm">
              Checking payment authorization from Razorpay
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unauthorized state - will auto-redirect
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center">
        <Card className="w-96 border-red-200">
          <CardContent className="flex flex-col items-center justify-center p-8">
            <Shield className="h-8 w-8 text-red-600 mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-red-800">Access Denied</h3>
            <p className="text-gray-600 text-center text-sm mb-4">
              Redirecting to payment page...
            </p>
            <div className="w-full bg-red-100 h-2 rounded-full overflow-hidden">
              <div className="h-full bg-red-500 animate-pulse"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Authorized state - show the license generation page
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Payment verification banner */}
      <div className="bg-green-600 text-white py-2 px-4">
        <div className="max-w-4xl mx-auto flex items-center justify-center gap-2 text-sm">
          <CheckCircle className="w-4 h-4" />
          <span>Payment verified from Razorpay • {paymentInfo?.price} • {planType.charAt(0).toUpperCase() + planType.slice(1)} Plan</span>
        </div>
      </div>

      {/* Development helper (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="bg-yellow-100 border-b border-yellow-300 py-2 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <p className="text-yellow-800 text-sm mb-2">
              <strong>Development Mode:</strong> Simulate Razorpay referrer for testing
            </p>
            <div className="flex justify-center gap-2">
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => simulateRazorpayReferrer('starter')}
              >
                Simulate Starter (₹599)
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => simulateRazorpayReferrer('growth')}
              >
                Simulate Growth (₹1,799)
              </Button>
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => simulateRazorpayReferrer('scale')}
              >
                Simulate Scale (₹2,799)
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Original license generation content */}
      {children}
    </div>
  );
};
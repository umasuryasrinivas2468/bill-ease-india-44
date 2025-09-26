import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, CreditCard } from 'lucide-react';

export const UnauthorizedAccessPage: React.FC = () => {
  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const handleGoToRazorpay = () => {
    // Redirect to main Razorpay website or dashboard
    window.open('https://razorpay.com', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-2xl mx-auto text-center">
        <Card className="border-red-200 shadow-lg">
          <CardHeader className="pb-4">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-2xl font-bold text-red-800">
              Unauthorized Access
            </CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="text-gray-700">
              <p className="text-lg mb-4">
                This license generation page can only be accessed when redirected from Razorpay.
              </p>
              <p className="text-sm text-gray-600">
                For security reasons, direct access to license generation pages is not permitted.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Please access through Razorpay payment flow
              </h3>
              
              <div className="flex justify-center">
                <Button 
                  onClick={handleGoToRazorpay}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3"
                >
                  Go to Razorpay
                </Button>
              </div>
              
              <p className="text-sm text-gray-600 mt-4">
                You will be redirected to Razorpay. After completing your transaction there, 
                you'll be able to access the license generation pages.
              </p>
            </div>

            <div className="pt-4">
              <Button 
                onClick={handleBackToHome}
                variant="ghost"
                className="text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Home
              </Button>
            </div>

            <div className="text-xs text-gray-500 border-t pt-4">
              <p>If you believe this is an error, please contact our support team.</p>
              <p className="mt-1">Email: support@aczen.com | Phone: +91-XXXXXXXXXX</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
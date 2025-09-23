import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, CreditCard } from 'lucide-react';

export const UnauthorizedAccessPage: React.FC = () => {
  const handleBackToHome = () => {
    window.location.href = '/';
  };

  const handleGoToPayment = (plan: 'starter' | 'growth' | 'scale') => {
    const paymentUrls = {
      starter: 'https://payments.cashfree.com/forms/aczenbilz_rate_599',
      growth: 'https://payments.cashfree.com/forms/aczenbilz_rate_1799',
      scale: 'https://payments.cashfree.com/forms/aczenbilz_rate_2799'
    };
    
    window.open(paymentUrls[plan], '_blank');
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
                This license generation page can only be accessed after completing payment through our official Cashfree payment forms.
              </p>
              <p className="text-sm text-gray-600">
                For security reasons, direct access to license generation pages is not permitted.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-800 mb-3 flex items-center">
                <CreditCard className="w-5 h-5 mr-2" />
                Choose Your Plan & Complete Payment
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button 
                  onClick={() => handleGoToPayment('starter')}
                  variant="outline"
                  className="flex flex-col p-4 h-auto border-blue-300 hover:bg-blue-100"
                >
                  <span className="font-semibold text-blue-700">Starter Plan</span>
                  <span className="text-2xl font-bold text-blue-800">₹599</span>
                  <span className="text-xs text-blue-600">Basic Features</span>
                </Button>
                
                <Button 
                  onClick={() => handleGoToPayment('growth')}
                  variant="outline"
                  className="flex flex-col p-4 h-auto border-green-300 hover:bg-green-100"
                >
                  <span className="font-semibold text-green-700">Growth Plan</span>
                  <span className="text-2xl font-bold text-green-800">₹1,799</span>
                  <span className="text-xs text-green-600">Advanced Features</span>
                </Button>
                
                <Button 
                  onClick={() => handleGoToPayment('scale')}
                  variant="outline"
                  className="flex flex-col p-4 h-auto border-purple-300 hover:bg-purple-100"
                >
                  <span className="font-semibold text-purple-700">Scale Plan</span>
                  <span className="text-2xl font-bold text-purple-800">₹2,799</span>
                  <span className="text-xs text-purple-600">Premium Features</span>
                </Button>
              </div>
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
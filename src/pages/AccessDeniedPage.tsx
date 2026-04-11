import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, ArrowLeft, ExternalLink } from 'lucide-react';

export default function AccessDeniedPage() {
  const handleGoBack = () => {
    window.history.back();
  };

  const handleGoToPricing = () => {
    window.open('https://www.aczen.in/pricing', '_blank');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-red-200 shadow-lg">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
            <Shield className="h-8 w-8 text-red-600" />
          </div>
          
          <h1 className="text-2xl font-bold text-red-800 mb-3">Access Denied</h1>
          
          <p className="text-gray-600 mb-6 leading-relaxed">
            This page can only be accessed from authorized payment gateways. 
            Please complete your purchase through our official pricing page.
          </p>
          
          <div className="space-y-3 w-full">
            <Button 
              onClick={handleGoToPricing}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Pricing Page
            </Button>
            
            <Button 
              onClick={handleGoBack}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go Back
            </Button>
          </div>
          
          <div className="mt-6 text-xs text-gray-500">
            <p>Authorized domains:</p>
            <p className="font-mono">razorpay.com, rzp.io</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
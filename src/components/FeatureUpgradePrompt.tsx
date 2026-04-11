import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Star, Zap, Crown, ExternalLink } from 'lucide-react';
import { useUserPlan } from '@/hooks/useUserPlan';

interface FeatureUpgradePromptProps {
  featureName: string;
  description: string;
  className?: string;
}

export const FeatureUpgradePrompt: React.FC<FeatureUpgradePromptProps> = ({
  featureName,
  description,
  className = ""
}) => {
  const { planType } = useUserPlan();

  const planDetails = {
    growth: {
      name: 'Growth Plan',
      price: '₹1,799',
      icon: Star,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      paymentUrl: 'https://payments.cashfree.com/forms/aczenbilz_rate_1799'
    },
    scale: {
      name: 'Scale Plan', 
      price: '₹2,799',
      icon: Crown,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      paymentUrl: 'https://payments.cashfree.com/forms/aczenbilz_rate_2799'
    }
  };

  const handleUpgrade = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-gray-50 to-gray-100 ${className}`}>
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-orange-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-gray-900">
            {featureName} - Premium Feature
          </CardTitle>
          <p className="text-gray-600 mt-2">
            {description}
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          <Alert className="border-orange-200 bg-orange-50">
            <Lock className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-orange-800">
              <div>
                <div className="font-semibold">Current Plan: {planType?.charAt(0).toUpperCase() + planType?.slice(1) || 'Starter'}</div>
                <div className="text-sm mt-1">
                  This feature is available in Growth and Scale plans. Upgrade to unlock advanced capabilities.
                </div>
              </div>
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(planDetails).map(([key, plan]) => {
              const IconComponent = plan.icon;
              
              return (
                <Card key={key} className={`${plan.borderColor} ${plan.bgColor} transition-all hover:shadow-md`}>
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <IconComponent className={`w-6 h-6 ${plan.color}`} />
                      <div>
                        <h3 className="font-semibold text-gray-900">{plan.name}</h3>
                        <p className={`text-2xl font-bold ${plan.color}`}>{plan.price}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        All Starter features
                      </div>
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        Loans & Financing
                      </div>
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        Performance Reports
                      </div>
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        Virtual CFO
                      </div>
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        Cash Flow Forecasting
                      </div>
                      <div className="flex items-center text-sm text-gray-700">
                        <Zap className="w-4 h-4 mr-2 text-green-500" />
                        Sales & Purchase Orders
                      </div>
                    </div>
                    
                    <Button 
                      onClick={() => handleUpgrade(plan.paymentUrl)}
                      className="w-full"
                      size="sm"
                    >
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Upgrade to {plan.name}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="text-center pt-4 border-t">
            <p className="text-sm text-gray-600 mb-3">
              Questions about upgrading? We're here to help!
            </p>
            <div className="flex justify-center gap-4 text-sm text-gray-500">
              <span>📧 support@aczen.com</span>
              <span>📞 +91-XXXXXXXXXX</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FeatureUpgradePrompt;
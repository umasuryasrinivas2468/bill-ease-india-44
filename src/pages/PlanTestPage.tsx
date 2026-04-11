import React from 'react';
import { useUserPlan } from '@/hooks/useUserPlan';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Check, X } from 'lucide-react';

export default function PlanTestPage() {
  const { userLicense, features, isLoading, error } = useUserPlan();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading plan information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h3 className="font-semibold text-red-800 mb-2">Error Loading Plan</h3>
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const featureList = [
    { key: 'loans', name: 'Loans' },
    { key: 'performanceReports', name: 'Business Reports' },
    { key: 'virtualCFO', name: 'Virtual CFO' },
    { key: 'cashFlowForecasting', name: 'Cash Flow Forecasting' },
    { key: 'salesOrders', name: 'Sales Orders' },
    { key: 'purchaseOrders', name: 'Purchase Orders' },
  ] as const;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Plan Access Test</h1>
        <p className="text-gray-600">
          This page shows your current plan and feature access for testing purposes.
        </p>
      </div>

      {/* Current Plan Information */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Current Plan
            {userLicense && (
              <Badge variant={
                userLicense.plan_type === 'starter' ? 'secondary' :
                userLicense.plan_type === 'growth' ? 'default' : 'destructive'
              }>
                {userLicense.plan_type.toUpperCase()}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Your subscription details and access level
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userLicense ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Email</p>
                <p className="text-gray-900">{userLicense.email}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">License Key</p>
                <p className="text-gray-900 font-mono">{userLicense.license_key}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Plan Type</p>
                <p className="text-gray-900 capitalize">{userLicense.plan_type}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Due Date</p>
                <p className="text-gray-900">
                  {new Date(userLicense.due_date).toLocaleDateString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">No license information found</p>
          )}
        </CardContent>
      </Card>

      {/* Feature Access Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Access Matrix</CardTitle>
          <CardDescription>
            Shows which features are available with your current plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {featureList.map(({ key, name }) => (
              <div key={key} className="flex items-center justify-between p-3 border rounded-lg">
                <span className="font-medium">{name}</span>
                <div className="flex items-center gap-2">
                  {features[key] ? (
                    <>
                      <Check className="h-4 w-4 text-green-600" />
                      <Badge variant="outline" className="text-green-600 border-green-600">
                        Available
                      </Badge>
                    </>
                  ) : (
                    <>
                      <X className="h-4 w-4 text-red-600" />
                      <Badge variant="outline" className="text-red-600 border-red-600">
                        Restricted
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Plan Comparison</h4>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Starter:</strong> Limited access - most premium features restricted</p>
              <p><strong>Growth:</strong> Full access to all features</p>
              <p><strong>Scale:</strong> Full access to all features</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
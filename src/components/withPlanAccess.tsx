import React from 'react';
import { useUserPlan, PlanFeatures } from '@/hooks/useUserPlan';
import FeatureUpgradePrompt from '@/components/FeatureUpgradePrompt';
import { Loader2 } from 'lucide-react';

interface WithPlanAccessProps {
  feature: keyof PlanFeatures;
  featureName: string;
  description: string;
}

export function withPlanAccess<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  { feature, featureName, description }: WithPlanAccessProps
) {
  const WithPlanAccessComponent: React.FC<P> = (props) => {
    const { features, isLoading, error } = useUserPlan();

    // Show loading state
    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Checking your plan access...</p>
          </div>
        </div>
      );
    }

    // Show error state
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center max-w-md mx-auto p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-semibold text-red-800 mb-2">Access Error</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      );
    }

    // Check if user has access to this feature
    if (!features[feature]) {
      return (
        <FeatureUpgradePrompt 
          featureName={featureName}
          description={description}
        />
      );
    }

    // User has access, render the component
    return <WrappedComponent {...props} />;
  };

  WithPlanAccessComponent.displayName = `withPlanAccess(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithPlanAccessComponent;
}

// Convenience function for creating plan-restricted routes
export const createPlanRestrictedRoute = (
  component: React.ComponentType<any>,
  feature: keyof PlanFeatures,
  featureName: string,
  description: string
) => {
  return withPlanAccess(component, { feature, featureName, description });
};
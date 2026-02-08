import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { supabase } from '@/integrations/supabase/client';

export interface PlanFeatures {
  // Restricted for starter plan
  loans: boolean;
  performanceReports: boolean;
  virtualCFO: boolean;
  cashFlowForecasting: boolean;
  salesOrders: boolean;
  purchaseOrders: boolean;
  
  // Available for all plans
  invoices: boolean;
  clients: boolean;
  basicReports: boolean;
  banking: boolean;
  dashboard: boolean;
}

export interface UserLicense {
  id: string;
  email: string;
  license_key: string;
  plan_type: 'starter' | 'growth' | 'scale';
  date_created: string;
  due_date: string;
  created_at: string;
  updated_at: string;
}

export interface UserPlan {
  planType: 'starter' | 'growth' | 'scale' | null;
  userLicense: UserLicense | null;
  features: PlanFeatures;
  isLoading: boolean;
  error: string | null;
}

const PLAN_FEATURES: Record<'starter' | 'growth' | 'scale', PlanFeatures> = {
  starter: {
    // Restricted features for starter plan
    loans: false,
    performanceReports: true, // Now available for starter plan
    virtualCFO: false,
    cashFlowForecasting: false,
    salesOrders: false,
    purchaseOrders: false,
    
    // Available features for starter plan
    invoices: true,
    clients: true,
    basicReports: true,
    banking: true,
    dashboard: true,
  },
  growth: {
    // All features available for growth plan
    loans: true,
    performanceReports: true,
    virtualCFO: true,
    cashFlowForecasting: true,
    salesOrders: true,
    purchaseOrders: true,
    invoices: true,
    clients: true,
    basicReports: true,
    banking: true,
    dashboard: true,
  },
  scale: {
    // All features available for scale plan
    loans: true,
    performanceReports: true,
    virtualCFO: true,
    cashFlowForecasting: true,
    salesOrders: true,
    purchaseOrders: true,
    invoices: true,
    clients: true,
    basicReports: true,
    banking: true,
    dashboard: true,
  },
};

export const useUserPlan = (): UserPlan => {
  const { user } = useUser();
  const [planType, setPlanType] = useState<'starter' | 'growth' | 'scale' | null>(null);
  const [userLicense, setUserLicense] = useState<UserLicense | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchUserPlan = async () => {
      if (!user?.primaryEmailAddress?.emailAddress) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('license')
          .select('*')
          .eq('email', user.primaryEmailAddress.emailAddress)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            // No license found
            setError('No license found for this email. Please contact support.');
          } else {
            throw fetchError;
          }
          return;
        }

        // License found and valid
        
        setPlanType(data.plan_type as 'starter' | 'growth' | 'scale');
        setUserLicense(data as UserLicense);
      } catch (err: any) {
        console.error('Error fetching user plan:', err);
        setError('Failed to fetch plan information. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserPlan();
  }, [user?.primaryEmailAddress?.emailAddress, refreshTrigger]);

  const features = planType ? PLAN_FEATURES[planType] : PLAN_FEATURES.starter;

  return {
    planType,
    userLicense,
    features,
    isLoading,
    error,
  };
};

// Hook to check if a specific feature is available
export const useFeatureAccess = (featureName: keyof PlanFeatures): boolean => {
  const { features } = useUserPlan();
  return features[featureName];
};

// Component to wrap features that require plan access
export const PlanGate: React.FC<{
  feature: keyof PlanFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ feature, children, fallback = null }) => {
  const hasAccess = useFeatureAccess(feature);
  
  return hasAccess ? (children as React.ReactElement) : (fallback as React.ReactElement);
};
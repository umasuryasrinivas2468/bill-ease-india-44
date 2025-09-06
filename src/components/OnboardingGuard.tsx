import React, { useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSupabaseUser } from '@/hooks/useSupabaseUser';

interface OnboardingGuardProps {
  children: React.ReactNode;
}

const OnboardingGuard: React.FC<OnboardingGuardProps> = ({ children }) => {
  const { user: clerkUser } = useUser();
  const { supabaseUser, loading } = useSupabaseUser();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!loading && clerkUser && supabaseUser) {
      const isOnOnboardingRoute = location.pathname.startsWith('/onboarding');
      const onboardingCompleted = supabaseUser.onboarding_completed;

      if (!onboardingCompleted && !isOnOnboardingRoute) {
        // User hasn't completed onboarding, redirect to onboarding
        navigate('/onboarding', { replace: true });
      } else if (onboardingCompleted && isOnOnboardingRoute) {
        // User has completed onboarding but is on onboarding route, redirect to dashboard
        navigate('/dashboard', { replace: true });
      }
    }
  }, [clerkUser, supabaseUser, loading, location.pathname, navigate]);

  // Show loading while checking onboarding status
  if (loading || !clerkUser || !supabaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return <>{children}</>;
};

export default OnboardingGuard;
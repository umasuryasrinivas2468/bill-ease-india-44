
import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './ClerkAuthProvider';
import { useUserPlan } from '@/hooks/useUserPlan';
import ExpiredAccountPage from '@/pages/ExpiredAccountPage';

const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();
  const { error: planError, isLoading: planLoading } = useUserPlan();

  if (loading || planLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if license is expired and block access
  if (planError && planError.includes('expired')) {
    return <ExpiredAccountPage />;
  }

  return <Outlet />;
};

export default ProtectedRoute;


import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/components/ClerkAuthProvider';
import Landing from './Landing';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user is authenticated, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  // If user is not authenticated, show landing page
  return <Landing />;
};

export default Index;

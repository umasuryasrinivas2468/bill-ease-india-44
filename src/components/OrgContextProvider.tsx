/**
 * Organization Context Provider
 * Enforces single active organization context using Clerk
 * Handles organization selection, branch management, and session state
 */

import React, { useEffect, useState } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface OrgContextProviderProps {
  children: React.ReactNode;
  requiredRole?: 'org:admin' | 'manager' | 'accountant';
  redirectTo?: string;
}

/**
 * Enforces single active organization context
 * - Requires user to be in at least one organization
 * - Sets active org in session
 * - Validates org context on mount and org changes
 */
export const OrgContextProvider: React.FC<OrgContextProviderProps> = ({
  children,
  requiredRole = 'accountant',
  redirectTo = '/onboarding',
}) => {
  const { isLoaded, userId, sessionId } = useAuth();
  const { organization, isLoaded: orgLoaded, setActive: setActiveOrg } = useOrganization();
  const navigate = useNavigate();
  const [isInitialized, setIsInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize organization context on first load
  useEffect(() => {
    if (!isLoaded || !orgLoaded) return;

    if (!userId) {
      // User not authenticated - redirect to login is handled by Clerk
      setIsInitialized(true);
      return;
    }

    if (!organization) {
      // User has no organization - redirect to onboarding
      setError('You must be a member of an organization. Please contact your administrator.');
      navigate(redirectTo);
      return;
    }

    // Validate user role meets minimum requirement
    const userRole = organization.members?.find(m => m.userId === userId)?.role;
    
    // Check role hierarchy
    const roleHierarchy: Record<string, number> = {
      'org:admin': 3,
      'manager': 2,
      'accountant': 1,
      'viewer': 0,
    };

    const userLevel = roleHierarchy[userRole || ''] || 0;
    const requiredLevel = roleHierarchy[requiredRole] || 0;

    if (userLevel < requiredLevel) {
      setError(`Insufficient permissions. Required role: ${requiredRole}`);
      return;
    }

    // Store active org in session
    if (organization.id && sessionId) {
      sessionStorage.setItem('active-org-id', organization.id);
      sessionStorage.setItem('active-org-slug', organization.slug || '');
      sessionStorage.setItem('user-role', userRole || '');
    }

    setIsInitialized(true);
  }, [isLoaded, orgLoaded, userId, organization, sessionId, requiredRole, navigate, redirectTo]);

  // Show loading state
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading organization context...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Render children only when org context is valid
  return <>{children}</>;
};

export default OrgContextProvider;

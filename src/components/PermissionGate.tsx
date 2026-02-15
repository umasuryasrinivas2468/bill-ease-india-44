/**
 * Permission Gate Component
 * Conditionally renders content based on user permissions and organization context
 * Uses Clerk organization roles and custom permissions
 */

import React from 'react';
import { useClerkAuthorization } from '@/hooks/useClerkAuthorization';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock } from 'lucide-react';

interface PermissionGateProps {
  children: React.ReactNode;
  
  // Permission options (OR logic - any match succeeds)
  permissions?: string[];
  
  // Role options (OR logic - any match succeeds)
  roles?: string[];
  
  // Branch access
  branch?: string;
  
  // Branch any - if true, requires access to at least one branch
  requireBranch?: boolean;
  
  // Fallback UI
  fallback?: React.ReactNode | null;
  
  // Require all conditions or any (default: any)
  requireAll?: boolean;
}

/**
 * Permission Gate - Conditionally render based on permissions
 * 
 * @example
 * <PermissionGate permissions={['bill:create']}>
 *   <CreateBillButton />
 * </PermissionGate>
 * 
 * <PermissionGate roles={['org:admin', 'manager']}>
 *   <AdminPanel />
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  permissions = [],
  roles = [],
  branch,
  requireBranch = false,
  fallback = null,
  requireAll = false,
}) => {
  const auth = useClerkAuthorization();

  // Check if user has required organization context
  if (!auth.orgId) {
    return fallback || (
      <Alert variant="destructive">
        <Lock className="h-4 w-4" />
        <AlertDescription>Organization context required</AlertDescription>
      </Alert>
    );
  }

  // Check permissions
  let permissionsGranted = true;
  if (permissions.length > 0) {
    permissionsGranted = requireAll
      ? auth.hasAllPermissions(permissions)
      : auth.hasAnyPermission(permissions);
  }

  // Check roles
  let rolesGranted = true;
  if (roles.length > 0) {
    rolesGranted = auth.userRole ? roles.includes(auth.userRole) : false;
  }

  // Check branch access
  let branchGranted = true;
  if (requireBranch && !auth.branchId) {
    branchGranted = false;
  }
  if (branch && !auth.canAccessBranch(branch)) {
    branchGranted = false;
  }

  // Combine all checks
  const hasAccess = requireAll
    ? permissionsGranted && rolesGranted && branchGranted
    : permissionsGranted && rolesGranted && branchGranted;

  if (!hasAccess) {
    return fallback || (
      <Alert variant="destructive">
        <Lock className="h-4 w-4" />
        <AlertDescription>Insufficient permissions to access this content</AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
};

/**
 * Access Denied Component
 * Displays a full-page access denied message
 */
export const AccessDenied: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Alert variant="destructive" className="max-w-md">
        <Lock className="h-4 w-4" />
        <AlertDescription>
          {message || 'You do not have permission to access this page'}
        </AlertDescription>
      </Alert>
    </div>
  );
};

export default PermissionGate;

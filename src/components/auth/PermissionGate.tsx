import React from 'react';
import { useAuthorization, AppRole } from '@/hooks/useAuthorization';
import { Loader2, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PermissionGateProps {
  children: React.ReactNode;
  permission?: string;
  permissions?: string[];
  mode?: 'all' | 'any';
  role?: AppRole;
  minimumRole?: AppRole;
  fallback?: React.ReactNode;
  showLoading?: boolean;
  className?: string;
}

/**
 * PermissionGate - Conditionally renders children based on user permissions/roles
 * 
 * @example
 * // Single permission
 * <PermissionGate permission="invoices:create">
 *   <CreateInvoiceButton />
 * </PermissionGate>
 * 
 * @example
 * // Multiple permissions (all required)
 * <PermissionGate permissions={['invoices:create', 'invoices:update']} mode="all">
 *   <InvoiceEditor />
 * </PermissionGate>
 * 
 * @example
 * // Role-based
 * <PermissionGate role="org_admin">
 *   <AdminPanel />
 * </PermissionGate>
 * 
 * @example
 * // Minimum role level
 * <PermissionGate minimumRole="manager">
 *   <ApprovalPanel />
 * </PermissionGate>
 */
export const PermissionGate: React.FC<PermissionGateProps> = ({
  children,
  permission,
  permissions,
  mode = 'all',
  role,
  minimumRole,
  fallback = null,
  showLoading = true,
  className,
}) => {
  const { 
    hasPermission, 
    hasAllPermissions, 
    hasAnyPermission, 
    hasRole, 
    isAtLeastRole,
    isLoading,
    isSuperAdmin,
  } = useAuthorization();

  if (isLoading && showLoading) {
    return (
      <div className={cn("flex items-center justify-center p-4", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  // Super admins bypass all checks
  if (isSuperAdmin) {
    return <>{children}</>;
  }

  let hasAccess = true;

  // Check single permission
  if (permission) {
    hasAccess = hasPermission(permission);
  }

  // Check multiple permissions
  if (permissions && permissions.length > 0) {
    hasAccess = mode === 'all' 
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  }

  // Check specific role
  if (role) {
    hasAccess = hasAccess && hasRole(role);
  }

  // Check minimum role level
  if (minimumRole) {
    hasAccess = hasAccess && isAtLeastRole(minimumRole);
  }

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

/**
 * AccessDenied - A styled fallback component for denied access
 */
interface AccessDeniedProps {
  message?: string;
  className?: string;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({ 
  message = "You don't have permission to access this feature.",
  className,
}) => {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-8 text-center rounded-lg border bg-muted/50",
      className
    )}>
      <Lock className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold mb-2">Access Restricted</h3>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
    </div>
  );
};

export default PermissionGate;

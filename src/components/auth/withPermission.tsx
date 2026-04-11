import React from 'react';
import { useAuthorization, AppRole } from '@/hooks/useAuthorization';
import { AccessDenied } from './PermissionGate';
import { Loader2 } from 'lucide-react';

interface WithPermissionOptions {
  permission?: string;
  permissions?: string[];
  mode?: 'all' | 'any';
  role?: AppRole;
  minimumRole?: AppRole;
  fallback?: React.ReactNode;
}

/**
 * Higher-Order Component for permission-based access control
 * 
 * @example
 * const ProtectedInvoiceEditor = withPermission(InvoiceEditor, {
 *   permission: 'invoices:update',
 * });
 * 
 * @example
 * const AdminDashboard = withPermission(Dashboard, {
 *   role: 'org_admin',
 *   fallback: <AccessDenied message="Admin access required" />,
 * });
 */
export function withPermission<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options: WithPermissionOptions
) {
  const WithPermissionComponent: React.FC<P> = (props) => {
    const {
      hasPermission,
      hasAllPermissions,
      hasAnyPermission,
      hasRole,
      isAtLeastRole,
      isLoading,
      isSuperAdmin,
    } = useAuthorization();

    if (isLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Checking permissions...</p>
          </div>
        </div>
      );
    }

    // Super admins bypass all checks
    if (isSuperAdmin) {
      return <WrappedComponent {...props} />;
    }

    let hasAccess = true;

    // Check single permission
    if (options.permission) {
      hasAccess = hasPermission(options.permission);
    }

    // Check multiple permissions
    if (options.permissions && options.permissions.length > 0) {
      hasAccess = options.mode === 'any'
        ? hasAnyPermission(options.permissions)
        : hasAllPermissions(options.permissions);
    }

    // Check specific role
    if (options.role) {
      hasAccess = hasAccess && hasRole(options.role);
    }

    // Check minimum role level
    if (options.minimumRole) {
      hasAccess = hasAccess && isAtLeastRole(options.minimumRole);
    }

    if (!hasAccess) {
      if (options.fallback) {
        return <>{options.fallback}</>;
      }
      return <AccessDenied />;
    }

    return <WrappedComponent {...props} />;
  };

  WithPermissionComponent.displayName = `withPermission(${
    WrappedComponent.displayName || WrappedComponent.name || 'Component'
  })`;

  return WithPermissionComponent;
}

/**
 * Create a permission-restricted route component
 * 
 * @example
 * const AdminOnlyRoute = createPermissionRestrictedRoute(
 *   AdminPanel,
 *   { minimumRole: 'org_admin' }
 * );
 */
export const createPermissionRestrictedRoute = <P extends object>(
  component: React.ComponentType<P>,
  options: WithPermissionOptions
) => {
  return withPermission(component, options);
};

export default withPermission;

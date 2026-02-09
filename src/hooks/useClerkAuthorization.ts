/**
 * Clerk-based Authorization System
 * Enforces role-based and branch-level access control
 * All data tied to current organization context
 */

import { useAuth, useUser, useOrganization } from '@clerk/clerk-react';
import { useMemo } from 'react';

// Role hierarchy: higher = more permissions
export type UserRole = 'org:admin' | 'org:member' | 'manager' | 'accountant' | 'viewer';

const ROLE_HIERARCHY: Record<string, number> = {
  'org:admin': 4,
  'manager': 3,
  'org:member': 2,
  'accountant': 2,
  'viewer': 1,
};

// Permissions by role
const ROLE_PERMISSIONS: Record<string, string[]> = {
  'org:admin': [
    // Organization
    'org:read',
    'org:update',
    'org:delete',
    'org:manage_members',
    'org:manage_roles',
    'org:view_audit',
    
    // Branches
    'branch:create',
    'branch:read',
    'branch:update',
    'branch:delete',
    
    // Bills & Data
    'bill:create',
    'bill:read',
    'bill:update',
    'bill:delete',
    'bill:export',
    
    // Reports
    'report:read',
    'report:generate',
    'report:export',
    
    // Settings
    'settings:read',
    'settings:update',

    // Invoices
    'invoices:create',
    'invoices:read',
    'invoices:update',
    'invoices:delete',
  ],
  
  'manager': [
    'org:read',
    'branch:read',
    'bill:create',
    'bill:read',
    'bill:update',
    'bill:export',
    'report:read',
    'report:generate',
    'report:export',
    'invoices:create',
    'invoices:read',
    'invoices:update',
  ],

  'org:member': [
    'org:read',
    'branch:read',
    'bill:create',
    'bill:read',
    'bill:update',
    'report:read',
    'invoices:create',
    'invoices:read',
    'invoices:update',
  ],
  
  'accountant': [
    'org:read',
    'branch:read',
    'bill:create',
    'bill:read',
    'bill:update',
    'report:read',
    'invoices:create',
    'invoices:read',
  ],
  
  'viewer': [
    'org:read',
    'branch:read',
    'bill:read',
    'report:read',
    'invoices:read',
  ],
};

export interface AuthorizationContext {
  userId: string | null;
  orgId: string | null;
  userRole: string | null;
  branchId: string | null;
  isOrgAdmin: boolean;
  isManager: boolean;
  isAccountant: boolean;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  hasAllPermissions: (permissions: string[]) => boolean;
  canAccessBranch: (branchId: string) => boolean;
  getRoleLevel: () => number;
}

export function useClerkAuthorization(): AuthorizationContext {
  const { userId } = useAuth();
  const { user } = useUser();
  const { organization, membership } = useOrganization();

  // Get user's role in current organization from membership
  const userRole = useMemo<string | null>(() => {
    if (!organization || !membership) return null;
    
    // Clerk returns roles as: 'org:admin', 'org:member', etc.
    const clerkRole = membership.role;

    if (clerkRole === 'org:admin') return 'org:admin';
    if (clerkRole === 'org:member') {
      // Check custom role in publicMetadata
      const customRole = user?.publicMetadata?.role as string;
      return customRole || 'org:member';
    }
    
    return clerkRole || null;
  }, [organization, membership, user?.publicMetadata?.role]);

  // Get active branch from session
  const branchId = useMemo(() => {
    if (!organization) return null;
    return sessionStorage.getItem(`active-branch-${organization.id}`);
  }, [organization]);

  const permissions = useMemo(
    () => (userRole ? ROLE_PERMISSIONS[userRole] || ROLE_PERMISSIONS['org:member'] || [] : []),
    [userRole]
  );

  const hasPermission = (permission: string): boolean => {
    return permissions.includes(permission);
  };

  const hasAnyPermission = (permissionList: string[]): boolean => {
    return permissionList.some(p => permissions.includes(p));
  };

  const hasAllPermissions = (permissionList: string[]): boolean => {
    return permissionList.every(p => permissions.includes(p));
  };

  const canAccessBranch = (checkBranchId: string): boolean => {
    // Org admin can access all branches
    if (userRole === 'org:admin') return true;

    // Other roles can only access their assigned branches
    // Get user's branch restrictions from custom metadata
    const assignedBranches = user?.publicMetadata?.assignedBranches as string[] || [];
    
    // If no restrictions, can access all
    if (assignedBranches.length === 0) return true;
    
    return assignedBranches.includes(checkBranchId);
  };

  const getRoleLevel = (): number => {
    return userRole ? ROLE_HIERARCHY[userRole] || 0 : 0;
  };

  return {
    userId: userId || null,
    orgId: organization?.id || null,
    userRole,
    branchId,
    isOrgAdmin: userRole === 'org:admin',
    isManager: userRole === 'org:admin' || userRole === 'manager',
    isAccountant: userRole !== null,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    canAccessBranch,
    getRoleLevel,
  };
}

export default useClerkAuthorization;

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';

// Role types matching database enum
export type AppRole = 'super_admin' | 'org_admin' | 'ca' | 'manager' | 'accountant' | 'viewer';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  organization_id: string | null;
  is_active: boolean;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  category: string | null;
}

export interface AuthorizationState {
  roles: UserRole[];
  permissions: string[];
  isLoading: boolean;
  error: string | null;
  isSuperAdmin: boolean;
  currentRole: AppRole | null;
}

export function useAuthorization(organizationId?: string) {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [state, setState] = useState<AuthorizationState>({
    roles: [],
    permissions: [],
    isLoading: true,
    error: null,
    isSuperAdmin: false,
    currentRole: null,
  });

  // Fetch user roles
  const fetchRoles = useCallback(async () => {
    if (!user?.id || !isReady) return;

    try {
      const { data: roles, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true);

      if (error) throw error;

      const isSuperAdmin = roles?.some(r => r.role === 'super_admin') || false;
      
      // Determine current role for the organization context
      let currentRole: AppRole | null = null;
      if (isSuperAdmin) {
        currentRole = 'super_admin';
      } else if (organizationId) {
        const orgRole = roles?.find(r => r.organization_id === organizationId);
        currentRole = orgRole?.role as AppRole || null;
      } else if (roles?.length) {
        currentRole = roles[0].role as AppRole;
      }

      setState(prev => ({
        ...prev,
        roles: roles || [],
        isSuperAdmin,
        currentRole,
      }));
    } catch (err) {
      console.error('[useAuthorization] Error fetching roles:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch roles',
      }));
    }
  }, [user?.id, isReady, supabase, organizationId]);

  // Fetch permissions for user's roles
  const fetchPermissions = useCallback(async () => {
    if (!user?.id || !isReady || state.roles.length === 0) return;

    try {
      const roleValues = state.roles.map(r => r.role);
      
      const { data: rolePermissions, error } = await supabase
        .from('role_permissions')
        .select(`
          permission_id,
          permissions!inner(code)
        `)
        .in('role', roleValues);

      if (error) throw error;

      const permissionCodes = rolePermissions?.map(
        (rp: any) => rp.permissions?.code
      ).filter(Boolean) || [];

      setState(prev => ({
        ...prev,
        permissions: [...new Set(permissionCodes)],
        isLoading: false,
      }));
    } catch (err) {
      console.error('[useAuthorization] Error fetching permissions:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch permissions',
        isLoading: false,
      }));
    }
  }, [user?.id, isReady, supabase, state.roles]);

  // Check if user has a specific role
  const hasRole = useCallback((role: AppRole, orgId?: string): boolean => {
    if (state.isSuperAdmin) return true;
    
    return state.roles.some(r => 
      r.role === role && 
      r.is_active &&
      (!orgId || r.organization_id === orgId || r.organization_id === null)
    );
  }, [state.roles, state.isSuperAdmin]);

  // Check if user has a specific permission
  const hasPermission = useCallback((permissionCode: string): boolean => {
    if (state.isSuperAdmin) return true;
    return state.permissions.includes(permissionCode);
  }, [state.permissions, state.isSuperAdmin]);

  // Check multiple permissions (AND logic)
  const hasAllPermissions = useCallback((permissions: string[]): boolean => {
    if (state.isSuperAdmin) return true;
    return permissions.every(p => state.permissions.includes(p));
  }, [state.permissions, state.isSuperAdmin]);

  // Check multiple permissions (OR logic)
  const hasAnyPermission = useCallback((permissions: string[]): boolean => {
    if (state.isSuperAdmin) return true;
    return permissions.some(p => state.permissions.includes(p));
  }, [state.permissions, state.isSuperAdmin]);

  // Can perform action on resource
  const can = useCallback((action: string, resource: string): boolean => {
    const permissionCode = `${resource}:${action}`;
    return hasPermission(permissionCode);
  }, [hasPermission]);

  // Role hierarchy check (is role at least as high as given role)
  const roleHierarchy: Record<AppRole, number> = {
    super_admin: 100,
    org_admin: 80,
    ca: 70,
    manager: 60,
    accountant: 40,
    viewer: 20,
  };

  const isAtLeastRole = useCallback((minimumRole: AppRole): boolean => {
    if (!state.currentRole) return false;
    return roleHierarchy[state.currentRole] >= roleHierarchy[minimumRole];
  }, [state.currentRole]);

  // Effect to fetch roles
  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Effect to fetch permissions after roles are loaded
  useEffect(() => {
    if (state.roles.length > 0) {
      fetchPermissions();
    }
  }, [state.roles, fetchPermissions]);

  return {
    ...state,
    hasRole,
    hasPermission,
    hasAllPermissions,
    hasAnyPermission,
    can,
    isAtLeastRole,
    refetch: fetchRoles,
  };
}

// Convenience hook for checking a single permission
export function usePermission(permissionCode: string) {
  const { hasPermission, isLoading } = useAuthorization();
  return { allowed: hasPermission(permissionCode), isLoading };
}

// Convenience hook for checking multiple permissions
export function usePermissions(permissionCodes: string[], mode: 'all' | 'any' = 'all') {
  const { hasAllPermissions, hasAnyPermission, isLoading } = useAuthorization();
  const allowed = mode === 'all' 
    ? hasAllPermissions(permissionCodes)
    : hasAnyPermission(permissionCodes);
  return { allowed, isLoading };
}

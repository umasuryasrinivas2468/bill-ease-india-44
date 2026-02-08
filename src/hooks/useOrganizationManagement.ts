import { useState, useCallback } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { organizationService, CreateOrganizationInput } from '@/services/organizationService';
import { Organization } from './useOrganization';

export interface CreateOrganizationState {
  isLoading: boolean;
  error: string | null;
  organization: Organization | null;
}

/**
 * Hook for managing organization creation
 */
export function useCreateOrganization() {
  const { user } = useAuth();
  const [state, setState] = useState<CreateOrganizationState>({
    isLoading: false,
    error: null,
    organization: null,
  });

  const createOrganization = useCallback(
    async (input: CreateOrganizationInput) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return null;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        const org = await organizationService.createOrganization(input, user.id);

        setState({
          isLoading: false,
          error: null,
          organization: org,
        });

        return org;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to create organization';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const resetError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      organization: null,
    });
  }, []);

  return {
    ...state,
    createOrganization,
    resetError,
    reset,
  };
}

/**
 * Hook for inviting users to organization
 */
export function useInviteUser() {
  const { user } = useAuth();
  const [state, setState] = useState({
    isLoading: false,
    error: null,
  });

  const inviteUser = useCallback(
    async (email: string, role: string, organizationId: string) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return null;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        const result = await organizationService.inviteUser(
          {
            email,
            role: role as any,
            organizationId,
          },
          user.id
        );

        setState({
          isLoading: false,
          error: null,
        });

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to invite user';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const resetError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    inviteUser,
    resetError,
  };
}

/**
 * Hook for managing user roles in organization
 */
export function useOrganizationRoles() {
  const { user } = useAuth();
  const [state, setState] = useState({
    isLoading: false,
    error: null,
  });

  const updateUserRole = useCallback(
    async (userId: string, organizationId: string, newRole: string) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        await organizationService.updateUserRole(userId, organizationId, newRole, user.id);

        setState({
          isLoading: false,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to update role';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const removeUser = useCallback(
    async (userId: string, organizationId: string) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        await organizationService.removeUser(userId, organizationId, user.id);

        setState({
          isLoading: false,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to remove user';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const resetError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    updateUserRole,
    removeUser,
    resetError,
  };
}

/**
 * Hook for CA client assignments
 */
export function useCAClientAssignment() {
  const { user } = useAuth();
  const [state, setState] = useState({
    isLoading: false,
    error: null,
  });

  const assignClient = useCallback(
    async (
      caUserId: string,
      clientOrgId: string,
      accessLevel: 'full' | 'limited' | 'view_only',
      expiresAt?: Date
    ) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        await organizationService.assignCAClient(
          caUserId,
          clientOrgId,
          accessLevel,
          user.id,
          expiresAt
        );

        setState({
          isLoading: false,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to assign client';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const revokeClient = useCallback(
    async (caUserId: string, clientOrgId: string) => {
      if (!user?.id) {
        setState(prev => ({
          ...prev,
          error: 'User not authenticated',
        }));
        return;
      }

      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        await organizationService.revokeCAClient(caUserId, clientOrgId, user.id);

        setState({
          isLoading: false,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to revoke client';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        throw error;
      }
    },
    [user?.id]
  );

  const resetError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    assignClient,
    revokeClient,
    resetError,
  };
}

/**
 * Hook for audit logs
 */
export function useAuditLogs(organizationId?: string) {
  const [state, setState] = useState({
    logs: [] as any[],
    isLoading: false,
    error: null,
  });

  const fetchAuditLogs = useCallback(
    async (orgId: string, limit: number = 100, offset: number = 0) => {
      try {
        setState(prev => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        const logs = await organizationService.getAuditLogs(orgId, limit, offset);

        setState({
          logs,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch audit logs';
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
      }
    },
    []
  );

  return {
    ...state,
    fetchAuditLogs,
  };
}

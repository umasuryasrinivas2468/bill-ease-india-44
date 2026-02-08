import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { Organization } from './useOrganization';

export interface CAClientAccess {
  id: string;
  caUserId: string;
  clientOrganization: Organization;
  accessLevel: 'full' | 'limited' | 'view_only';
  isActive: boolean;
  expiresAt: string | null;
  assignedAt: string;
  notes: string | null;
}

export interface CAClientState {
  clients: CAClientAccess[];
  currentClient: Organization | null;
  isLoading: boolean;
  error: string | null;
}

interface CAClientContextType extends CAClientState {
  switchToClient: (clientOrgId: string) => Promise<void>;
  getClientPermissionLevel: (clientOrgId: string) => 'full' | 'limited' | 'view_only' | null;
  refetch: () => Promise<void>;
}

const CAClientContext = createContext<CAClientContextType | null>(null);

/**
 * Hook for accessing CA client context
 */
export function useCAClient() {
  const context = useContext(CAClientContext);
  if (!context) {
    throw new Error('useCAClient must be used within CAClientProvider');
  }
  return context;
}

/**
 * Hook for managing CA client access and switching
 * Supports multi-client access for Chartered Accountants
 */
export function useCAClientState() {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [state, setState] = useState<CAClientState>({
    clients: [],
    currentClient: null,
    isLoading: true,
    error: null,
  });

  /**
   * Fetch all clients the CA has access to
   */
  const fetchCAClients = useCallback(async () => {
    if (!user?.id || !isReady) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Get CA client assignments
      const { data: assignments, error: assignError } = await supabase
        .from('ca_client_assignments')
        .select(
          `
          id,
          ca_user_id,
          client_organization_id,
          access_level,
          is_active,
          expires_at,
          assigned_at,
          notes,
          organizations!client_organization_id (
            id,
            name,
            slug,
            gstin,
            pan,
            email,
            phone,
            city,
            state,
            pincode,
            address,
            logo_url,
            is_active,
            settings,
            created_at,
            updated_at
          )
        `
        )
        .eq('ca_user_id', user.id)
        .eq('is_active', true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (assignError) throw assignError;

      // Map to CAClientAccess format
      const clients: CAClientAccess[] = (assignments || [])
        .map((assign: any) => ({
          id: assign.id,
          caUserId: assign.ca_user_id,
          clientOrganization: assign.organizations,
          accessLevel: assign.access_level,
          isActive: assign.is_active,
          expiresAt: assign.expires_at,
          assignedAt: assign.assigned_at,
          notes: assign.notes,
        }))
        .filter((client: CAClientAccess) => client.clientOrganization);

      // Get stored current client or use first
      const storedClientId = localStorage.getItem('currentCAClientId');
      let currentClient = clients.find(
        (c) => c.clientOrganization.id === storedClientId
      )?.clientOrganization;

      if (!currentClient && clients.length > 0) {
        currentClient = clients[0].clientOrganization;
        if (currentClient) {
          localStorage.setItem('currentCAClientId', currentClient.id);
        }
      }

      setState({
        clients,
        currentClient: currentClient || null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('[useCAClientState] Error fetching clients:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch client access',
        isLoading: false,
      }));
    }
  }, [user?.id, isReady, supabase]);

  /**
   * Switch to a different client
   */
  const switchToClient = useCallback(
    async (clientOrgId: string) => {
      const client = state.clients.find((c) => c.clientOrganization.id === clientOrgId);
      if (client) {
        localStorage.setItem('currentCAClientId', clientOrgId);
        setState(prev => ({ ...prev, currentClient: client.clientOrganization }));
        window.location.reload();
      }
    },
    [state.clients]
  );

  /**
   * Get permission level for a specific client
   */
  const getClientPermissionLevel = useCallback(
    (clientOrgId: string): 'full' | 'limited' | 'view_only' | null => {
      const client = state.clients.find((c) => c.clientOrganization.id === clientOrgId);
      return client?.accessLevel || null;
    },
    [state.clients]
  );

  useEffect(() => {
    fetchCAClients();
  }, [fetchCAClients]);

  return {
    ...state,
    switchToClient,
    getClientPermissionLevel,
    refetch: fetchCAClients,
  };
}

export { CAClientContext };

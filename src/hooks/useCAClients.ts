import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { Organization } from './useOrganization';

export interface CAClientAssignment {
  id: string;
  ca_user_id: string;
  client_organization_id: string;
  is_active: boolean;
  access_level: 'full' | 'limited' | 'view_only';
  assigned_by: string | null;
  assigned_at: string;
  expires_at: string | null;
  notes: string | null;
  organization?: Organization;
}

export interface CAClientsState {
  clients: CAClientAssignment[];
  currentClient: Organization | null;
  isLoading: boolean;
  error: string | null;
}

export function useCAClients() {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [state, setState] = useState<CAClientsState>({
    clients: [],
    currentClient: null,
    isLoading: true,
    error: null,
  });

  // Fetch CA's client assignments
  const fetchClients = useCallback(async () => {
    if (!user?.id || !isReady) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Get CA client assignments
      const { data: assignments, error: assignError } = await supabase
        .from('ca_client_assignments')
        .select('*')
        .eq('ca_user_id', user.id)
        .eq('is_active', true);

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setState({
          clients: [],
          currentClient: null,
          isLoading: false,
          error: null,
        });
        return;
      }

      // Fetch organization details for each client
      const orgIds = assignments.map(a => a.client_organization_id);
      const { data: organizations, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (orgsError) throw orgsError;

      // Enrich assignments with organization data
      const enrichedClients: CAClientAssignment[] = assignments.map(a => ({
        ...a,
        access_level: a.access_level as 'full' | 'limited' | 'view_only',
        organization: organizations?.find(o => o.id === a.client_organization_id),
      }));

      // Get stored current client or use first one
      const storedClientId = localStorage.getItem('currentCAClientId');
      let currentClient = enrichedClients.find(
        c => c.client_organization_id === storedClientId
      )?.organization;

      if (!currentClient && enrichedClients.length > 0) {
        currentClient = enrichedClients[0].organization;
        if (currentClient) {
          localStorage.setItem('currentCAClientId', currentClient.id);
        }
      }

      setState({
        clients: enrichedClients,
        currentClient: currentClient || null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('[useCAClients] Error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch CA clients',
        isLoading: false,
      }));
    }
  }, [user?.id, isReady, supabase]);

  // Switch to a different client
  const switchClient = useCallback((clientOrgId: string) => {
    const client = state.clients.find(c => c.client_organization_id === clientOrgId);
    if (client?.organization) {
      localStorage.setItem('currentCAClientId', clientOrgId);
      setState(prev => ({ ...prev, currentClient: client.organization! }));
    }
  }, [state.clients]);

  // Get access level for current client
  const getCurrentAccessLevel = useCallback(() => {
    if (!state.currentClient) return null;
    const assignment = state.clients.find(
      c => c.client_organization_id === state.currentClient?.id
    );
    return assignment?.access_level || null;
  }, [state.clients, state.currentClient]);

  // Check if CA has access to a specific client
  const hasAccessTo = useCallback((clientOrgId: string) => {
    return state.clients.some(
      c => c.client_organization_id === clientOrgId && c.is_active
    );
  }, [state.clients]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  return {
    ...state,
    switchClient,
    getCurrentAccessLevel,
    hasAccessTo,
    refetch: fetchClients,
  };
}

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { AppRole } from './useAuthorization';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  gstin: string | null;
  pan: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  is_active: boolean;
  settings: Record<string, any>;
  created_at: string;
}

export interface UserOrganization {
  organization_id: string;
  role: AppRole;
  is_ca_client: boolean;
  organization?: Organization;
}

export interface OrganizationState {
  organizations: UserOrganization[];
  currentOrganization: Organization | null;
  isLoading: boolean;
  error: string | null;
}

interface OrganizationContextType extends OrganizationState {
  switchOrganization: (organizationId: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

export function useOrganizationState() {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const [state, setState] = useState<OrganizationState>({
    organizations: [],
    currentOrganization: null,
    isLoading: true,
    error: null,
  });

  // Fetch user's organizations
  const fetchOrganizations = useCallback(async () => {
    if (!user?.id || !isReady) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      // Get organizations through the database function
      const { data: userOrgs, error: orgsError } = await supabase
        .rpc('get_user_organizations', { _user_id: user.id });

      if (orgsError) throw orgsError;

      if (!userOrgs || userOrgs.length === 0) {
        setState(prev => ({
          ...prev,
          organizations: [],
          currentOrganization: null,
          isLoading: false,
        }));
        return;
      }

      // Fetch full organization details
      const orgIds = userOrgs.map((uo: any) => uo.organization_id);
      const { data: organizations, error: detailsError } = await supabase
        .from('organizations')
        .select('*')
        .in('id', orgIds);

      if (detailsError) throw detailsError;

      // Combine user org data with organization details
      const enrichedOrgs: UserOrganization[] = userOrgs.map((uo: any) => ({
        organization_id: uo.organization_id,
        role: uo.role,
        is_ca_client: uo.is_ca_client,
        organization: organizations?.find(o => o.id === uo.organization_id),
      }));

      // Get stored current org or use first one
      const storedOrgId = localStorage.getItem('currentOrganizationId');
      let currentOrg = enrichedOrgs.find(o => o.organization_id === storedOrgId)?.organization;
      
      if (!currentOrg && enrichedOrgs.length > 0) {
        currentOrg = enrichedOrgs[0].organization;
        if (currentOrg) {
          localStorage.setItem('currentOrganizationId', currentOrg.id);
        }
      }

      setState({
        organizations: enrichedOrgs,
        currentOrganization: currentOrg || null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      console.error('[useOrganization] Error:', err);
      setState(prev => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to fetch organizations',
        isLoading: false,
      }));
    }
  }, [user?.id, isReady, supabase]);

  // Switch to a different organization
  const switchOrganization = useCallback(async (organizationId: string) => {
    const org = state.organizations.find(o => o.organization_id === organizationId)?.organization;
    if (org) {
      localStorage.setItem('currentOrganizationId', organizationId);
      setState(prev => ({ ...prev, currentOrganization: org }));
    }
  }, [state.organizations]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  return {
    ...state,
    switchOrganization,
    refetch: fetchOrganizations,
  };
}

export { OrganizationContext };

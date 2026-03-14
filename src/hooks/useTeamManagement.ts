import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { useToast } from '@/hooks/use-toast';

export type TeamRole = 'org_admin' | 'manager' | 'accountant' | 'viewer';

export interface TeamMember {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  role: TeamRole;
  organization_id: string;
  is_active: boolean;
  joined_at: string;
}

export interface PendingInvite {
  id: string;
  email: string;
  role: string;
  token: string;
  created_at: string;
  expires_at: string;
  invited_by: string;
}

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
}

export function useTeamManagement(organizationId?: string) {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<TeamRole | null>(null);
  const [userOrg, setUserOrg] = useState<UserOrganization | null>(null);
  const [activeOrgId, setActiveOrgId] = useState<string | undefined>(organizationId);

  // Auto-detect user's organization if none provided
  useEffect(() => {
    if (organizationId) {
      setActiveOrgId(organizationId);
      return;
    }
    if (!user?.id || !isReady) return;

    const detectOrg = async () => {
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('organization_id, organizations(id, name, slug)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('is_primary', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (membership) {
        const org = (membership as any).organizations;
        setActiveOrgId(membership.organization_id);
        setUserOrg(org ? { id: org.id, name: org.name, slug: org.slug } : null);
      } else {
        setIsLoading(false);
      }
    };
    detectOrg();
  }, [user?.id, isReady, organizationId, supabase]);

  // Fetch team members
  const fetchMembers = useCallback(async () => {
    if (!user?.id || !isReady || !activeOrgId) return;

    try {
      setIsLoading(true);

      // Get all user_organizations for this org
      const { data: orgMembers, error: orgError } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', activeOrgId)
        .eq('is_active', true);

      if (orgError) throw orgError;

      // Get user details and roles for each member
      const memberData: TeamMember[] = [];
      for (const om of orgMembers || []) {
        const { data: userData } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('clerk_id', om.user_id)
          .maybeSingle();

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', om.user_id)
          .eq('organization_id', activeOrgId)
          .eq('is_active', true)
          .maybeSingle();

        memberData.push({
          id: om.id,
          user_id: om.user_id,
          email: userData?.email || 'Unknown',
          full_name: userData?.full_name || null,
          role: (roleData?.role as TeamRole) || 'viewer',
          organization_id: activeOrgId,
          is_active: true,
          joined_at: om.joined_at || om.created_at,
        });

        if (om.user_id === user.id) {
          setCurrentUserRole((roleData?.role as TeamRole) || 'viewer');
        }
      }

      setMembers(memberData);

      // Fetch pending invitations
      const { data: invites } = await supabase
        .from('invitations')
        .select('*')
        .eq('organization_id', activeOrgId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString());

      setPendingInvites(invites || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isReady, supabase, activeOrgId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Create organization for current user if none exists
  const createOrganization = useCallback(async (name: string) => {
    if (!user?.id) return null;

    try {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name, slug, created_by: user.id })
        .select()
        .single();

      if (orgError) throw orgError;

      // Add current user as org_admin
      await supabase.from('user_organizations').insert({
        user_id: user.id,
        organization_id: org.id,
        is_primary: true,
        is_active: true,
        invited_by: user.id,
      });

      await supabase.from('user_roles').insert({
        user_id: user.id,
        role: 'org_admin',
        organization_id: org.id,
        granted_by: user.id,
        is_active: true,
      });

      setActiveOrgId(org.id);
      setUserOrg({ id: org.id, name: org.name, slug: org.slug });
      setCurrentUserRole('org_admin');

      toast({ title: 'Organization created', description: `"${name}" is ready.` });
      await fetchMembers();
      return org;
    } catch (err) {
      console.error('Error creating organization:', err);
      toast({ title: 'Error', description: 'Failed to create organization.', variant: 'destructive' });
      return null;
    }
  }, [user?.id, supabase, toast, fetchMembers]);

  // Invite a new member by email - generates copiable link
  const inviteMember = useCallback(async (email: string, role: TeamRole): Promise<string | null> => {
    if (!user?.id || !activeOrgId) return null;

    try {
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const { error } = await supabase.from('invitations').insert({
        email,
        role,
        organization_id: activeOrgId,
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      const inviteLink = `${window.location.origin}/accept-invite?token=${token}`;

      await fetchMembers();
      return inviteLink;
    } catch (err) {
      console.error('Error inviting member:', err);
      toast({ title: 'Error', description: 'Failed to create invitation.', variant: 'destructive' });
      return null;
    }
  }, [user?.id, activeOrgId, supabase, toast, fetchMembers]);

  // Update a member's role
  const updateMemberRole = useCallback(async (memberId: string, memberUserId: string, newRole: TeamRole) => {
    if (!activeOrgId) return false;

    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('user_id', memberUserId)
        .eq('organization_id', activeOrgId);

      if (error) throw error;

      toast({ title: 'Role updated', description: `Role changed to ${newRole}.` });
      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error updating role:', err);
      toast({ title: 'Error', description: 'Failed to update role.', variant: 'destructive' });
      return false;
    }
  }, [activeOrgId, supabase, toast, fetchMembers]);

  // Remove a member
  const removeMember = useCallback(async (memberId: string, memberUserId: string) => {
    if (!activeOrgId) return false;

    try {
      await supabase
        .from('user_organizations')
        .update({ is_active: false })
        .eq('user_id', memberUserId)
        .eq('organization_id', activeOrgId);

      await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', memberUserId)
        .eq('organization_id', activeOrgId);

      toast({ title: 'Member removed' });
      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error removing member:', err);
      toast({ title: 'Error', description: 'Failed to remove member.', variant: 'destructive' });
      return false;
    }
  }, [activeOrgId, supabase, toast, fetchMembers]);

  // Revoke an invitation
  const revokeInvite = useCallback(async (inviteId: string) => {
    try {
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', inviteId);

      if (error) throw error;

      toast({ title: 'Invitation revoked' });
      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error revoking invite:', err);
      return false;
    }
  }, [supabase, toast, fetchMembers]);

  const isAdmin = currentUserRole === 'org_admin';

  return {
    members,
    pendingInvites,
    isLoading,
    currentUserRole,
    isAdmin,
    activeOrgId,
    userOrg,
    inviteMember,
    updateMemberRole,
    removeMember,
    revokeInvite,
    createOrganization,
    refetch: fetchMembers,
  };
}

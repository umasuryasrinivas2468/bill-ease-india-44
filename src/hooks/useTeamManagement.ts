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
  created_at: string;
  expires_at: string;
  invited_by: string;
}

export function useTeamManagement(organizationId?: string) {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();
  const { toast } = useToast();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<TeamRole | null>(null);

  // Fetch team members
  const fetchMembers = useCallback(async () => {
    if (!user?.id || !isReady || !organizationId) return;

    try {
      setIsLoading(true);

      // Get all user_organizations for this org
      const { data: orgMembers, error: orgError } = await supabase
        .from('user_organizations')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      if (orgError) throw orgError;

      // Get user details and roles for each member
      const memberData: TeamMember[] = [];
      for (const om of orgMembers || []) {
        // Get user info
        const { data: userData } = await supabase
          .from('users')
          .select('email, full_name')
          .eq('clerk_id', om.user_id)
          .single();

        // Get role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', om.user_id)
          .eq('organization_id', organizationId)
          .eq('is_active', true)
          .single();

        memberData.push({
          id: om.id,
          user_id: om.user_id,
          email: userData?.email || 'Unknown',
          full_name: userData?.full_name || null,
          role: (roleData?.role as TeamRole) || 'viewer',
          organization_id: organizationId,
          is_active: true,
          joined_at: om.joined_at || om.created_at,
        });

        // Track current user's role
        if (om.user_id === user.id) {
          setCurrentUserRole((roleData?.role as TeamRole) || 'viewer');
        }
      }

      setMembers(memberData);

      // Fetch pending invitations
      const { data: invites, error: invError } = await supabase
        .from('invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString());

      if (!invError) {
        setPendingInvites(invites || []);
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, isReady, supabase, organizationId]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Invite a new member by email
  const inviteMember = useCallback(async (email: string, role: TeamRole) => {
    if (!user?.id || !organizationId) return false;

    try {
      // Generate a unique token
      const token = crypto.randomUUID();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

      const { error } = await supabase.from('invitations').insert({
        email,
        role,
        organization_id: organizationId,
        invited_by: user.id,
        token,
        expires_at: expiresAt.toISOString(),
      });

      if (error) throw error;

      // Generate the invite link
      const inviteLink = `${window.location.origin}/accept-invite?token=${token}`;

      toast({
        title: 'Invitation sent!',
        description: `Share this link with ${email}: The invite link has been copied to your clipboard.`,
      });

      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(inviteLink);
      } catch {
        console.log('Invite link:', inviteLink);
      }

      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error inviting member:', err);
      toast({
        title: 'Error',
        description: 'Failed to send invitation. Please try again.',
        variant: 'destructive',
      });
      return false;
    }
  }, [user?.id, organizationId, supabase, toast, fetchMembers]);

  // Update a member's role
  const updateMemberRole = useCallback(async (memberId: string, memberUserId: string, newRole: TeamRole) => {
    if (!organizationId) return false;

    try {
      // Update user_roles
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('user_id', memberUserId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      toast({
        title: 'Role updated',
        description: `Member role has been changed to ${newRole}.`,
      });

      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error updating role:', err);
      toast({
        title: 'Error',
        description: 'Failed to update role.',
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId, supabase, toast, fetchMembers]);

  // Remove a member
  const removeMember = useCallback(async (memberId: string, memberUserId: string) => {
    if (!organizationId) return false;

    try {
      // Deactivate in user_organizations
      await supabase
        .from('user_organizations')
        .update({ is_active: false })
        .eq('user_id', memberUserId)
        .eq('organization_id', organizationId);

      // Deactivate role
      await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', memberUserId)
        .eq('organization_id', organizationId);

      toast({
        title: 'Member removed',
        description: 'Team member has been removed from the organization.',
      });

      await fetchMembers();
      return true;
    } catch (err) {
      console.error('Error removing member:', err);
      toast({
        title: 'Error',
        description: 'Failed to remove member.',
        variant: 'destructive',
      });
      return false;
    }
  }, [organizationId, supabase, toast, fetchMembers]);

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
    inviteMember,
    updateMemberRole,
    removeMember,
    revokeInvite,
    refetch: fetchMembers,
  };
}

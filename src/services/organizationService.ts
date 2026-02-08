import { supabase } from '@/lib/supabaseClient';
import { Organization } from '@/hooks/useOrganization';
import { v4 as uuidv4 } from 'uuid';

export interface CreateOrganizationInput {
  name: string;
  slug: string;
  gstin?: string;
  pan?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  settings?: Record<string, any>;
}

export interface InviteUserInput {
  email: string;
  role: 'org_admin' | 'manager' | 'accountant' | 'viewer';
  organizationId: string;
}

export interface AuditLogInput {
  userId: string;
  organizationId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
}

/**
 * Organization Service - Handles all organization-related operations
 * Includes creation, management, and audit logging
 */
export const organizationService = {
  /**
   * Create a new organization
   */
  async createOrganization(
    input: CreateOrganizationInput,
    userId: string
  ): Promise<Organization> {
    try {
      // Validate slug uniqueness
      const { data: existingOrg } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', input.slug)
        .single();

      if (existingOrg) {
        throw new Error('Organization slug already exists');
      }

      // Create organization
      const { data: org, error: createError } = await supabase
        .from('organizations')
        .insert({
          name: input.name,
          slug: input.slug,
          gstin: input.gstin || null,
          pan: input.pan || null,
          email: input.email || null,
          phone: input.phone || null,
          city: input.city || null,
          state: input.state || null,
          pincode: input.pincode || null,
          address: input.address || null,
          settings: input.settings || {},
          created_by: userId,
        })
        .select()
        .single();

      if (createError || !org) {
        throw createError || new Error('Failed to create organization');
      }

      // Add creator as org_admin
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: userId,
          role: 'org_admin',
          organization_id: org.id,
          is_active: true,
          granted_by: userId,
        });

      if (roleError) {
        // Clean up the created org if role assignment fails
        await supabase.from('organizations').delete().eq('id', org.id);
        throw roleError;
      }

      // Add creator to user_organizations
      const { error: memberError } = await supabase
        .from('user_organizations')
        .insert({
          user_id: userId,
          organization_id: org.id,
          is_primary: true,
          is_active: true,
          invited_by: userId,
        });

      if (memberError) {
        throw memberError;
      }

      // Log the audit event
      await this.logAudit({
        userId,
        organizationId: org.id,
        action: 'organization.created',
        resourceType: 'organization',
        resourceId: org.id,
        newValues: org as any,
        severity: 'info',
      });

      return org;
    } catch (error) {
      console.error('[organizationService.createOrganization]', error);
      throw error;
    }
  },

  /**
   * Update organization details
   */
  async updateOrganization(
    organizationId: string,
    updates: Partial<CreateOrganizationInput>,
    userId: string
  ): Promise<Organization> {
    try {
      // Get current data for audit log
      const { data: currentOrg } = await supabase
        .from('organizations')
        .select()
        .eq('id', organizationId)
        .single();

      // Update organization
      const { data: updated, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', organizationId)
        .select()
        .single();

      if (error || !updated) {
        throw error || new Error('Failed to update organization');
      }

      // Log the audit event
      await this.logAudit({
        userId,
        organizationId,
        action: 'organization.updated',
        resourceType: 'organization',
        resourceId: organizationId,
        oldValues: currentOrg as any,
        newValues: updated as any,
        severity: 'info',
      });

      return updated;
    } catch (error) {
      console.error('[organizationService.updateOrganization]', error);
      throw error;
    }
  },

  /**
   * Invite a user to an organization
   */
  async inviteUser(input: InviteUserInput, invitedBy: string): Promise<{ invitationLink: string; token: string; expiresAt: string }> {
    try {
      // Generate unique token for this invitation (7 days validity)
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // Create invitation record
      const { data: invitation, error: invitationError } = await supabase
        .from('invitations')
        .insert({
          email: input.email,
          organization_id: input.organizationId,
          role: input.role,
          token,
          invited_by: invitedBy,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (invitationError || !invitation) {
        throw invitationError || new Error('Failed to create invitation');
      }

      // Log the audit event
      await this.logAudit({
        userId: invitedBy,
        organizationId: input.organizationId,
        action: 'user.invited',
        resourceType: 'invitation',
        resourceId: invitation.id,
        newValues: { email: input.email, role: input.role, token },
        severity: 'info',
        metadata: { invitedUser: input.email, invitationToken: token },
      });

      // Create invitation link - adjust based on your app's domain
      const appUrl = typeof window !== 'undefined' ? window.location.origin : 'https://billeaseindia.com';
      const invitationLink = `${appUrl}/signup?token=${token}&email=${encodeURIComponent(input.email)}`;

      return {
        invitationLink,
        token,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      console.error('[organizationService.inviteUser]', error);
      throw error;
    }
  },

  /**
   * Remove a user from an organization
   */
  async removeUser(userId: string, organizationId: string, removedBy: string): Promise<void> {
    try {
      // Deactivate user roles
      const { error: deactivateError } = await supabase
        .from('user_roles')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('organization_id', organizationId);

      if (deactivateError) throw deactivateError;

      // Deactivate membership
      const { error: memberError } = await supabase
        .from('user_organizations')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('organization_id', organizationId);

      if (memberError) throw memberError;

      // Log the audit event
      await this.logAudit({
        userId: removedBy,
        organizationId,
        action: 'user.removed',
        resourceType: 'user_role',
        resourceId: userId,
        severity: 'warning',
        metadata: { removedUser: userId },
      });
    } catch (error) {
      console.error('[organizationService.removeUser]', error);
      throw error;
    }
  },

  /**
   * Update user role in organization
   */
  async updateUserRole(
    userId: string,
    organizationId: string,
    newRole: string,
    updatedBy: string
  ): Promise<void> {
    try {
      // Get current role
      const { data: currentRole } = await supabase
        .from('user_roles')
        .select()
        .eq('user_id', userId)
        .eq('role', newRole)
        .eq('organization_id', organizationId)
        .single();

      // Update role
      const { error } = await supabase
        .from('user_roles')
        .update({ role: newRole })
        .eq('user_id', userId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      // Log the audit event
      await this.logAudit({
        userId: updatedBy,
        organizationId,
        action: 'user.role_changed',
        resourceType: 'user_role',
        resourceId: userId,
        oldValues: { role: currentRole?.role },
        newValues: { role: newRole },
        severity: 'warning',
        metadata: { changedUser: userId },
      });
    } catch (error) {
      console.error('[organizationService.updateUserRole]', error);
      throw error;
    }
  },

  /**
   * Assign CA client access
   */
  async assignCAClient(
    caUserId: string,
    clientOrgId: string,
    accessLevel: 'full' | 'limited' | 'view_only',
    assignedBy: string,
    expiresAt?: Date
  ): Promise<void> {
    try {
      const { error } = await supabase
        .from('ca_client_assignments')
        .insert({
          ca_user_id: caUserId,
          client_organization_id: clientOrgId,
          is_active: true,
          access_level: accessLevel,
          assigned_by: assignedBy,
          expires_at: expiresAt?.toISOString(),
        });

      if (error) throw error;

      // Log the audit event
      await this.logAudit({
        userId: assignedBy,
        organizationId: clientOrgId,
        action: 'ca.client_assigned',
        resourceType: 'ca_client_assignment',
        newValues: { caUserId, accessLevel },
        severity: 'warning',
        metadata: { caUser: caUserId, clientOrg: clientOrgId },
      });
    } catch (error) {
      console.error('[organizationService.assignCAClient]', error);
      throw error;
    }
  },

  /**
   * Revoke CA client access
   */
  async revokeCAClient(caUserId: string, clientOrgId: string, revokedBy: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('ca_client_assignments')
        .update({ is_active: false })
        .eq('ca_user_id', caUserId)
        .eq('client_organization_id', clientOrgId);

      if (error) throw error;

      // Log the audit event
      await this.logAudit({
        userId: revokedBy,
        organizationId: clientOrgId,
        action: 'ca.client_revoked',
        resourceType: 'ca_client_assignment',
        severity: 'critical',
        metadata: { caUser: caUserId, clientOrg: clientOrgId },
      });
    } catch (error) {
      console.error('[organizationService.revokeCAClient]', error);
      throw error;
    }
  },

  /**
   * Log audit event for compliance tracking
   */
  async logAudit(input: AuditLogInput): Promise<void> {
    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: input.userId,
        organization_id: input.organizationId || null,
        action: input.action,
        resource_type: input.resourceType,
        resource_id: input.resourceId || null,
        old_values: input.oldValues || null,
        new_values: input.newValues || null,
        severity: input.severity || 'info',
        metadata: input.metadata || {},
        ip_address: null, // Can be populated from request context
        user_agent: typeof window !== 'undefined' ? navigator.userAgent : null,
        session_id: null, // Can be populated from session management
      });

      if (error) {
        console.error('[organizationService.logAudit] Failed to log audit event:', error);
        // Don't throw - audit logging failures shouldn't break operations
      }
    } catch (error) {
      console.error('[organizationService.logAudit]', error);
      // Don't throw - audit logging failures shouldn't break operations
    }
  },

  /**
   * Get audit logs for organization
   */
  async getAuditLogs(
    organizationId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select()
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[organizationService.getAuditLogs]', error);
      throw error;
    }
  },

  /**
   * Track user session for concurrent user management
   */
  async trackUserSession(
    userId: string,
    organizationId: string,
    sessionToken: string,
    expiresAt: Date
  ): Promise<void> {
    try {
      const { error } = await supabase.from('user_sessions').insert({
        user_id: userId,
        organization_id: organizationId,
        session_token: sessionToken,
        is_active: true,
        expires_at: expiresAt.toISOString(),
        device_info: {
          userAgent: typeof window !== 'undefined' ? navigator.userAgent : null,
          timestamp: new Date().toISOString(),
        },
      });

      if (error) {
        console.error('[organizationService.trackUserSession]', error);
        // Don't throw - session tracking shouldn't break operations
      }
    } catch (error) {
      console.error('[organizationService.trackUserSession]', error);
    }
  },

  /**
   * Get active sessions for user
   */
  async getActiveSessions(userId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select()
        .eq('user_id', userId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[organizationService.getActiveSessions]', error);
      throw error;
    }
  },

  /**
   * Revoke user session
   */
  async revokeSession(sessionId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false })
        .eq('id', sessionId);

      if (error) throw error;
    } catch (error) {
      console.error('[organizationService.revokeSession]', error);
      throw error;
    }
  },

  /**
   * Get pending invitations for an organization
   */
  async getPendingInvitations(organizationId: string): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          id,
          email,
          role,
          token,
          expires_at,
          created_at,
          invited_by
        `)
        .eq('organization_id', organizationId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('[organizationService.getPendingInvitations]', error);
      throw error;
    }
  },

  /**
   * Revoke/cancel an invitation
   */
  async revokeInvitation(invitationId: string, organizationId: string, revokedBy: string): Promise<void> {
    try {
      // Delete the invitation
      const { error } = await supabase
        .from('invitations')
        .delete()
        .eq('id', invitationId)
        .eq('organization_id', organizationId);

      if (error) throw error;

      // Log the audit event
      await this.logAudit({
        userId: revokedBy,
        organizationId,
        action: 'invitation.revoked',
        resourceType: 'invitation',
        resourceId: invitationId,
        severity: 'info',
      });
    } catch (error) {
      console.error('[organizationService.revokeInvitation]', error);
      throw error;
    }
  },

  /**
   * Get invitation details by token (for signup validation)
   */
  async getInvitationByToken(token: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select(`
          id,
          email,
          organization_id,
          role,
          expires_at,
          created_at
        `)
        .eq('token', token)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        throw error;
      }
      return data;
    } catch (error) {
      console.error('[organizationService.getInvitationByToken]', error);
      return null;
    }
  },

  /**
   * Mark invitation as accepted
   */
  async acceptInvitation(invitationId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitationId);

      if (error) throw error;
    } catch (error) {
      console.error('[organizationService.acceptInvitation]', error);
      throw error;
    }
  },
};

export default organizationService;

/**
 * Audit Log Hook
 * Provides utilities for logging user actions for compliance tracking
 */

import { useCallback } from 'react';
import { useAuth, useOrganization } from '@clerk/clerk-react';
import { useSupabase } from '@/components/SupabaseAuthProvider';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
  severity?: AuditSeverity;
}

export interface AuditLog extends AuditLogEntry {
  id: string;
  userId: string;
  organizationId?: string;
  createdAt: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export function useAuditLog() {
  const { userId, sessionId } = useAuth();
  const { organization } = useOrganization();
  const { supabase, isReady } = useSupabase();

  /**
   * Log an action to the audit trail
   */
  const logAction = useCallback(async (entry: AuditLogEntry) => {
    if (!userId || !isReady) return;

    try {
      const { error } = await supabase.from('audit_logs').insert({
        user_id: userId,
        organization_id: organization?.id,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId,
        old_values: entry.oldValues,
        new_values: entry.newValues,
        metadata: entry.metadata,
        severity: entry.severity || 'info',
        session_id: sessionId,
        user_agent: navigator.userAgent,
      });

      if (error) {
        console.error('[useAuditLog] Failed to log action:', error);
      }
    } catch (err) {
      console.error('[useAuditLog] Error:', err);
    }
  }, [userId, organization?.id, sessionId, supabase, isReady]);

  /**
   * Log a create action
   */
  const logCreate = useCallback(
    (resourceType: string, resourceId: string, newValues?: Record<string, any>) => {
      return logAction({
        action: 'create',
        resourceType,
        resourceId,
        newValues,
        severity: 'info',
      });
    },
    [logAction]
  );

  /**
   * Log an update action
   */
  const logUpdate = useCallback(
    (
      resourceType: string,
      resourceId: string,
      oldValues?: Record<string, any>,
      newValues?: Record<string, any>
    ) => {
      return logAction({
        action: 'update',
        resourceType,
        resourceId,
        oldValues,
        newValues,
        severity: 'info',
      });
    },
    [logAction]
  );

  /**
   * Log a delete action
   */
  const logDelete = useCallback(
    (resourceType: string, resourceId: string, oldValues?: Record<string, any>) => {
      return logAction({
        action: 'delete',
        resourceType,
        resourceId,
        oldValues,
        severity: 'warning',
      });
    },
    [logAction]
  );

  /**
   * Log a security-related action
   */
  const logSecurity = useCallback(
    (action: string, metadata?: Record<string, any>) => {
      return logAction({
        action,
        resourceType: 'security',
        metadata,
        severity: 'critical',
      });
    },
    [logAction]
  );

  /**
   * Fetch audit logs for the current organization
   */
  const fetchAuditLogs = useCallback(
    async (options?: {
      resourceType?: string;
      action?: string;
      limit?: number;
      offset?: number;
    }) => {
      if (!isReady || !organization?.id) return [];

      try {
        let query = supabase
          .from('audit_logs')
          .select('*')
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false });

        if (options?.resourceType) {
          query = query.eq('resource_type', options.resourceType);
        }
        if (options?.action) {
          query = query.eq('action', options.action);
        }
        if (options?.limit) {
          query = query.limit(options.limit);
        }
        if (options?.offset) {
          query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
        }

        const { data, error } = await query;

        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error('[useAuditLog] Failed to fetch logs:', err);
        return [];
      }
    },
    [supabase, organization?.id, isReady]
  );

  return {
    logAction,
    logCreate,
    logUpdate,
    logDelete,
    logSecurity,
    fetchAuditLogs,
  };
}

export default useAuditLog;

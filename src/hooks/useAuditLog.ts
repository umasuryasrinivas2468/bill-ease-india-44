import { useCallback } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditLogEntry {
  action: string;
  resource_type: string;
  resource_id?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  metadata?: Record<string, any>;
  severity?: AuditSeverity;
  organization_id?: string;
}

export interface AuditLog extends AuditLogEntry {
  id: string;
  user_id: string;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  created_at: string;
}

export function useAuditLog() {
  const { user } = useAuth();
  const { supabase, isReady } = useSupabase();

  // Log an action
  const log = useCallback(async (entry: AuditLogEntry): Promise<boolean> => {
    if (!user?.id || !isReady) {
      console.warn('[useAuditLog] Cannot log: user not authenticated');
      return false;
    }

    try {
      const logEntry = {
        user_id: user.id,
        action: entry.action,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id || null,
        old_values: entry.old_values || null,
        new_values: entry.new_values || null,
        metadata: {
          ...entry.metadata,
          timestamp: new Date().toISOString(),
          user_email: user.primaryEmailAddress?.emailAddress,
        },
        severity: entry.severity || 'info',
        organization_id: entry.organization_id || null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        session_id: sessionStorage.getItem('sessionId') || null,
      };

      const { error } = await supabase
        .from('audit_logs')
        .insert(logEntry);

      if (error) {
        console.error('[useAuditLog] Error logging:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[useAuditLog] Exception:', err);
      return false;
    }
  }, [user, isReady, supabase]);

  // Convenience methods for common actions
  const logCreate = useCallback((resourceType: string, resourceId: string, newValues: Record<string, any>, orgId?: string) => {
    return log({
      action: `${resourceType}.created`,
      resource_type: resourceType,
      resource_id: resourceId,
      new_values: newValues,
      organization_id: orgId,
    });
  }, [log]);

  const logUpdate = useCallback((
    resourceType: string, 
    resourceId: string, 
    oldValues: Record<string, any>, 
    newValues: Record<string, any>,
    orgId?: string
  ) => {
    return log({
      action: `${resourceType}.updated`,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      organization_id: orgId,
    });
  }, [log]);

  const logDelete = useCallback((resourceType: string, resourceId: string, oldValues: Record<string, any>, orgId?: string) => {
    return log({
      action: `${resourceType}.deleted`,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      severity: 'warning',
      organization_id: orgId,
    });
  }, [log]);

  const logAccess = useCallback((resourceType: string, resourceId: string, orgId?: string) => {
    return log({
      action: `${resourceType}.accessed`,
      resource_type: resourceType,
      resource_id: resourceId,
      organization_id: orgId,
    });
  }, [log]);

  const logAuth = useCallback((action: 'login' | 'logout' | 'session_refresh' | 'role_change', metadata?: Record<string, any>) => {
    return log({
      action: `auth.${action}`,
      resource_type: 'auth',
      metadata,
      severity: action === 'role_change' ? 'warning' : 'info',
    });
  }, [log]);

  const logSecurity = useCallback((action: string, metadata: Record<string, any>, severity: AuditSeverity = 'critical') => {
    return log({
      action: `security.${action}`,
      resource_type: 'security',
      metadata,
      severity,
    });
  }, [log]);

  // Fetch audit logs
  const fetchLogs = useCallback(async (options: {
    organizationId?: string;
    resourceType?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}) => {
    if (!isReady) return { data: [], error: 'Not ready' };

    try {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (options.organizationId) {
        query = query.eq('organization_id', options.organizationId);
      }
      if (options.resourceType) {
        query = query.eq('resource_type', options.resourceType);
      }
      if (options.action) {
        query = query.ilike('action', `%${options.action}%`);
      }
      if (options.startDate) {
        query = query.gte('created_at', options.startDate.toISOString());
      }
      if (options.endDate) {
        query = query.lte('created_at', options.endDate.toISOString());
      }
      if (options.limit) {
        query = query.limit(options.limit);
      }
      if (options.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      return { data: data as AuditLog[], error: null };
    } catch (err) {
      console.error('[useAuditLog] Error fetching logs:', err);
      return { 
        data: [], 
        error: err instanceof Error ? err.message : 'Failed to fetch logs' 
      };
    }
  }, [isReady, supabase]);

  return {
    log,
    logCreate,
    logUpdate,
    logDelete,
    logAccess,
    logAuth,
    logSecurity,
    fetchLogs,
  };
}

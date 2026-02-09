import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/ClerkAuthProvider';
import { useSupabase } from '@/components/SupabaseAuthProvider';
import { organizationService } from '@/services/organizationService';
import { v4 as uuidv4 } from 'uuid';

export interface SessionInfo {
  id: string;
  sessionToken: string;
  userId: string;
  organizationId: string;
  isActive: boolean;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
  deviceInfo?: {
    userAgent?: string;
    timestamp?: string;
  };
}

export interface ConcurrentUser {
  userId: string;
  sessionCount: number;
  lastActive: Date;
  isCurrentSession: boolean;
}

/**
 * Hook for managing user sessions and real-time concurrent user tracking
 * Supports multiple concurrent sessions per user
 */
export function useConcurrentUserManagement(organizationId?: string) {
  const { user } = useAuth();
  const { supabase } = useSupabase();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [concurrentUsers, setConcurrentUsers] = useState<ConcurrentUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sessionTokenRef = useRef<string | null>(null);
  const activityTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Initialize a new session for the current user
   */
  const initializeSession = useCallback(async () => {
    if (!user?.id || !organizationId) return;

    try {
      const sessionToken = uuidv4();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // 7 day session

      sessionTokenRef.current = sessionToken;

      await organizationService.trackUserSession(
        user.id,
        organizationId,
        sessionToken,
        expiresAt
      );

      // Fetch current sessions
      await fetchUserSessions();
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to initialize session:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to initialize session'
      );
    }
  }, [user?.id, organizationId]);

  /**
   * Fetch all active sessions for the current user
   */
  const fetchUserSessions = useCallback(async () => {
    if (!user?.id) return;

    try {
      const activeSessions = await organizationService.getActiveSessions(user.id);
      setSessions(activeSessions || []);
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to fetch sessions:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch sessions'
      );
    }
  }, [user?.id]);

  /**
   * Fetch concurrent users in the organization (real-time)
   */
  const fetchConcurrentUsers = useCallback(async () => {
    if (!organizationId || !supabase) return;

    try {
      setIsLoading(true);

      // Get all active sessions in the organization
      const { data: activeSessions, error } = await supabase
        .from('user_sessions')
        .select('user_id, last_activity_at')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .gt('expires_at', new Date().toISOString());

      if (error) {
        // Table might not exist - log but don't throw
        console.warn('[useConcurrentUserManagement] Session table unavailable:', error.message);
        setIsLoading(false);
        return;
      }

      // Group by user_id and count sessions
      const userMap = new Map<string, ConcurrentUser>();

      activeSessions?.forEach((session: any) => {
        const existing = userMap.get(session.user_id);
        const isCurrentSession = session.user_id === user?.id;

        if (existing) {
          existing.sessionCount++;
          existing.lastActive = new Date(session.last_activity_at);
        } else {
          userMap.set(session.user_id, {
            userId: session.user_id,
            sessionCount: 1,
            lastActive: new Date(session.last_activity_at),
            isCurrentSession,
          });
        }
      });

      setConcurrentUsers(Array.from(userMap.values()));
      setIsLoading(false);
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to fetch concurrent users:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to fetch concurrent users'
      );
      setIsLoading(false);
    }
  }, [organizationId, user?.id, supabase]);

  /**
   * Update last activity timestamp for current session
   */
  const updateActivity = useCallback(async () => {
    if (!sessionTokenRef.current || !user?.id) return;

    try {
      // Update the user_sessions table with new last_activity_at
      if (supabase) {
        await supabase
          .from('user_sessions')
          .update({
            last_activity_at: new Date().toISOString(),
          })
          .eq('session_token', sessionTokenRef.current);
      }
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to update activity:', error);
    }
  }, [user?.id, supabase]);

  /**
   * Revoke a specific session
   */
  const revokeSession = useCallback(async (sessionId: string) => {
    try {
      await organizationService.revokeSession(sessionId);
      await fetchUserSessions();
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to revoke session:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to revoke session'
      );
    }
  }, [fetchUserSessions]);

  /**
   * Revoke all other sessions (keep only current)
   */
  const revokeOtherSessions = useCallback(async () => {
    if (!sessionTokenRef.current) return;

    try {
      const sessionsToRevoke = sessions.filter(
        (s) => s.sessionToken !== sessionTokenRef.current
      );

      for (const session of sessionsToRevoke) {
        await organizationService.revokeSession(session.id);
      }

      await fetchUserSessions();
    } catch (error) {
      console.error('[useConcurrentUserManagement] Failed to revoke other sessions:', error);
      setError(
        error instanceof Error ? error.message : 'Failed to revoke other sessions'
      );
    }
  }, [sessions, fetchUserSessions]);

  /**
   * Setup activity tracking on user interaction
   */
  useEffect(() => {
    const handleUserActivity = () => {
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
      }

      activityTimerRef.current = setTimeout(() => {
        updateActivity();
      }, 5000); // Update activity every 5 seconds of inactivity
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      if (activityTimerRef.current) {
        clearTimeout(activityTimerRef.current);
      }
    };
  }, [updateActivity]);

  /**
   * Initialize session on mount
   */
  useEffect(() => {
    if (user?.id && organizationId) {
      initializeSession();
    }
  }, [user?.id, organizationId, initializeSession]);

  /**
   * Setup polling for concurrent users
   */
  useEffect(() => {
    if (!organizationId) return;

    // Fetch immediately
    fetchConcurrentUsers();

    // Poll every 10 seconds
    const interval = setInterval(fetchConcurrentUsers, 10000);

    return () => clearInterval(interval);
  }, [organizationId, fetchConcurrentUsers]);

  return {
    sessions,
    concurrentUsers,
    isLoading,
    error,
    initializeSession,
    fetchUserSessions,
    fetchConcurrentUsers,
    updateActivity,
    revokeSession,
    revokeOtherSessions,
  };
}

/**
 * Hook for monitoring user idle time and session expiry
 */
export function useSessionExpiry(organizationId?: string) {
  const { user } = useAuth();
  const [isExpiring, setIsExpiring] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  const WARNING_TIME = 5 * 60 * 1000; // Show warning 5 minutes before expiry

  /**
   * Reset idle timer
   */
  const resetIdleTimer = useCallback(() => {
    // Clear existing timers
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

    // Set warning timer
    warningTimerRef.current = setTimeout(() => {
      setIsExpiring(true);
      setTimeRemaining(WARNING_TIME / 1000); // seconds
    }, IDLE_TIMEOUT - WARNING_TIME);

    // Set expiry timer
    idleTimerRef.current = setTimeout(() => {
      setIsExpiring(false);
      setTimeRemaining(null);
      // Re-authenticate or redirect to login
      window.location.href = '/login';
    }, IDLE_TIMEOUT);
  }, []);

  /**
   * Extend session
   */
  const extendSession = useCallback(() => {
    setIsExpiring(false);
    setTimeRemaining(null);
    resetIdleTimer();
  }, [resetIdleTimer]);

  /**
   * Setup activity listeners
   */
  useEffect(() => {
    if (!user?.id || !organizationId) return;

    const handleActivity = () => {
      resetIdleTimer();
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('click', handleActivity);

    // Initialize timer
    resetIdleTimer();

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    };
  }, [user?.id, organizationId, resetIdleTimer]);

  /**
   * Update countdown timer
   */
  useEffect(() => {
    if (!isExpiring || !timeRemaining) return;

    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 1) {
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isExpiring, timeRemaining]);

  return {
    isExpiring,
    timeRemaining,
    extendSession,
  };
}

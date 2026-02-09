/**
 * Organization Service
 * Handles organization-related operations with Supabase
 * Note: Organization management is done via Clerk, this service
 * handles supplementary data like sessions and CA assignments
 */

import { supabase } from '@/lib/supabaseClient';

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

/**
 * Track user session for concurrent user management
 */
export async function trackUserSession(
  userId: string,
  organizationId: string,
  sessionToken: string,
  expiresAt: Date
): Promise<void> {
  // Check if user_sessions table exists before attempting to insert
  try {
    const { error } = await supabase.from('user_sessions').insert({
      user_id: userId,
      organization_id: organizationId,
      session_token: sessionToken,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      last_activity_at: new Date().toISOString(),
      device_info: {
        userAgent: navigator.userAgent,
        timestamp: new Date().toISOString(),
      },
    });

    if (error) {
      // Table might not exist - log but don't throw
      console.warn('[organizationService] Session tracking unavailable:', error.message);
    }
  } catch (err) {
    console.warn('[organizationService] Session tracking error:', err);
  }
}

/**
 * Get active sessions for a user
 */
export async function getActiveSessions(userId: string): Promise<SessionInfo[]> {
  try {
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.warn('[organizationService] Get sessions error:', error.message);
      return [];
    }

    return (data || []).map((session: any) => ({
      id: session.id,
      sessionToken: session.session_token,
      userId: session.user_id,
      organizationId: session.organization_id,
      isActive: session.is_active,
      createdAt: session.created_at,
      lastActivityAt: session.last_activity_at,
      expiresAt: session.expires_at,
      deviceInfo: session.device_info,
    }));
  } catch (err) {
    console.warn('[organizationService] Get sessions error:', err);
    return [];
  }
}

/**
 * Revoke a specific session
 */
export async function revokeSession(sessionId: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_sessions')
      .update({ is_active: false })
      .eq('id', sessionId);

    if (error) {
      console.warn('[organizationService] Revoke session error:', error.message);
    }
  } catch (err) {
    console.warn('[organizationService] Revoke session error:', err);
  }
}

// Export as a service object for compatibility
export const organizationService = {
  trackUserSession,
  getActiveSessions,
  revokeSession,
};

export default organizationService;

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';

/**
 * RBAC client helpers — Brief item #14.
 *
 * Backed by the SQL view `v_user_permissions` (migration 20260507000004).
 * Tenant owner (tenant_id = member_user_id) implicitly has all permissions
 * via the `user_has_permission` SQL helper, so no explicit assignment is
 * needed for the account owner.
 *
 * Common permission keys (see seed_default_roles in the migration):
 *   bill.create / bill.update / bill.post / bill.void / bill.approve
 *   payment.create / payment.update / payment.void / payment.approve
 *   expense.create / expense.update / expense.post / expense.approve
 *   vendor.create / vendor.update
 *   journal.post / journal.reverse
 *   period.lock / period.unlock
 *   report.view / dashboard.view
 *   '*' — wildcard, granted to admin role
 */

let cache: { tenantId: string; memberId: string; perms: Set<string>; expiresAt: number } | null = null;
const TTL_MS = 60_000; // 1 minute — permissions change rarely; this avoids per-action round-trips

export const fetchPermissions = async (tenantId: string, memberId?: string): Promise<Set<string>> => {
  const tenant = normalizeUserId(tenantId);
  const member = normalizeUserId(memberId || tenantId);

  // Tenant owner has all permissions.
  if (tenant === member) {
    return new Set(['*']);
  }

  if (cache && cache.tenantId === tenant && cache.memberId === member && cache.expiresAt > Date.now()) {
    return cache.perms;
  }

  const { data } = await supabase
    .from('v_user_permissions' as any)
    .select('permissions')
    .eq('tenant_id', tenant)
    .eq('member_user_id', member)
    .maybeSingle();

  const perms = new Set<string>(((data?.permissions as string[]) || []));
  cache = { tenantId: tenant, memberId: member, perms, expiresAt: Date.now() + TTL_MS };
  return perms;
};

export const hasPermission = async (
  tenantId: string,
  memberId: string | undefined,
  perm: string
): Promise<boolean> => {
  const perms = await fetchPermissions(tenantId, memberId);
  return perms.has('*') || perms.has(perm);
};

export const requirePermission = async (
  tenantId: string,
  memberId: string | undefined,
  perm: string
): Promise<void> => {
  const ok = await hasPermission(tenantId, memberId, perm);
  if (!ok) throw new Error(`Permission denied: ${perm}`);
};

export const invalidatePermissionsCache = () => { cache = null; };

/** Seed the default 4 roles (admin / finance / staff / viewer) for a user. */
export const seedDefaultRoles = async (userId: string) => {
  const { error } = await supabase.rpc('seed_default_roles', { p_user_id: normalizeUserId(userId) });
  if (error) throw error;
};

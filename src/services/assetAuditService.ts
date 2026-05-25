// ════════════════════════════════════════════════════════════════════════════
// Asset Verification & Audit Service (Module 5)
//
// startSession:  creates a session, seeds 'pending' findings for every in-scope
//                asset (filtered by scope_branch / department / cost_center).
//                Snapshots each asset's expected location/branch/custodian.
//
// recordFinding: updates a finding with what was actually found. Recomputes
//                the session rollup counters.
//
// closeSession:  flips session to 'closed', stamps closed_on.
//
// No journal posting — verification is metadata only. If a finding leads to
// a write-off / transfer, that's posted via the existing modules.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import { disposeFixedAsset } from '@/services/assetDisposalService';
import type {
  AssetAuditFinding,
  AssetAuditFindingEnriched,
  AssetAuditSession,
  AuditMismatchReport,
  CreateAuditSessionInput,
  RecordFindingInput,
} from '@/types/assetAudit';

const nextSessionCode = async (userId: string): Promise<string> => {
  const uid = normalizeUserId(userId);
  const year = new Date().getFullYear();
  const { data } = await supabase
    .from('asset_audit_sessions')
    .select('session_code')
    .eq('user_id', uid)
    .like('session_code', `AUD/${year}/%`)
    .order('session_code', { ascending: false })
    .limit(1);
  let seq = 1;
  if (data && data.length > 0) {
    const m = (data[0] as any).session_code.match(/AUD\/\d+\/(\d+)/);
    if (m) seq = parseInt(m[1]) + 1;
  }
  return `AUD/${year}/${String(seq).padStart(3, '0')}`;
};

// ── Reads ───────────────────────────────────────────────────────────────────
export const listAuditSessions = async (userId: string): Promise<AssetAuditSession[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_audit_sessions')
    .select('*')
    .eq('user_id', uid)
    .order('scheduled_on', { ascending: false });
  if (error) throw error;
  return (data || []) as AssetAuditSession[];
};

export const getAuditSession = async (
  userId: string,
  id: string,
): Promise<AssetAuditSession | null> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_audit_sessions')
    .select('*')
    .eq('user_id', uid)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetAuditSession) || null;
};

export const listAuditFindings = async (
  userId: string,
  sessionId: string,
): Promise<AssetAuditFindingEnriched[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_asset_audit_findings_enriched')
    .select('*')
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .order('asset_code');
  if (error) throw error;
  return (data || []) as AssetAuditFindingEnriched[];
};

// ── Start session: insert + seed findings ───────────────────────────────────
export interface StartAuditSessionResult {
  session: AssetAuditSession;
  findings_seeded: number;
}

export const startAuditSession = async (
  userId: string,
  input: CreateAuditSessionInput,
): Promise<StartAuditSessionResult> => {
  const uid = normalizeUserId(userId);
  const sessionCode = input.session_code || (await nextSessionCode(uid));

  // Resolve in-scope assets (active + transferred only — disposed assets aren't audited)
  let q = supabase
    .from('fixed_assets')
    .select('id, location, branch_id, custodian, cost_center_id, department, status')
    .eq('user_id', uid)
    .in('status', ['active', 'transferred']);
  if (input.scope_branch_id) q = q.eq('branch_id', input.scope_branch_id);
  if (input.scope_department) q = q.eq('department', input.scope_department);
  if (input.scope_cost_center_id) q = q.eq('cost_center_id', input.scope_cost_center_id);
  const { data: assets, error: assetErr } = await q;
  if (assetErr) throw assetErr;

  const inScope = (assets || []) as Array<{
    id: string;
    location: string | null;
    branch_id: string | null;
    custodian: string | null;
    cost_center_id: string | null;
  }>;

  // Create session
  const sessionPayload = {
    user_id: uid,
    session_code: sessionCode,
    title: input.title,
    description: input.description || null,
    scope_branch_id: input.scope_branch_id || null,
    scope_department: input.scope_department || null,
    scope_cost_center_id: input.scope_cost_center_id || null,
    scheduled_on: input.scheduled_on,
    started_on: input.scheduled_on,
    next_audit_due: input.next_audit_due || null,
    status: 'in_progress' as const,
    auditor_name: input.auditor_name || null,
    auditor_contact: input.auditor_contact || null,
    assets_in_scope: inScope.length,
    notes: input.notes || null,
    created_by: uid,
  };

  const { data: sessionRow, error: sErr } = await supabase
    .from('asset_audit_sessions')
    .insert(sessionPayload)
    .select('*')
    .single();
  if (sErr) throw sErr;
  const session = sessionRow as AssetAuditSession;

  // Seed pending findings (snapshot expected values)
  if (inScope.length > 0) {
    const findings = inScope.map((a) => ({
      user_id: uid,
      session_id: session.id,
      asset_id: a.id,
      status: 'pending' as const,
      expected_location: a.location,
      expected_branch_id: a.branch_id,
      expected_custodian: a.custodian,
    }));
    const { error: fErr } = await supabase.from('asset_audit_findings').insert(findings);
    if (fErr) throw fErr;
  }

  return { session, findings_seeded: inScope.length };
};

// ── Record a finding ────────────────────────────────────────────────────────
export const recordFinding = async (
  userId: string,
  input: RecordFindingInput,
): Promise<AssetAuditFinding> => {
  const uid = normalizeUserId(userId);

  // Compare expected vs. found to detect mismatch
  const { data: existing } = await supabase
    .from('asset_audit_findings')
    .select('*')
    .eq('user_id', uid)
    .eq('id', input.finding_id)
    .maybeSingle();
  if (!existing) throw new Error('Finding not found.');

  const today = new Date().toISOString().slice(0, 10);
  const ex = existing as AssetAuditFinding;

  // If caller passed 'verified' but found values differ from expected,
  // auto-promote to 'mismatch'.
  let finalStatus = input.status;
  if (finalStatus === 'verified') {
    const locDiff = input.found_location !== undefined && input.found_location !== ex.expected_location;
    const branchDiff = input.found_branch_id !== undefined && input.found_branch_id !== ex.expected_branch_id;
    const custodianDiff =
      input.found_custodian !== undefined && input.found_custodian !== ex.expected_custodian;
    if (locDiff || branchDiff || custodianDiff) finalStatus = 'mismatch';
  }

  const { data, error } = await supabase
    .from('asset_audit_findings')
    .update({
      status: finalStatus,
      verified_on: today,
      verified_by: uid,
      verification_method: input.verification_method || ex.verification_method || 'physical',
      found_location: input.found_location ?? ex.found_location,
      found_branch_id: input.found_branch_id ?? ex.found_branch_id,
      found_custodian: input.found_custodian ?? ex.found_custodian,
      condition_observed: input.condition_observed ?? ex.condition_observed,
      remarks: input.remarks ?? ex.remarks,
      photo_url: input.photo_url ?? ex.photo_url,
    })
    .eq('user_id', uid)
    .eq('id', input.finding_id)
    .select('*')
    .single();
  if (error) throw error;

  // Recompute session counters
  await refreshSessionCounters(uid, ex.session_id);

  return data as AssetAuditFinding;
};

const refreshSessionCounters = async (userId: string, sessionId: string): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_audit_findings')
    .select('status')
    .eq('user_id', uid)
    .eq('session_id', sessionId);
  if (error) throw error;
  const counts = { verified: 0, missing: 0, mismatched: 0 };
  for (const row of (data || []) as { status: string }[]) {
    if (row.status === 'verified') counts.verified++;
    else if (row.status === 'missing') counts.missing++;
    else if (row.status === 'mismatch' || row.status === 'damaged' || row.status === 'disposed_offsite') {
      counts.mismatched++;
    }
  }
  await supabase
    .from('asset_audit_sessions')
    .update({
      assets_verified: counts.verified,
      assets_missing: counts.missing,
      assets_mismatched: counts.mismatched,
    })
    .eq('user_id', uid)
    .eq('id', sessionId);
};

// ── Close session ───────────────────────────────────────────────────────────
export const closeAuditSession = async (
  userId: string,
  sessionId: string,
): Promise<AssetAuditSession> => {
  const uid = normalizeUserId(userId);
  const today = new Date().toISOString().slice(0, 10);

  // Any still-pending findings become 'missing' on close.
  await supabase
    .from('asset_audit_findings')
    .update({ status: 'missing', verified_on: today, verified_by: uid })
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .eq('status', 'pending');

  await refreshSessionCounters(uid, sessionId);

  const { data, error } = await supabase
    .from('asset_audit_sessions')
    .update({ status: 'closed', closed_on: today })
    .eq('user_id', uid)
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetAuditSession;
};

export const cancelAuditSession = async (
  userId: string,
  sessionId: string,
): Promise<AssetAuditSession> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_audit_sessions')
    .update({ status: 'cancelled' })
    .eq('user_id', uid)
    .eq('id', sessionId)
    .select('*')
    .single();
  if (error) throw error;
  return data as AssetAuditSession;
};

// ── Mismatch report (missing + mismatch + damaged) ─────────────────────────
export const getMismatchReport = async (
  userId: string,
  sessionId: string,
): Promise<AuditMismatchReport> => {
  const uid = normalizeUserId(userId);
  const session = await getAuditSession(uid, sessionId);
  if (!session) throw new Error('Session not found.');
  const { data, error } = await supabase
    .from('v_asset_audit_findings_enriched')
    .select('*')
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .in('status', ['missing', 'mismatch', 'damaged'])
    .order('status');
  if (error) throw error;
  return { session, findings: (data || []) as AssetAuditFindingEnriched[] };
};

// ════════════════════════════════════════════════════════════════════════════
// Resolution: write off a 'missing' finding.
//
// Posts the standard asset write-off journal (Dr Accum Dep + Dr Loss
// on Asset Sale / Cr Fixed Asset) via disposeFixedAsset(write_off:true),
// then stamps the finding with the resulting journal id so the audit page
// shows the resolution. Idempotent on the asset id (the disposal helper
// refuses a second write-off on the same asset).
// ════════════════════════════════════════════════════════════════════════════

export interface WriteOffFindingResult {
  finding: AssetAuditFinding;
  journalId: string;
  amount: number;        // NBV written off
}

export const writeOffMissingFinding = async (
  userId: string,
  findingId: string,
  options?: { reason?: string; write_off_date?: string },
): Promise<WriteOffFindingResult> => {
  const uid = normalizeUserId(userId);
  const today = options?.write_off_date || new Date().toISOString().slice(0, 10);

  // Load the finding + its session for narration context
  const { data: findingRow, error: fErr } = await supabase
    .from('asset_audit_findings')
    .select('*')
    .eq('user_id', uid)
    .eq('id', findingId)
    .maybeSingle();
  if (fErr) throw fErr;
  if (!findingRow) throw new Error('Finding not found.');
  const finding = findingRow as AssetAuditFinding;

  if (finding.status !== 'missing') {
    throw new Error(`Only 'missing' findings can be written off (this one is '${finding.status}').`);
  }
  if (finding.resolution_action === 'written_off' && finding.resolution_ref_id) {
    throw new Error('This finding has already been written off.');
  }

  // Resolve session for a richer narration
  const { data: sessionRow } = await supabase
    .from('asset_audit_sessions')
    .select('session_code, title')
    .eq('user_id', uid)
    .eq('id', finding.session_id)
    .maybeSingle();
  const sessionCode = (sessionRow as any)?.session_code || '—';

  // Snapshot NBV before disposal for the result
  const { data: assetRow } = await supabase
    .from('fixed_assets')
    .select('book_value, status')
    .eq('user_id', uid)
    .eq('id', finding.asset_id)
    .maybeSingle();
  const nbv = Number((assetRow as any)?.book_value || 0);

  const disposal = await disposeFixedAsset(uid, {
    asset_id: finding.asset_id,
    disposal_date: today,
    sale_proceeds: 0,
    write_off: true,
    disposal_type: 'write_off',
    reason: options?.reason || `Audit verification: asset not located in session ${sessionCode}`,
  });

  // Stamp the finding with the resolution journal id
  const { data: stamped, error: sErr } = await supabase
    .from('asset_audit_findings')
    .update({
      resolution_action: 'written_off',
      resolution_ref_id: disposal.journalId,
    })
    .eq('user_id', uid)
    .eq('id', findingId)
    .select('*')
    .single();
  if (sErr) throw sErr;

  return {
    finding: stamped as AssetAuditFinding,
    journalId: disposal.journalId,
    amount: nbv,
  };
};

// Bulk: write off every still-unresolved 'missing' finding in a session.
export interface BulkWriteOffResult {
  written_off: number;
  total_nbv: number;
  errors: Array<{ finding_id: string; asset_id: string; message: string }>;
}

export const writeOffAllMissingInSession = async (
  userId: string,
  sessionId: string,
  options?: { write_off_date?: string },
): Promise<BulkWriteOffResult> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('asset_audit_findings')
    .select('id, asset_id, resolution_action')
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .eq('status', 'missing');
  if (error) throw error;

  const targets = (data || []).filter(
    (r: any) => r.resolution_action !== 'written_off',
  ) as Array<{ id: string; asset_id: string }>;

  let written = 0;
  let total = 0;
  const errors: BulkWriteOffResult['errors'] = [];

  for (const t of targets) {
    try {
      const res = await writeOffMissingFinding(uid, t.id, options);
      written += 1;
      total += res.amount;
    } catch (e) {
      errors.push({
        finding_id: t.id,
        asset_id: t.asset_id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { written_off: written, total_nbv: total, errors };
};

// ── QR-scan helper: find a finding by asset_code (or asset id) within a session
export const findFindingByAssetCode = async (
  userId: string,
  sessionId: string,
  needle: string,
): Promise<AssetAuditFindingEnriched | null> => {
  const uid = normalizeUserId(userId);
  const trimmed = needle.trim();
  const { data, error } = await supabase
    .from('v_asset_audit_findings_enriched')
    .select('*')
    .eq('user_id', uid)
    .eq('session_id', sessionId)
    .or(`asset_code.ilike.${trimmed},asset_id.eq.${trimmed}`)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetAuditFindingEnriched) || null;
};

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listAuditSessions,
  getAuditSession,
  listAuditFindings,
  startAuditSession,
  recordFinding,
  closeAuditSession,
  cancelAuditSession,
  getMismatchReport,
  findFindingByAssetCode,
  writeOffMissingFinding,
  writeOffAllMissingInSession,
} from '@/services/assetAuditService';
import type {
  CreateAuditSessionInput,
  RecordFindingInput,
} from '@/types/assetAudit';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const inr = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(n) || 0);

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['audit-sessions'] });
  qc.invalidateQueries({ queryKey: ['audit-session'] });
  qc.invalidateQueries({ queryKey: ['audit-findings'] });
  qc.invalidateQueries({ queryKey: ['audit-mismatch'] });
  // Write-offs touch the asset register + ledger
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
};

export const useAuditSessions = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['audit-sessions', uid],
    queryFn: () => listAuditSessions(uid!),
    enabled,
  });
};

export const useAuditSession = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['audit-session', uid, id],
    queryFn: () => getAuditSession(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useAuditFindings = (sessionId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['audit-findings', uid, sessionId],
    queryFn: () => listAuditFindings(uid!, sessionId!),
    enabled: enabled && !!sessionId,
  });
};

export const useMismatchReport = (sessionId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['audit-mismatch', uid, sessionId],
    queryFn: () => getMismatchReport(uid!, sessionId!),
    enabled: enabled && !!sessionId,
  });
};

export const useStartAuditSession = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateAuditSessionInput) => startAuditSession(uid!, input),
    onSuccess: (res) => {
      toast({
        title: 'Audit session started',
        description: `${res.findings_seeded} asset${res.findings_seeded === 1 ? '' : 's'} pending verification`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRecordFinding = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: RecordFindingInput) => recordFinding(uid!, input),
    onSuccess: (f) => {
      const label =
        f.status === 'verified' ? 'Verified' :
        f.status === 'mismatch' ? 'Mismatch logged' :
        f.status === 'missing' ? 'Marked missing' :
        f.status === 'damaged' ? 'Damaged recorded' :
        'Finding updated';
      toast({ title: label });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCloseAuditSession = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => closeAuditSession(uid!, id),
    onSuccess: () => { toast({ title: 'Session closed' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCancelAuditSession = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => cancelAuditSession(uid!, id),
    onSuccess: () => { toast({ title: 'Session cancelled' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useFindFindingByAssetCode = () => {
  const { uid } = useUid();
  return useMutation({
    mutationFn: (args: { sessionId: string; code: string }) =>
      findFindingByAssetCode(uid!, args.sessionId, args.code),
  });
};

export const useWriteOffMissingFinding = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { findingId: string; reason?: string; write_off_date?: string }) =>
      writeOffMissingFinding(uid!, args.findingId, {
        reason: args.reason,
        write_off_date: args.write_off_date,
      }),
    onSuccess: (res) => {
      toast({
        title: 'Asset written off',
        description: `Write-off journal posted — ${inr(res.amount)} removed from books`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Write-off failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useWriteOffAllMissingInSession = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { sessionId: string; write_off_date?: string }) =>
      writeOffAllMissingInSession(uid!, args.sessionId, { write_off_date: args.write_off_date }),
    onSuccess: (res) => {
      const noun = res.written_off === 1 ? 'asset' : 'assets';
      const tone = res.errors.length === 0 ? 'default' : ('destructive' as const);
      toast({
        title: `${res.written_off} ${noun} written off`,
        description:
          res.errors.length === 0
            ? `Total NBV removed: ${inr(res.total_nbv)}`
            : `${inr(res.total_nbv)} written off — ${res.errors.length} failed: ${res.errors[0]?.message || 'see console'}`,
        variant: tone,
      });
      if (res.errors.length > 0) console.warn('writeOffAllMissingInSession errors:', res.errors);
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Bulk write-off failed', description: e?.message, variant: 'destructive' }),
  });
};

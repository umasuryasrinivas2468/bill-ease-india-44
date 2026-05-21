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

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['audit-sessions'] });
  qc.invalidateQueries({ queryKey: ['audit-session'] });
  qc.invalidateQueries({ queryKey: ['audit-findings'] });
  qc.invalidateQueries({ queryKey: ['audit-mismatch'] });
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

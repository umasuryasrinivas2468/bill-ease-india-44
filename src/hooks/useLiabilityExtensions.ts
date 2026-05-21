import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listClassifications,
  getClassificationRollup,
  updateLiabilityClassification,
  listInterestAccruals,
  accrueInterestForLiability,
  accrueAllActiveLiabilitiesMonthEnd,
  forecastUpcomingEmis,
  buildForecastSummary,
  listCovenants,
  getCovenant,
  listCovenantChecks,
  createCovenant,
  updateCovenant,
  recordCovenantCheck,
  listCovenantDeadlineAlerts,
  getNetWorthSnapshot,
} from '@/services/liabilityExtensionsService';
import type {
  AccrueInterestInput,
  CreateCovenantInput,
  LiabilityCovenant,
  RecordCovenantCheckInput,
} from '@/types/liabilityExtensions';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['liability-classifications'] });
  qc.invalidateQueries({ queryKey: ['classification-rollup'] });
  qc.invalidateQueries({ queryKey: ['interest-accruals'] });
  qc.invalidateQueries({ queryKey: ['liability-forecast'] });
  qc.invalidateQueries({ queryKey: ['covenants'] });
  qc.invalidateQueries({ queryKey: ['covenant'] });
  qc.invalidateQueries({ queryKey: ['covenant-checks'] });
  qc.invalidateQueries({ queryKey: ['covenant-alerts'] });
  qc.invalidateQueries({ queryKey: ['net-worth'] });
  qc.invalidateQueries({ queryKey: ['liabilities'] });
  qc.invalidateQueries({ queryKey: ['liability'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

// ── Classification ──────────────────────────────────────────────────────────
export const useClassifications = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['liability-classifications', uid],
    queryFn: () => listClassifications(uid!),
    enabled,
  });
};

export const useClassificationRollup = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['classification-rollup', uid],
    queryFn: () => getClassificationRollup(uid!),
    enabled,
  });
};

export const useUpdateClassification = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: {
      liabilityId: string;
      patch: {
        is_secured?: boolean;
        is_statutory?: boolean;
        collateral_description?: string;
        collateral_value?: number;
        classification_override?: 'current' | 'non_current' | null;
      };
    }) => updateLiabilityClassification(uid!, args.liabilityId, args.patch),
    onSuccess: () => { toast({ title: 'Classification updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

// ── Accruals ────────────────────────────────────────────────────────────────
export const useInterestAccruals = (liabilityId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['interest-accruals', uid, liabilityId || 'all'],
    queryFn: () => listInterestAccruals(uid!, liabilityId),
    enabled,
  });
};

export const useAccrueInterest = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: AccrueInterestInput) => accrueInterestForLiability(uid!, input),
    onSuccess: (r) => {
      toast({
        title: 'Interest accrued',
        description: `₹${r.accrual.accrued_amount.toLocaleString('en-IN')} • ${r.journalId ? 'Journal posted' : 'Planned only'}`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Accrual failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useAccrueAllMonthEnd = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (asOfDate?: string) => accrueAllActiveLiabilitiesMonthEnd(uid!, asOfDate),
    onSuccess: (r) => {
      toast({
        title: 'Month-end accrual run',
        description: `${r.accrued} accrued${r.errors.length > 0 ? ` • ${r.errors.length} errors` : ''}`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Bulk accrue failed', description: e?.message, variant: 'destructive' }),
  });
};

// ── Forecast ────────────────────────────────────────────────────────────────
export const useUpcomingEmis = (withinDays = 90) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['liability-forecast', 'emis', uid, withinDays],
    queryFn: () => forecastUpcomingEmis(uid!, withinDays),
    enabled,
  });
};

export const useForecastSummary = (horizonDays = 90, liquidityThreshold?: number) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['liability-forecast', 'summary', uid, horizonDays, liquidityThreshold || 0],
    queryFn: () => buildForecastSummary(uid!, horizonDays, liquidityThreshold),
    enabled,
  });
};

// ── Covenants ───────────────────────────────────────────────────────────────
export const useCovenants = (liabilityId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['covenants', uid, liabilityId || 'all'],
    queryFn: () => listCovenants(uid!, liabilityId),
    enabled,
  });
};

export const useCovenant = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['covenant', uid, id],
    queryFn: () => getCovenant(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCovenantChecks = (covenantId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['covenant-checks', uid, covenantId],
    queryFn: () => listCovenantChecks(uid!, covenantId!),
    enabled: enabled && !!covenantId,
  });
};

export const useCreateCovenant = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateCovenantInput) => createCovenant(uid!, input),
    onSuccess: () => { toast({ title: 'Covenant added' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useUpdateCovenant = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<LiabilityCovenant> }) =>
      updateCovenant(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Covenant updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRecordCovenantCheck = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: RecordCovenantCheckInput) => recordCovenantCheck(uid!, input),
    onSuccess: (r) => {
      toast({
        title: r.status === 'breached' ? 'Covenant breached' : 'Check recorded',
        description: `Status: ${r.status}`,
        variant: r.status === 'breached' ? 'destructive' : 'default',
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCovenantAlerts = (withinDays = 30) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['covenant-alerts', uid, withinDays],
    queryFn: () => listCovenantDeadlineAlerts(uid!, withinDays),
    enabled,
  });
};

// ── Net worth ───────────────────────────────────────────────────────────────
export const useNetWorthSnapshot = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['net-worth', uid],
    queryFn: () => getNetWorthSnapshot(uid!),
    enabled,
  });
};

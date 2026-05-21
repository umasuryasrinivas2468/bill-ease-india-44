import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listWarranties,
  createWarranty,
  updateWarranty,
  deactivateWarranty,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  markPolicyPremiumPaid,
  listClaims,
  createClaim,
  updateClaim,
  settleClaim,
  getCoverageSummary,
  listCoverageSummaries,
  listWarrantyExpiryAlerts,
  listPolicyExpiryAlerts,
} from '@/services/assetCoverageService';
import type {
  AssetInsuranceClaim,
  AssetInsurancePolicy,
  AssetWarranty,
  CreateInsuranceClaimInput,
  CreateInsurancePolicyInput,
  CreateWarrantyInput,
  SettleClaimInput,
} from '@/types/assetCoverage';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['warranties'] });
  qc.invalidateQueries({ queryKey: ['policies'] });
  qc.invalidateQueries({ queryKey: ['policy'] });
  qc.invalidateQueries({ queryKey: ['claims'] });
  qc.invalidateQueries({ queryKey: ['coverage-summary'] });
  qc.invalidateQueries({ queryKey: ['coverage-summaries'] });
  qc.invalidateQueries({ queryKey: ['warranty-expiring'] });
  qc.invalidateQueries({ queryKey: ['policy-expiring'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

// ── Warranties ──────────────────────────────────────────────────────────────
export const useWarranties = (assetId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['warranties', uid, assetId || 'all'],
    queryFn: () => listWarranties(uid!, assetId),
    enabled,
  });
};

export const useCreateWarranty = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateWarrantyInput) => createWarranty(uid!, input),
    onSuccess: () => { toast({ title: 'Warranty added' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useUpdateWarranty = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<AssetWarranty> }) =>
      updateWarranty(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Warranty updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useDeactivateWarranty = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => deactivateWarranty(uid!, id),
    onSuccess: () => { toast({ title: 'Warranty deactivated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

// ── Policies ────────────────────────────────────────────────────────────────
export const usePolicies = (assetId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['policies', uid, assetId || 'all'],
    queryFn: () => listPolicies(uid!, assetId),
    enabled,
  });
};

export const usePolicy = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['policy', uid, id],
    queryFn: () => getPolicy(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCreatePolicy = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateInsurancePolicyInput) => createPolicy(uid!, input),
    onSuccess: (res) => {
      toast({
        title: 'Policy saved',
        description: res.journalId ? 'Premium journal posted' : 'Stored without journal',
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useUpdatePolicy = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<AssetInsurancePolicy> }) =>
      updatePolicy(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Policy updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useMarkPremiumPaid = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; paidOn: string; paymentMode?: 'cash' | 'bank' | 'credit' }) =>
      markPolicyPremiumPaid(uid!, args.id, args.paidOn, args.paymentMode),
    onSuccess: () => { toast({ title: 'Premium marked paid', description: 'Journal posted' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

// ── Claims ──────────────────────────────────────────────────────────────────
export const useClaims = (assetId?: string, policyId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['claims', uid, assetId || 'all', policyId || 'all'],
    queryFn: () => listClaims(uid!, assetId, policyId),
    enabled,
  });
};

export const useCreateClaim = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateInsuranceClaimInput) => createClaim(uid!, input),
    onSuccess: () => { toast({ title: 'Claim filed' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useUpdateClaim = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<AssetInsuranceClaim> }) =>
      updateClaim(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Claim updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useSettleClaim = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: SettleClaimInput) => settleClaim(uid!, input),
    onSuccess: () => { toast({ title: 'Claim settled', description: 'Recovery journal posted' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

// ── Aggregates / alerts ─────────────────────────────────────────────────────
export const useCoverageSummary = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['coverage-summary', uid, assetId],
    queryFn: () => getCoverageSummary(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

export const useCoverageSummaries = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['coverage-summaries', uid],
    queryFn: () => listCoverageSummaries(uid!),
    enabled,
  });
};

export const useWarrantyExpiryAlerts = (withinDays = 60) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['warranty-expiring', uid, withinDays],
    queryFn: () => listWarrantyExpiryAlerts(uid!, withinDays),
    enabled,
  });
};

export const usePolicyExpiryAlerts = (withinDays = 45) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['policy-expiring', uid, withinDays],
    queryFn: () => listPolicyExpiryAlerts(uid!, withinDays),
    enabled,
  });
};

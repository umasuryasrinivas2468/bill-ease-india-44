import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listCwipProjects,
  getCwipProject,
  listCwipCosts,
  createCwipProject,
  updateCwipProject,
  addCwipCost,
  capitalizeCwip,
  cancelCwipProject,
} from '@/services/cwipService';
import type {
  AddCwipCostInput,
  CapitalizeCwipInput,
  CreateCwipProjectInput,
  CwipProject,
} from '@/types/cwip';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['cwip-projects'] });
  qc.invalidateQueries({ queryKey: ['cwip-project'] });
  qc.invalidateQueries({ queryKey: ['cwip-costs'] });
  qc.invalidateQueries({ queryKey: ['fixed-assets'] });
  qc.invalidateQueries({ queryKey: ['fixed-asset'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

export const useCwipProjects = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['cwip-projects', uid],
    queryFn: () => listCwipProjects(uid!),
    enabled,
  });
};

export const useCwipProject = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['cwip-project', uid, id],
    queryFn: () => getCwipProject(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCwipCosts = (cwipId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['cwip-costs', uid, cwipId],
    queryFn: () => listCwipCosts(uid!, cwipId!),
    enabled: enabled && !!cwipId,
  });
};

export const useCreateCwipProject = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateCwipProjectInput) => createCwipProject(uid!, input),
    onSuccess: (p) => { toast({ title: 'CWIP project created', description: p.cwip_code }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useUpdateCwipProject = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<CwipProject> }) =>
      updateCwipProject(uid!, args.id, args.patch),
    onSuccess: () => { toast({ title: 'Updated' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Update failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useAddCwipCost = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: AddCwipCostInput) => addCwipCost(uid!, input),
    onSuccess: (r) => {
      toast({
        title: 'Cost added',
        description: r.journalId ? `${r.cost.cost_type} • Journal posted` : `${r.cost.cost_type} • No journal`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCapitalizeCwip = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CapitalizeCwipInput) => capitalizeCwip(uid!, input),
    onSuccess: (r) => {
      toast({
        title: 'CWIP capitalized',
        description: `${r.asset.asset_code} • ${r.costsCapitalized} cost row${r.costsCapitalized === 1 ? '' : 's'} • ₹${r.amount.toLocaleString('en-IN')}`,
      });
      invalidate(qc);
    },
    onError: (e: any) => toast({ title: 'Capitalization failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useCancelCwipProject = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; reason: string }) => cancelCwipProject(uid!, args.id, args.reason),
    onSuccess: () => { toast({ title: 'Project cancelled' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Cancel failed', description: e?.message, variant: 'destructive' }),
  });
};

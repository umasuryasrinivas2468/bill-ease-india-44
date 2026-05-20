import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listMaintenanceSchedules,
  getMaintenanceSchedule,
  createMaintenanceSchedule,
  updateMaintenanceSchedule,
  deactivateMaintenanceSchedule,
  listMaintenanceRecords,
  getMaintenanceRecord,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  getMaintenanceSummaryForAsset,
  listAllMaintenanceSummaries,
  listDueMaintenanceAlerts,
  listAmcExpiringAlerts,
} from '@/services/assetMaintenanceService';
import type {
  AssetMaintenanceRecord,
  AssetMaintenanceSchedule,
  CreateMaintenanceRecordInput,
  CreateMaintenanceScheduleInput,
} from '@/types/assetMaintenance';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['maintenance-schedules'] });
  qc.invalidateQueries({ queryKey: ['maintenance-schedule'] });
  qc.invalidateQueries({ queryKey: ['maintenance-records'] });
  qc.invalidateQueries({ queryKey: ['maintenance-record'] });
  qc.invalidateQueries({ queryKey: ['maintenance-summary'] });
  qc.invalidateQueries({ queryKey: ['maintenance-summaries'] });
  qc.invalidateQueries({ queryKey: ['maintenance-due'] });
  qc.invalidateQueries({ queryKey: ['amc-expiring'] });
  qc.invalidateQueries({ queryKey: ['asset-transactions'] });
  qc.invalidateQueries({ queryKey: ['journals-with-lines'] });
};

// ── Schedules ───────────────────────────────────────────────────────────────
export const useMaintenanceSchedules = (assetId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-schedules', uid, assetId || 'all'],
    queryFn: () => listMaintenanceSchedules(uid!, assetId),
    enabled,
  });
};

export const useMaintenanceSchedule = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-schedule', uid, id],
    queryFn: () => getMaintenanceSchedule(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCreateMaintenanceSchedule = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateMaintenanceScheduleInput) =>
      createMaintenanceSchedule(uid!, input),
    onSuccess: () => {
      toast({ title: 'Maintenance schedule created' });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to create schedule',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateMaintenanceSchedule = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<AssetMaintenanceSchedule> }) =>
      updateMaintenanceSchedule(uid!, args.id, args.patch),
    onSuccess: () => {
      toast({ title: 'Schedule updated' });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({
        title: 'Update failed',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    },
  });
};

export const useDeactivateMaintenanceSchedule = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => deactivateMaintenanceSchedule(uid!, id),
    onSuccess: () => {
      toast({ title: 'Schedule deactivated' });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to deactivate',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    },
  });
};

// ── Records ─────────────────────────────────────────────────────────────────
export const useMaintenanceRecords = (assetId?: string) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-records', uid, assetId || 'all'],
    queryFn: () => listMaintenanceRecords(uid!, assetId),
    enabled,
  });
};

export const useMaintenanceRecord = (id: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-record', uid, id],
    queryFn: () => getMaintenanceRecord(uid!, id!),
    enabled: enabled && !!id,
  });
};

export const useCreateMaintenanceRecord = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateMaintenanceRecordInput) =>
      createMaintenanceRecord(uid!, input),
    onSuccess: (res) => {
      const desc = res.journalId
        ? `${res.record.record_type} logged • Journal posted`
        : `${res.record.record_type} logged`;
      toast({ title: 'Maintenance recorded', description: desc });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({
        title: 'Failed to record maintenance',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    },
  });
};

export const useUpdateMaintenanceRecord = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<AssetMaintenanceRecord> }) =>
      updateMaintenanceRecord(uid!, args.id, args.patch),
    onSuccess: () => {
      toast({ title: 'Record updated' });
      invalidate(qc);
    },
    onError: (err: any) => {
      toast({
        title: 'Update failed',
        description: err?.message || String(err),
        variant: 'destructive',
      });
    },
  });
};

// ── Aggregates / alerts ─────────────────────────────────────────────────────
export const useMaintenanceSummaryForAsset = (assetId: string | undefined) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-summary', uid, assetId],
    queryFn: () => getMaintenanceSummaryForAsset(uid!, assetId!),
    enabled: enabled && !!assetId,
  });
};

export const useMaintenanceSummaries = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-summaries', uid],
    queryFn: () => listAllMaintenanceSummaries(uid!),
    enabled,
  });
};

export const useDueMaintenanceAlerts = (withinDays = 14) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['maintenance-due', uid, withinDays],
    queryFn: () => listDueMaintenanceAlerts(uid!, withinDays),
    enabled,
  });
};

export const useAmcExpiringAlerts = (withinDays = 30) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['amc-expiring', uid, withinDays],
    queryFn: () => listAmcExpiringAlerts(uid!, withinDays),
    enabled,
  });
};

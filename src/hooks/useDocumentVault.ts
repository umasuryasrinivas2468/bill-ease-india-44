import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/clerk-react';
import { isValidUserId, normalizeUserId } from '@/lib/userUtils';
import { useToast } from '@/hooks/use-toast';
import {
  listVaultDocuments,
  createVaultDocument,
  archiveVaultDocument,
  restoreVaultDocument,
  listExpiringDocuments,
  listCrossModuleDocuments,
} from '@/services/documentVaultService';
import type { CreateDocumentInput } from '@/types/documentVault';

const useUid = () => {
  const { user } = useUser();
  return {
    uid: user && isValidUserId(user.id) ? normalizeUserId(user.id) : null,
    enabled: !!user && isValidUserId(user?.id),
  };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ['vault-documents'] });
  qc.invalidateQueries({ queryKey: ['vault-expiring'] });
  qc.invalidateQueries({ queryKey: ['vault-cross-module'] });
};

export const useVaultDocuments = (filters?: {
  entityType?: string;
  entityId?: string;
  documentType?: string;
  includeArchived?: boolean;
  search?: string;
}) => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: [
      'vault-documents', uid,
      filters?.entityType || 'all',
      filters?.entityId || 'all',
      filters?.documentType || 'all',
      filters?.includeArchived ? '1' : '0',
      filters?.search || '',
    ],
    queryFn: () => listVaultDocuments(uid!, filters),
    enabled,
  });
};

export const useCreateVaultDocument = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: CreateDocumentInput) => createVaultDocument(uid!, input),
    onSuccess: () => { toast({ title: 'Document filed' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Upload failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useArchiveVaultDocument = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => archiveVaultDocument(uid!, id),
    onSuccess: () => { toast({ title: 'Archived' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useRestoreVaultDocument = () => {
  const { uid } = useUid();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => restoreVaultDocument(uid!, id),
    onSuccess: () => { toast({ title: 'Restored' }); invalidate(qc); },
    onError: (e: any) => toast({ title: 'Failed', description: e?.message, variant: 'destructive' }),
  });
};

export const useExpiringDocuments = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['vault-expiring', uid],
    queryFn: () => listExpiringDocuments(uid!),
    enabled,
  });
};

export const useCrossModuleDocuments = () => {
  const { uid, enabled } = useUid();
  return useQuery({
    queryKey: ['vault-cross-module', uid],
    queryFn: () => listCrossModuleDocuments(uid!),
    enabled,
  });
};

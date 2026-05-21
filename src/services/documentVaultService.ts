// ════════════════════════════════════════════════════════════════════════════
// Document Vault Service (Module 17)
//
// Centralised store for invoices, warranties, insurance docs, agreements,
// loan documents, etc. Polymorphic: every document is linked to an
// (entity_type, entity_id) tuple — or to nothing if it's an org-wide doc.
//
// The actual file storage is NOT handled here — storage_url can be:
//   - a Supabase Storage object URL,
//   - an S3 / GCS public link,
//   - any HTTP URL.
// ════════════════════════════════════════════════════════════════════════════

import { supabase } from '@/lib/supabase';
import { normalizeUserId } from '@/lib/userUtils';
import type {
  CreateDocumentInput,
  DocumentExpiryAlert,
  VaultDocument,
} from '@/types/documentVault';

export const listVaultDocuments = async (
  userId: string,
  filters?: {
    entityType?: string;
    entityId?: string;
    documentType?: string;
    includeArchived?: boolean;
    search?: string;
  },
): Promise<VaultDocument[]> => {
  const uid = normalizeUserId(userId);
  let q = supabase
    .from('document_vault')
    .select('*')
    .eq('user_id', uid)
    .order('uploaded_at', { ascending: false });
  if (!filters?.includeArchived) q = q.eq('archived', false);
  if (filters?.entityType) q = q.eq('entity_type', filters.entityType);
  if (filters?.entityId) q = q.eq('entity_id', filters.entityId);
  if (filters?.documentType) q = q.eq('document_type', filters.documentType);
  if (filters?.search && filters.search.trim()) {
    const s = filters.search.trim();
    q = q.or(`document_name.ilike.%${s}%,title.ilike.%${s}%,description.ilike.%${s}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as VaultDocument[];
};

export const createVaultDocument = async (
  userId: string,
  input: CreateDocumentInput,
): Promise<VaultDocument> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('document_vault')
    .insert({
      user_id: uid,
      entity_type: input.entity_type,
      entity_id: input.entity_id || null,
      document_name: input.document_name,
      document_type: input.document_type,
      storage_url: input.storage_url,
      mime_type: input.mime_type || null,
      size_bytes: input.size_bytes ?? null,
      title: input.title || null,
      description: input.description || null,
      tags: input.tags && input.tags.length > 0 ? input.tags : null,
      doc_date: input.doc_date || null,
      expiry_date: input.expiry_date || null,
      uploaded_by: uid,
      archived: false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as VaultDocument;
};

export const archiveVaultDocument = async (
  userId: string,
  id: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('document_vault')
    .update({ archived: true })
    .eq('user_id', uid)
    .eq('id', id);
  if (error) throw error;
};

export const restoreVaultDocument = async (
  userId: string,
  id: string,
): Promise<void> => {
  const uid = normalizeUserId(userId);
  const { error } = await supabase
    .from('document_vault')
    .update({ archived: false })
    .eq('user_id', uid)
    .eq('id', id);
  if (error) throw error;
};

export const listExpiringDocuments = async (
  userId: string,
): Promise<DocumentExpiryAlert[]> => {
  const uid = normalizeUserId(userId);
  const { data, error } = await supabase
    .from('v_documents_expiring')
    .select('*')
    .eq('user_id', uid)
    .order('expiry_date');
  if (error) throw error;
  return (data || []) as DocumentExpiryAlert[];
};

// ── Aggregate URLs from non-vault tables (legacy document_url columns) ────
// Many existing modules store a single `document_url` on the record itself.
// This helper surfaces those alongside vault docs so the UI can show a
// unified list.
export interface CrossModuleDocumentRef {
  source_table: string;
  entity_id: string;
  entity_label: string;
  document_url: string;
  doc_date?: string | null;
  uploaded_at?: string | null;
}

export const listCrossModuleDocuments = async (
  userId: string,
): Promise<CrossModuleDocumentRef[]> => {
  const uid = normalizeUserId(userId);
  const out: CrossModuleDocumentRef[] = [];

  // Each query is best-effort — silently skip tables that don't exist.
  const queries: Array<{ table: string; idCol: string; labelCol: string; dateCol?: string }> = [
    { table: 'asset_warranties',           idCol: 'id', labelCol: 'provider_name',  dateCol: 'created_at' },
    { table: 'asset_insurance_policies',   idCol: 'id', labelCol: 'policy_number', dateCol: 'created_at' },
    { table: 'asset_insurance_claims',     idCol: 'id', labelCol: 'claim_number',  dateCol: 'created_at' },
    { table: 'asset_maintenance_records',  idCol: 'id', labelCol: 'description',   dateCol: 'performed_on' },
    { table: 'lease_contracts',            idCol: 'id', labelCol: 'lease_code',    dateCol: 'created_at' },
    { table: 'cwip_projects',              idCol: 'id', labelCol: 'cwip_code',     dateCol: 'created_at' },
    { table: 'liabilities',                idCol: 'id', labelCol: 'liability_code',dateCol: 'created_at' },
    { table: 'fixed_assets',               idCol: 'id', labelCol: 'asset_code',    dateCol: 'created_at' },
  ];

  for (const q of queries) {
    try {
      const { data } = await supabase
        .from(q.table)
        .select(`${q.idCol}, ${q.labelCol}, ${q.dateCol || 'created_at'}, attachment_url, document_url`)
        .eq('user_id', uid);
      for (const row of (data || []) as any[]) {
        const url = row.document_url || row.attachment_url;
        if (!url) continue;
        out.push({
          source_table: q.table,
          entity_id: row[q.idCol],
          entity_label: row[q.labelCol] || row[q.idCol],
          document_url: url,
          doc_date: q.dateCol ? row[q.dateCol] : null,
          uploaded_at: row.created_at || null,
        });
      }
    } catch {
      // table missing or columns differ — skip silently
    }
  }
  return out;
};

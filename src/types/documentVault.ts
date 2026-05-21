// Document Vault types (Module 17).

export type DocumentEntityType =
  | 'fixed_asset'
  | 'liability'
  | 'lease_contract'
  | 'cwip_project'
  | 'maintenance_record'
  | 'insurance_policy'
  | 'insurance_claim'
  | 'warranty'
  | 'transfer'
  | 'allocation'
  | 'audit_session'
  | 'covenant'
  | 'disposal_request'
  | 'revaluation'
  | 'generic';

export type DocumentType =
  | 'invoice'
  | 'bill'
  | 'warranty'
  | 'insurance_policy'
  | 'agreement'
  | 'loan_document'
  | 'tax_filing'
  | 'receipt'
  | 'photograph'
  | 'inspection_report'
  | 'certificate'
  | 'contract'
  | 'other';

export interface VaultDocument {
  id: string;
  user_id: string;
  entity_type: DocumentEntityType | string;
  entity_id?: string | null;
  document_name: string;
  document_type: DocumentType;
  storage_url: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  doc_date?: string | null;
  expiry_date?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
  archived: boolean;
}

export interface CreateDocumentInput {
  entity_type: DocumentEntityType | string;
  entity_id?: string;
  document_name: string;
  document_type: DocumentType;
  storage_url: string;
  mime_type?: string;
  size_bytes?: number;
  title?: string;
  description?: string;
  tags?: string[];
  doc_date?: string;
  expiry_date?: string;
}

export interface DocumentExpiryAlert extends VaultDocument {
  days_until_expiry: number;
  is_expired: boolean;
}

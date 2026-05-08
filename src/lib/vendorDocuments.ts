import { supabase } from '@/lib/supabase';

export type VendorDocumentType =
  | 'gst_certificate'
  | 'msme_certificate'
  | 'cancelled_cheque'
  | 'pan_card'
  | 'incorporation_doc'
  | 'itr_year_1'
  | 'itr_year_2'
  | 'itr_year_3'
  | 'declaration_206cca_206ab'
  | 'declaration_einvoice'
  | 'it_declaration'
  | 'other';

export interface VendorDocumentDescriptor {
  type: VendorDocumentType;
  label: string;
  required: boolean;
  description?: string;
}

export const VENDOR_DOCUMENT_DESCRIPTORS: VendorDocumentDescriptor[] = [
  { type: 'gst_certificate',          label: 'GST Certificate',                       required: true,
    description: 'GSTIN registration certificate issued by GST authority' },
  { type: 'msme_certificate',         label: 'MSME / Udyam Certificate',              required: false,
    description: 'Udyam registration certificate (mandatory if vendor is MSME)' },
  { type: 'cancelled_cheque',         label: 'Cancelled Company Cheque',              required: true,
    description: 'Cancelled cheque or bank statement for account verification' },
  { type: 'pan_card',                 label: 'PAN Card',                              required: true,
    description: 'PAN card of the vendor entity' },
  { type: 'incorporation_doc',        label: 'Incorporation Documents (Pvt Ltd / LLP / CIN)', required: true,
    description: 'Certificate of Incorporation or LLP agreement' },
  { type: 'itr_year_1',               label: 'IT Return — Latest FY',                 required: true,
    description: 'Most recent filed Income Tax Return acknowledgement' },
  { type: 'itr_year_2',               label: 'IT Return — FY-1',                      required: true,
    description: 'Income Tax Return for the prior financial year' },
  { type: 'itr_year_3',               label: 'IT Return — FY-2',                      required: true,
    description: 'Income Tax Return for FY two years ago' },
  { type: 'declaration_206cca_206ab', label: 'Declaration — 206CCA / 206AB',          required: true,
    description: 'Declaration confirming the vendor has filed ITRs and is not a "specified person" under 206AB / 206CCA' },
  { type: 'declaration_einvoice',     label: 'Declaration — E-Invoice Non-Applicability', required: false,
    description: 'Self-declaration that e-invoice is not applicable (only for vendors below the turnover threshold)' },
  { type: 'it_declaration',           label: 'Income Tax Declaration Form',           required: true,
    description: 'Vendor self-declaration regarding tax residency and TDS section applicable' },
];

const MAX_FILE_BYTES = 8 * 1024 * 1024;

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export interface VendorDocumentRow {
  id: string;
  vendor_id: string;
  document_type: VendorDocumentType;
  document_label?: string | null;
  file_name?: string | null;
  file_mime_type?: string | null;
  file_size?: number | null;
  file_data_url?: string | null;
  status: 'pending' | 'verified' | 'rejected';
  uploaded_at?: string | null;
}

export const fetchVendorDocuments = async (
  userId: string,
  vendorId: string
): Promise<VendorDocumentRow[]> => {
  const { data, error } = await supabase
    .from('vendor_documents' as any)
    .select('id, vendor_id, document_type, document_label, file_name, file_mime_type, file_size, file_data_url, status, uploaded_at')
    .eq('user_id', userId)
    .eq('vendor_id', vendorId)
    .order('uploaded_at', { ascending: false });

  if (error) throw error;
  return (data as any[]) || [];
};

export const uploadVendorDocument = async (
  userId: string,
  vendorId: string,
  documentType: VendorDocumentType,
  documentLabel: string,
  file: File
): Promise<VendorDocumentRow> => {
  if (!file) throw new Error('No file provided');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`${documentLabel} must be under ${(MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB`);
  }

  const dataUrl = await fileToDataUrl(file);

  await supabase
    .from('vendor_documents' as any)
    .delete()
    .eq('user_id', userId)
    .eq('vendor_id', vendorId)
    .eq('document_type', documentType);

  const { data, error } = await supabase
    .from('vendor_documents' as any)
    .insert({
      user_id: userId,
      vendor_id: vendorId,
      document_type: documentType,
      document_label: documentLabel,
      file_name: file.name,
      file_mime_type: file.type || 'application/octet-stream',
      file_size: file.size,
      file_data_url: dataUrl,
      status: 'pending',
      uploaded_at: new Date().toISOString(),
    })
    .select('id, vendor_id, document_type, document_label, file_name, file_mime_type, file_size, file_data_url, status, uploaded_at')
    .single();

  if (error) throw error;
  return data as any;
};

export const deleteVendorDocument = async (userId: string, documentId: string) => {
  const { error } = await supabase
    .from('vendor_documents' as any)
    .delete()
    .eq('user_id', userId)
    .eq('id', documentId);
  if (error) throw error;
};

export const summarizeMissingRequiredDocs = (
  uploaded: VendorDocumentRow[],
  msmeRegistered: boolean
): VendorDocumentDescriptor[] => {
  const uploadedTypes = new Set(uploaded.map((d) => d.document_type));
  return VENDOR_DOCUMENT_DESCRIPTORS.filter((d) => {
    if (d.type === 'msme_certificate') return msmeRegistered && !uploadedTypes.has(d.type);
    if (!d.required) return false;
    return !uploadedTypes.has(d.type);
  });
};

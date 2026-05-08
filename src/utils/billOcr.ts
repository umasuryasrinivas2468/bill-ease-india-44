import { supabase } from '@/lib/supabase';

/**
 * Bill OCR client — Brief item #8.
 * Uploads a bill image / PDF to the bill-ocr edge function and returns the
 * extracted structured data ready to drop into the PurchaseBills form.
 */

export interface ExtractedBillItem {
  description: string;
  hsn_sac?: string | null;
  quantity: number;
  rate: number;
  tax_rate: number;
  amount: number;
}

export interface ExtractedBill {
  vendor_name?: string | null;
  vendor_gstin?: string | null;
  vendor_address?: string | null;
  vendor_state?: string | null;
  buyer_gstin?: string | null;
  buyer_state?: string | null;
  bill_number?: string | null;
  bill_date?: string | null;
  due_date?: string | null;
  po_number?: string | null;
  is_rcm?: boolean;
  items?: ExtractedBillItem[];
  taxable_amount?: number | null;
  cgst_amount?: number | null;
  sgst_amount?: number | null;
  igst_amount?: number | null;
  cess_amount?: number | null;
  tcs_amount?: number | null;
  tds_amount?: number | null;
  round_off?: number | null;
  total_amount?: number | null;
  amount_in_words?: string | null;
  raw_text?: string | null;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip the "data:<mime>;base64," prefix
      resolve(result.split(',')[1] || '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const extractBillFromFile = async (file: File): Promise<ExtractedBill> => {
  if (file.size > 15 * 1024 * 1024) {
    throw new Error('File is too large (over 15 MB). Please upload a smaller or compressed file.');
  }

  const fileBase64 = await fileToBase64(file);
  const { data, error } = await supabase.functions.invoke('bill-ocr', {
    body: { fileBase64, mimeType: file.type || 'application/octet-stream' },
  });

  if (error) throw error;
  if (!data?.success) throw new Error(data?.error || 'OCR failed');
  return data.data as ExtractedBill;
};

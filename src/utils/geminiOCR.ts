import { supabase } from "@/lib/supabaseClient";
import { ExpenseOCRResult } from "./expenseOCR";

interface ExtractedData {
  vendor_name: string | null;
  bill_number: string | null;
  expense_date: string | null;
  base_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  gst_number: string | null;
  payment_mode: string | null;
  category_hint: string | null;
  raw_text: string;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const getMimeType = (file: File): string => {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    default:
      return "application/octet-stream";
  }
};

const toOCRResult = (data: ExtractedData): ExpenseOCRResult => {
  const result: ExpenseOCRResult = { rawText: data.raw_text || "" };

  if (data.vendor_name)
    result.vendorName = { value: data.vendor_name, confidence: "high" };

  if (data.bill_number)
    result.billNumber = { value: data.bill_number, confidence: "high" };

  if (data.expense_date)
    result.expenseDate = { value: data.expense_date, confidence: "high" };

  if (data.base_amount != null && data.base_amount > 0)
    result.amount = { value: data.base_amount.toFixed(2), confidence: "high" };

  if (data.tax_amount != null && data.tax_amount > 0)
    result.taxAmount = { value: data.tax_amount.toFixed(2), confidence: "high" };

  if (data.total_amount != null && data.total_amount > 0)
    result.totalAmount = { value: data.total_amount.toFixed(2), confidence: "high" };

  // Derive missing amounts
  if (result.totalAmount && result.taxAmount && !result.amount) {
    const derived = Number(result.totalAmount.value) - Number(result.taxAmount.value);
    if (derived > 0)
      result.amount = { value: derived.toFixed(2), confidence: "medium" };
  }
  if (result.amount && result.taxAmount && !result.totalAmount) {
    const derived = Number(result.amount.value) + Number(result.taxAmount.value);
    result.totalAmount = { value: derived.toFixed(2), confidence: "medium" };
  }
  if (!result.amount && result.totalAmount)
    result.amount = { ...result.totalAmount, confidence: "medium" };

  if (data.gst_number)
    result.gstNumber = { value: data.gst_number.toUpperCase(), confidence: "high" };

  if (data.payment_mode)
    result.paymentMode = { value: data.payment_mode, confidence: "high" };

  if (data.category_hint)
    result.categoryHint = { value: data.category_hint, confidence: "medium" };

  const notes: string[] = [];
  if (result.gstNumber) notes.push(`GSTIN: ${result.gstNumber.value}`);
  if (result.categoryHint) notes.push(`AI category hint: ${result.categoryHint.value}`);
  if (result.paymentMode) notes.push(`AI payment hint: ${result.paymentMode.value}`);
  result.notes = notes.join(" | ");

  return result;
};

export const extractExpenseWithGemini = async (file: File): Promise<ExpenseOCRResult> => {
  const fileBase64 = await fileToBase64(file);
  const mimeType = getMimeType(file);

  const { data, error } = await supabase.functions.invoke("expense-ocr", {
    body: { fileBase64, mimeType },
  });

  if (error) {
    throw new Error(error.message || "Failed to call expense OCR service");
  }

  if (!data?.success) {
    throw new Error(data?.error || "AI extraction failed. Try a clearer image.");
  }

  return toOCRResult(data.data);
};

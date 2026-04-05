export interface OCRCandidateField {
  value: string;
  confidence: "high" | "medium" | "low";
}

export interface ExpenseOCRResult {
  vendorName?: OCRCandidateField;
  billNumber?: OCRCandidateField;
  expenseDate?: OCRCandidateField;
  amount?: OCRCandidateField;
  taxAmount?: OCRCandidateField;
  totalAmount?: OCRCandidateField;
  gstNumber?: OCRCandidateField;
  paymentMode?: OCRCandidateField;
  categoryHint?: OCRCandidateField;
  notes?: string;
  rawText: string;
}

const normalizeAmount = (value: string) =>
  value.replace(/[, ]/g, "").replace(/[^\d.]/g, "");

const normalizeDateString = (value: string) => {
  const parts = value.replace(/\./g, "/").replace(/-/g, "/").split("/");
  if (parts.length !== 3) return value;

  const [day, month, year] = parts;
  const normalizedYear = year.length === 2 ? `20${year}` : year;
  return `${normalizedYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
};

const cleanVendorName = (value: string) =>
  value
    .replace(/^(tax invoice|invoice|bill|receipt|supplier|vendor|from)\s*/i, "")
    .replace(/[^a-zA-Z0-9&.,()\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const inferCategoryHint = (text: string): OCRCandidateField | undefined => {
  const normalized = text.toLowerCase();
  const categoryMatchers = [
    { terms: ["fuel", "petrol", "diesel", "indian oil", "bharat petroleum", "hpcl"], category: "Fuel Expense" },
    { terms: ["hotel", "travel", "flight", "uber", "ola", "cab"], category: "Travel Expense" },
    { terms: ["restaurant", "food", "meal", "swiggy", "zomato"], category: "Meals & Entertainment" },
    { terms: ["office", "stationery", "print", "printer"], category: "Office Expense" },
    { terms: ["software", "subscription", "license", "saas"], category: "Software Expense" },
    { terms: ["repair", "service", "maintenance"], category: "Repairs & Maintenance" },
  ];

  const match = categoryMatchers.find((item) => item.terms.some((term) => normalized.includes(term)));
  return match ? { value: match.category, confidence: "medium" } : undefined;
};

const inferPaymentMode = (text: string): OCRCandidateField | undefined => {
  const normalized = text.toLowerCase();
  if (normalized.includes("upi")) return { value: "upi", confidence: "high" };
  if (normalized.includes("credit card")) return { value: "credit_card", confidence: "high" };
  if (normalized.includes("debit card")) return { value: "debit_card", confidence: "high" };
  if (normalized.includes("cash")) return { value: "cash", confidence: "medium" };
  if (normalized.includes("bank") || normalized.includes("neft") || normalized.includes("rtgs")) return { value: "bank", confidence: "medium" };
  if (normalized.includes("cheque")) return { value: "cheque", confidence: "medium" };
  return undefined;
};

export const extractExpenseDataFromText = (text: string): ExpenseOCRResult => {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const result: ExpenseOCRResult = {
    rawText: text,
  };

  const billNumberMatch = text.match(/(?:invoice|bill|receipt|voucher)(?:\s*(?:no|#|number))?[\s:.-]*([a-zA-Z0-9\-\/]+)/i);
  if (billNumberMatch) {
    result.billNumber = { value: billNumberMatch[1].trim(), confidence: "high" };
  }

  const dateMatch = text.match(/(?:date|dated)[\s:.-]*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i) || text.match(/\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b/);
  if (dateMatch) {
    result.expenseDate = { value: normalizeDateString(dateMatch[1]), confidence: "medium" };
  }

  const gstMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i);
  if (gstMatch) {
    result.gstNumber = { value: gstMatch[1].toUpperCase(), confidence: "high" };
  }

  const amountMatches = [...text.matchAll(/(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)/gi)]
    .map((match) => Number(normalizeAmount(match[1])))
    .filter((value) => !Number.isNaN(value) && value > 0);

  const uniqueAmounts = [...new Set(amountMatches)].sort((a, b) => b - a);
  if (uniqueAmounts.length > 0) {
    result.totalAmount = { value: uniqueAmounts[0].toFixed(2), confidence: "medium" };
  }
  if (uniqueAmounts.length > 1) {
    result.amount = { value: uniqueAmounts[1].toFixed(2), confidence: "low" };
  }

  const taxMatch = text.match(/(?:gst|tax|cgst|sgst|igst)[^0-9]{0,20}([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)/i);
  if (taxMatch) {
    result.taxAmount = { value: Number(normalizeAmount(taxMatch[1])).toFixed(2), confidence: "medium" };
  } else if (result.totalAmount && result.amount) {
    const derivedTax = Number(result.totalAmount.value) - Number(result.amount.value);
    if (derivedTax > 0 && derivedTax < Number(result.totalAmount.value)) {
      result.taxAmount = { value: derivedTax.toFixed(2), confidence: "low" };
    }
  } else if (result.totalAmount) {
    result.amount = result.totalAmount;
  }

  const vendorLine =
    lines.find((line) => /(?:private limited|pvt ltd|llp|limited|enterprises|traders|solutions|services|station|petrol|fuel|store)/i.test(line)) ||
    lines.find((line) => /^[A-Za-z0-9&.,()\- ]{4,}$/.test(line) && !/\d{2}[\/\-\.]\d{2}[\/\-\.]\d{2,4}/.test(line));

  if (vendorLine) {
    const cleaned = cleanVendorName(vendorLine);
    if (cleaned) {
      result.vendorName = { value: cleaned, confidence: vendorLine === lines[0] ? "high" : "medium" };
    }
  }

  result.paymentMode = inferPaymentMode(text);
  result.categoryHint = inferCategoryHint(text);

  const notes: string[] = [];
  if (result.gstNumber) notes.push(`GSTIN: ${result.gstNumber.value}`);
  if (result.categoryHint) notes.push(`OCR category hint: ${result.categoryHint.value}`);
  if (result.paymentMode) notes.push(`OCR payment hint: ${result.paymentMode.value}`);
  result.notes = notes.join(" | ");

  return result;
};

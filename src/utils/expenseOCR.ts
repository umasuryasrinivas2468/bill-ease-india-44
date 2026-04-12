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

const RUPEE_SYMBOL = "\u20B9";
const BROKEN_RUPEE_SYMBOLS = ["â‚¹", "Ã¢â€šÂ¹"];

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

const GENERIC_VENDOR_WORDS =
  /^(tax invoice|invoice|bill|receipt|cash memo|retail invoice|original|duplicate|customer copy|seller copy|page \d+|gst invoice)$/i;

const LABEL_PATTERNS = {
  total: /(grand\s*total|invoice\s*total|net\s*amount|amount\s*payable|total\s*payable|total\s*amount|final\s*amount|final\s*total|\btotal\b)/i,
  subtotal: /(taxable\s*amount|sub\s*total|subtotal|base\s*amount|net\s*value|gross\s*amount|amount\s*before\s*tax|item\s*total)/i,
  tax: /\b(gst|tax|cgst|sgst|igst|vat)\b/i,
};

const normalizeOCRText = (input: string) => {
  let text = input;
  for (const broken of BROKEN_RUPEE_SYMBOLS) {
    text = text.replaceAll(broken, RUPEE_SYMBOL);
  }
  return text.replace(/[|]/g, " ").replace(/\u00A0/g, " ");
};

const normalizeAmount = (value: string) =>
  BROKEN_RUPEE_SYMBOLS.reduce((amount, broken) => amount.replaceAll(broken, ""), value)
    .replaceAll(RUPEE_SYMBOL, "")
    .replace(/[, ]/g, "")
    .replace(/[^\d.]/g, "");

const parseAmount = (value: string) => {
  const normalized = normalizeAmount(value);
  if (!normalized) return undefined;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  return amount;
};

const normalizeDateString = (value: string) => {
  const cleaned = value.replace(/[,]/g, " ").replace(/\s+/g, " ").trim();

  const monthNameMatch = cleaned.match(/(\d{1,2})[\s\-/.]([A-Za-z]{3,9})[\s\-/. ,]+(\d{2,4})/i);
  if (monthNameMatch) {
    const [, day, monthName, year] = monthNameMatch;
    const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
    if (month) {
      const normalizedYear = year.length === 2 ? `20${year}` : year;
      return `${normalizedYear}-${month}-${day.padStart(2, "0")}`;
    }
  }

  const parts = cleaned.replace(/\./g, "/").replace(/-/g, "/").split("/");
  if (parts.length !== 3) return value;

  const [first, second, third] = parts;
  if (first.length === 4) {
    return `${first}-${second.padStart(2, "0")}-${third.padStart(2, "0")}`;
  }

  const normalizedYear = third.length === 2 ? `20${third}` : third;
  return `${normalizedYear}-${second.padStart(2, "0")}-${first.padStart(2, "0")}`;
};

const cleanVendorName = (value: string) =>
  value
    .replace(/^(tax invoice|invoice|bill|receipt|supplier|vendor|from)\s*/i, "")
    .replace(/^(m\/s\.?|m s\.?)\s*/i, "")
    .replace(/[^a-zA-Z0-9&.,()\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toConfidence = (score: number): OCRCandidateField["confidence"] => {
  if (score >= 90) return "high";
  if (score >= 70) return "medium";
  return "low";
};

const addCandidate = (candidates: Map<string, number>, rawValue: string | undefined, score: number) => {
  if (!rawValue) return;
  const value = cleanVendorName(rawValue);
  if (!value || value.length < 3 || GENERIC_VENDOR_WORDS.test(value)) return;
  candidates.set(value, Math.max(candidates.get(value) || 0, score));
};

const isProbablyAddressLine = (line: string) =>
  /(road|rd\.?|street|st\.?|lane|nagar|building|floor|block|district|state|india|pincode|pin code|phone|mobile|contact|email|www\.|http|near|opp\.?|opposite)/i.test(
    line,
  );

const isLikelyNoiseLine = (line: string) =>
  GENERIC_VENDOR_WORDS.test(line) ||
  /^[\d\s\-:/.,]+$/.test(line) ||
  isProbablyAddressLine(line) ||
  /\b(gstin?|invoice|bill|receipt|date|time|qty|amount|tax|total)\b/i.test(line);

const pickVendorName = (lines: string[]): OCRCandidateField | undefined => {
  const candidates = new Map<string, number>();

  for (const [index, line] of lines.slice(0, 10).entries()) {
    if (isLikelyNoiseLine(line)) continue;
    addCandidate(candidates, line, 96 - index * 6);
  }

  for (const line of lines) {
    const labelledMatch = line.match(/(?:supplier|vendor|sold by|from|m\/s\.?|m s\.?)[:\s-]+(.+)/i);
    if (labelledMatch) addCandidate(candidates, labelledMatch[1], 92);
  }

  const selected = [...candidates.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!selected) return undefined;

  return {
    value: selected[0],
    confidence: toConfidence(selected[1]),
  };
};

const extractLineAmounts = (line: string) =>
  [...line.matchAll(/(?:₹|rs\.?|inr)?\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.\d{1,2})|[0-9]+(?:\.\d{1,2})?)/gi)]
    .map((match) => parseAmount(match[1]))
    .filter((value): value is number => value !== undefined)
    .filter((value) => value < 100000000);

const scoreAmountLine = (line: string, amount: number, labelPattern: RegExp) => {
  let score = 60;
  if (labelPattern.test(line)) score += 30;
  if (line.includes(RUPEE_SYMBOL) || /\brs\.?|\binr\b/i.test(line)) score += 10;
  if (/\.\d{2}\b/.test(line)) score += 5;
  if (amount >= 1) score += 1;
  return score;
};

const pickAmountFromLines = (
  lines: string[],
  labelPattern: RegExp,
  fallbackConfidence: OCRCandidateField["confidence"],
  mode: "largest" | "smallest" | "sum",
): OCRCandidateField | undefined => {
  const candidates = lines
    .filter((line) => labelPattern.test(line))
    .flatMap((line) =>
      extractLineAmounts(line).map((amount) => ({
        amount,
        score: scoreAmountLine(line, amount, labelPattern),
      })),
    )
    .sort((a, b) => b.score - a.score || b.amount - a.amount);

  if (!candidates.length) return undefined;

  let value = candidates[0].amount;
  if (mode === "largest") value = Math.max(...candidates.map((candidate) => candidate.amount));
  if (mode === "smallest") value = Math.min(...candidates.map((candidate) => candidate.amount));
  if (mode === "sum") value = candidates.reduce((total, candidate) => total + candidate.amount, 0);

  return { value: value.toFixed(2), confidence: fallbackConfidence };
};

const collectStandaloneAmounts = (lines: string[]) =>
  lines
    .filter((line) => !/\b(gstin?|phone|mobile|invoice no|bill no|receipt no|hsn|sac|qty|quantity|date|time)\b/i.test(line))
    .flatMap((line) => {
      const amounts = extractLineAmounts(line);
      if (!amounts.length) return [];
      const hasMoneySignal = line.includes(RUPEE_SYMBOL) || /\brs\.?|\binr\b/i.test(line) || LABEL_PATTERNS.total.test(line) || LABEL_PATTERNS.subtotal.test(line) || LABEL_PATTERNS.tax.test(line);
      if (!hasMoneySignal) return [];
      return amounts;
    });

const inferCategoryHint = (text: string): OCRCandidateField | undefined => {
  const normalized = text.toLowerCase();
  const categoryMatchers = [
    { terms: ["fuel", "petrol", "diesel", "indian oil", "bharat petroleum", "hpcl"], category: "Fuel & Transportation" },
    { terms: ["hotel", "travel", "flight", "uber", "ola", "cab"], category: "Travel & Accommodation" },
    { terms: ["restaurant", "food", "meal", "swiggy", "zomato"], category: "Entertainment" },
    { terms: ["office", "stationery", "print", "printer"], category: "Printing & Stationery" },
    { terms: ["software", "subscription", "license", "saas"], category: "Software & Subscriptions" },
    { terms: ["repair", "service", "maintenance"], category: "Repairs & Maintenance" },
    { terms: ["courier", "shipping", "freight"], category: "Freight & Cartage" },
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
  if (normalized.includes("bank") || normalized.includes("neft") || normalized.includes("rtgs") || normalized.includes("imps")) {
    return { value: "bank", confidence: "medium" };
  }
  if (normalized.includes("cheque")) return { value: "cheque", confidence: "medium" };
  return undefined;
};

export const extractExpenseDataFromText = (rawText: string): ExpenseOCRResult => {
  const text = normalizeOCRText(rawText);
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

  const dateMatch =
    text.match(/(?:date|dated|invoice date|bill date)[\s:.-]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i) ||
    text.match(/(?:date|dated|invoice date|bill date)[\s:.-]*([0-9]{4}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{1,2})/i) ||
    text.match(/(?:date|dated|invoice date|bill date)[\s:.-]*([0-9]{1,2}[\s\-][A-Za-z]{3,9}[\s,\-][0-9]{2,4})/i) ||
    text.match(/\b([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})\b/);
  if (dateMatch) {
    result.expenseDate = { value: normalizeDateString(dateMatch[1]), confidence: "medium" };
  }

  const gstMatch = text.match(/\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z])\b/i);
  if (gstMatch) {
    result.gstNumber = { value: gstMatch[1].toUpperCase(), confidence: "high" };
  }

  result.totalAmount = pickAmountFromLines(lines, LABEL_PATTERNS.total, "high", "largest");
  result.amount = pickAmountFromLines(lines, LABEL_PATTERNS.subtotal, "high", "largest");
  result.taxAmount = pickAmountFromLines(lines, LABEL_PATTERNS.tax, "high", "sum");

  const standaloneAmounts = [...new Set(collectStandaloneAmounts(lines))].sort((a, b) => b - a);

  if (!result.totalAmount && standaloneAmounts.length > 0) {
    result.totalAmount = { value: standaloneAmounts[0].toFixed(2), confidence: "medium" };
  }

  if (!result.amount) {
    const nonTotalCandidate = standaloneAmounts.find((amount) => !result.totalAmount || amount < Number(result.totalAmount.value));
    if (nonTotalCandidate) {
      result.amount = { value: nonTotalCandidate.toFixed(2), confidence: "low" };
    }
  }

  if (result.totalAmount && result.taxAmount) {
    const totalValue = Number(result.totalAmount.value);
    const taxValue = Number(result.taxAmount.value);
    if (!result.amount) {
      const derivedBase = totalValue - taxValue;
      if (derivedBase > 0) {
        result.amount = { value: derivedBase.toFixed(2), confidence: "medium" };
      }
    }
  }

  if (result.totalAmount && result.amount && !result.taxAmount) {
    const derivedTax = Number(result.totalAmount.value) - Number(result.amount.value);
    if (derivedTax > 0 && derivedTax < Number(result.totalAmount.value)) {
      result.taxAmount = { value: derivedTax.toFixed(2), confidence: "low" };
    }
  }

  if (result.amount && result.taxAmount && !result.totalAmount) {
    const derivedTotal = Number(result.amount.value) + Number(result.taxAmount.value);
    result.totalAmount = { value: derivedTotal.toFixed(2), confidence: "medium" };
  }

  if (!result.amount && result.totalAmount) {
    result.amount = result.totalAmount;
  }

  if (result.amount && result.totalAmount && Number(result.amount.value) > Number(result.totalAmount.value)) {
    result.amount = { value: result.totalAmount.value, confidence: "low" };
  }

  result.vendorName = pickVendorName(lines);
  result.paymentMode = inferPaymentMode(text);
  result.categoryHint = inferCategoryHint(text);

  const notes: string[] = [];
  if (result.gstNumber) notes.push(`GSTIN: ${result.gstNumber.value}`);
  if (result.categoryHint) notes.push(`OCR category hint: ${result.categoryHint.value}`);
  if (result.paymentMode) notes.push(`OCR payment hint: ${result.paymentMode.value}`);
  result.notes = notes.join(" | ");

  return result;
};

// ═══════════════════════════════════════════════════════════════════
// GST calculation utilities — single source of truth.
// Used by: Auto GST on invoices/bills, RCM on expenses, dashboards,
// and penalty calculator.
// Pure functions only — no side effects.
// ═══════════════════════════════════════════════════════════════════

// ─ Indian state list (30 states + 8 UTs). ISO-like short codes. ─
export interface IndianState {
  code: string; // 2-digit GSTIN state code
  name: string;
}

export const INDIAN_STATES: IndianState[] = [
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '25', name: 'Daman and Diu' },
  { code: '26', name: 'Dadra and Nagar Haveli' },
  { code: '27', name: 'Maharashtra' },
  { code: '28', name: 'Andhra Pradesh (Old)' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' },
  { code: '97', name: 'Other Territory' },
];

// ─ Normalize place_of_supply / state strings for comparison. ─
// Handles: "29", "29-Karnataka", "Karnataka", "karnataka", "  KARNATAKA ", etc.
export function normalizeState(input: string | null | undefined): string {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';

  // If it starts with a 2-digit code, map that
  const codeMatch = raw.match(/^(\d{2})\b/);
  if (codeMatch) {
    const found = INDIAN_STATES.find((s) => s.code === codeMatch[1]);
    if (found) return found.name.toLowerCase();
  }

  // Strip leading code like "29-" or "29 "
  const stripped = raw.replace(/^\d{1,2}[\s\-:.]*/, '').trim().toLowerCase();
  return stripped;
}

// Two states are the same only if BOTH are present and normalize equal.
// Missing state on either side → treat as inter-state (safer: IGST).
export function isSameState(
  sellerState: string | null | undefined,
  buyerState: string | null | undefined,
): boolean {
  const a = normalizeState(sellerState);
  const b = normalizeState(buyerState);
  if (!a || !b) return false;
  return a === b;
}

// ─ Core GST split calculator (Feature #11) ─
export interface GSTBreakdown {
  taxable: number;
  rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
  total: number; // taxable + total_tax
  intraState: boolean;
}

export function computeGSTBreakdown(
  taxable: number,
  rate: number,
  sellerState: string | null | undefined,
  buyerState: string | null | undefined,
): GSTBreakdown {
  const safeTaxable = Number(taxable) || 0;
  const safeRate = Number(rate) || 0;
  const totalTax = round2((safeTaxable * safeRate) / 100);
  const intra = isSameState(sellerState, buyerState);

  const breakdown: GSTBreakdown = {
    taxable: round2(safeTaxable),
    rate: safeRate,
    cgst: 0,
    sgst: 0,
    igst: 0,
    total_tax: totalTax,
    total: round2(safeTaxable + totalTax),
    intraState: intra,
  };

  if (intra) {
    const half = round2(totalTax / 2);
    breakdown.cgst = half;
    // Use subtraction to avoid ₹0.01 rounding drift on odd amounts
    breakdown.sgst = round2(totalTax - half);
  } else {
    breakdown.igst = totalTax;
  }

  return breakdown;
}

// ─ RCM (Feature #12) ─────────────────────────────────────────────

// Expense categories that default to RCM under Section 9(3) / 9(4) CGST Act.
// Not exhaustive — only the common ones most SMBs encounter.
export const RCM_DEFAULT_CATEGORIES: readonly string[] = [
  'Legal Fees',
  'Professional Fees',        // services from advocates/CAs if supplier is unregistered
  'Directors Remuneration',   // director services to company
  'Audit Fees',
  'Freight & Cartage',        // GTA freight
  'Selling Commission',       // insurance agents, recovery agents etc.
];

export type VendorGstStatus = 'registered' | 'unregistered' | 'composition' | 'unknown';

export interface RCMInput {
  category: string;
  vendorGstStatus: VendorGstStatus;
  amount: number;
  rate: number;
  explicitRcmFlag?: boolean; // user override from UI checkbox
}

export interface RCMResult {
  applicable: boolean;
  reason: string;
  cgst: number;
  sgst: number;
  igst: number;
  total_rcm_payable: number;
}

// Decide if RCM applies. Logic mirrors CGST Act §9(3)/(4):
// - Categories in RCM_DEFAULT_CATEGORIES → RCM applies.
// - Unregistered vendor + category in RCM_DEFAULT_CATEGORIES → RCM applies.
// - Explicit user flag overrides both.
export function evaluateRCM(
  input: RCMInput,
  sellerState: string | null | undefined,
  vendorState: string | null | undefined,
): RCMResult {
  let applicable = false;
  let reason = 'Not applicable';

  if (input.explicitRcmFlag === true) {
    applicable = true;
    reason = 'Marked RCM by user';
  } else if (input.explicitRcmFlag === false) {
    applicable = false;
    reason = 'RCM disabled by user';
  } else if (RCM_DEFAULT_CATEGORIES.includes(input.category)) {
    applicable = true;
    reason = `Category "${input.category}" is RCM by default (Section 9(3))`;
  } else if (
    input.vendorGstStatus === 'unregistered' &&
    RCM_DEFAULT_CATEGORIES.includes(input.category)
  ) {
    applicable = true;
    reason = 'Unregistered vendor + RCM-eligible category (Section 9(4))';
  }

  if (!applicable) {
    return {
      applicable,
      reason,
      cgst: 0,
      sgst: 0,
      igst: 0,
      total_rcm_payable: 0,
    };
  }

  const breakdown = computeGSTBreakdown(
    input.amount,
    input.rate,
    sellerState,
    vendorState,
  );

  return {
    applicable: true,
    reason,
    cgst: breakdown.cgst,
    sgst: breakdown.sgst,
    igst: breakdown.igst,
    total_rcm_payable: breakdown.total_tax,
  };
}

// ─ Interest & late fee (Feature #15) ──────────────────────────────

// GST Act: interest @ 18% p.a. on unpaid tax, per-day basis.
// Late fee: ₹50/day for non-nil, ₹20/day for nil, capped at ₹5,000 per return.
// CGST + SGST are separate returns technically, so fee applies per Act + per SGST Act.
export interface PenaltyInput {
  tax_payable: number; // net GST payable in cash
  due_date: string;    // YYYY-MM-DD (GSTR-3B due date, typically 20th of next month)
  filing_date: string; // YYYY-MM-DD actual/intended filing date
  is_nil_return?: boolean;
}

export interface PenaltyResult {
  days_late: number;
  interest: number;    // on tax, 18% p.a.
  late_fee: number;    // ₹50 or ₹20 × days, capped
  total_penalty: number;
}

export const LATE_FEE_PER_DAY = 50;
export const LATE_FEE_PER_DAY_NIL = 20;
export const LATE_FEE_CAP = 5000;
export const INTEREST_RATE_PA = 18; // percent

export function computePenalty(input: PenaltyInput): PenaltyResult {
  const due = new Date(input.due_date);
  const filed = new Date(input.filing_date);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLate = Math.max(
    0,
    Math.floor((filed.getTime() - due.getTime()) / msPerDay),
  );

  if (daysLate === 0) {
    return { days_late: 0, interest: 0, late_fee: 0, total_penalty: 0 };
  }

  const tax = Number(input.tax_payable) || 0;
  const interest = round2((tax * INTEREST_RATE_PA * daysLate) / (100 * 365));

  const perDay = input.is_nil_return ? LATE_FEE_PER_DAY_NIL : LATE_FEE_PER_DAY;
  const rawFee = perDay * daysLate;
  const late_fee = Math.min(rawFee, LATE_FEE_CAP);

  return {
    days_late: daysLate,
    interest,
    late_fee,
    total_penalty: round2(interest + late_fee),
  };
}

// ─ Helpers ─────────────────────────────────────────────────────────
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function formatINR(n: number): string {
  const value = Number(n) || 0;
  return `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─ Multi-rate invoice engine (Feature #16) ────────────────────────

export interface MultiRateLineInput {
  taxable: number; // pre-tax amount for this line (after per-line discount)
  rate: number;    // 0 / 5 / 12 / 18 / 28 etc.
}

export interface RateBucket {
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
}

export interface MultiRateResult {
  buckets: RateBucket[];
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  total_tax: number;
  total: number;
  intraState: boolean;
}

// Group lines by rate, compute GST per bucket, then sum.
// This is how GST must actually be reported — one row per (rate, tax-head).
export function computeMultiRateGST(
  lines: MultiRateLineInput[],
  sellerState: string | null | undefined,
  buyerState: string | null | undefined,
): MultiRateResult {
  const intra = isSameState(sellerState, buyerState);
  const groups = new Map<number, number>();

  for (const ln of lines) {
    const rate = Number(ln.rate) || 0;
    const taxable = Number(ln.taxable) || 0;
    groups.set(rate, (groups.get(rate) || 0) + taxable);
  }

  const buckets: RateBucket[] = [];
  let total_tax = 0;
  let totalTaxable = 0;
  let cgstSum = 0;
  let sgstSum = 0;
  let igstSum = 0;

  for (const [rate, taxable] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    const bd = computeGSTBreakdown(taxable, rate, sellerState, buyerState);
    buckets.push({
      rate,
      taxable: bd.taxable,
      cgst: bd.cgst,
      sgst: bd.sgst,
      igst: bd.igst,
      total_tax: bd.total_tax,
    });
    totalTaxable += bd.taxable;
    cgstSum += bd.cgst;
    sgstSum += bd.sgst;
    igstSum += bd.igst;
    total_tax += bd.total_tax;
  }

  return {
    buckets,
    taxable: round2(totalTaxable),
    cgst: round2(cgstSum),
    sgst: round2(sgstSum),
    igst: round2(igstSum),
    total_tax: round2(total_tax),
    total: round2(totalTaxable + total_tax),
    intraState: intra,
  };
}

// ─ Inclusive / Exclusive tax calculator (Feature #17) ──────────────

export type PricingMode = 'exclusive' | 'inclusive';

export interface InclusiveExtractResult {
  gross: number;     // what the user entered (line value including GST, if inclusive)
  taxable: number;   // extracted pre-tax value
  tax: number;       // GST component
  rate: number;
}

// Extract taxable + tax from an inclusive gross value: taxable = gross / (1 + r/100).
// For exclusive input, just returns { taxable: gross, tax: gross*r, gross: gross+tax }.
export function extractTaxable(
  amount: number,
  rate: number,
  mode: PricingMode,
): InclusiveExtractResult {
  const safeAmount = Number(amount) || 0;
  const safeRate = Number(rate) || 0;

  if (mode === 'inclusive') {
    const taxable = round2(safeAmount / (1 + safeRate / 100));
    const tax = round2(safeAmount - taxable);
    return { gross: round2(safeAmount), taxable, tax, rate: safeRate };
  }

  // exclusive
  const tax = round2((safeAmount * safeRate) / 100);
  return {
    gross: round2(safeAmount + tax),
    taxable: round2(safeAmount),
    tax,
    rate: safeRate,
  };
}

// ─ Invoice total rounding (Feature #19) ───────────────────────────

export interface RoundingResult {
  rounded: number;     // nearest rupee (banker's rounding — standard "round-half-up")
  diff: number;        // rounded − original (the "Round Off" line on invoices)
}

// Round to nearest whole rupee (per CBIC circular practice).
// Positive diff = amount rounded up (customer pays a bit more).
// Negative diff = rounded down.
export function roundInvoiceTotal(total: number): RoundingResult {
  const safe = Number(total) || 0;
  const rounded = Math.round(safe);
  return { rounded, diff: round2(rounded - safe) };
}

// ─ Credit note tax reversal (Feature #20) ─────────────────────────

export interface CreditNoteReversalInput {
  original_taxable: number;      // original invoice pre-tax amount
  original_tax: number;          // original total GST
  return_taxable: number;        // taxable amount of goods returned / rate reduction
  // Optional: if original had specific rate, caller can pass it for display.
  rate?: number;
}

export interface CreditNoteReversalResult {
  reversal_taxable: number;      // taxable to reduce
  reversal_tax: number;          // GST to reverse
  reversal_total: number;        // total credit note value
  // Proportional allocation to CGST/SGST/IGST based on original mix.
  cgst: number;
  sgst: number;
  igst: number;
}

// Proportionally reverse GST when goods are returned or invoice is reduced.
// Uses original mix (intra vs inter) to split the reversal into CGST/SGST/IGST.
export function computeCreditNoteReversal(
  input: CreditNoteReversalInput,
  sellerState: string | null | undefined,
  buyerState: string | null | undefined,
): CreditNoteReversalResult {
  const origTax = Number(input.original_taxable) || 0;
  const origGst = Number(input.original_tax) || 0;
  const retTax = Math.min(Number(input.return_taxable) || 0, origTax);
  if (origTax === 0) {
    return {
      reversal_taxable: 0,
      reversal_tax: 0,
      reversal_total: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
  }

  const ratio = retTax / origTax;
  const reversalTax = round2(origGst * ratio);
  const intra = isSameState(sellerState, buyerState);

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (intra) {
    const half = round2(reversalTax / 2);
    cgst = half;
    sgst = round2(reversalTax - half);
  } else {
    igst = reversalTax;
  }

  return {
    reversal_taxable: round2(retTax),
    reversal_tax: reversalTax,
    reversal_total: round2(retTax + reversalTax),
    cgst,
    sgst,
    igst,
  };
}

// ─ GSTR-3B due date helper (Feature #25) ──────────────────────────

// GSTR-3B is due 20th of the month FOLLOWING the return period.
// E.g. return period 2026-03 → due 2026-04-20.
export function gstr3bDueDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return '';
  const d = new Date(Date.UTC(y, m, 20)); // month=m (0-indexed next month)
  return d.toISOString().slice(0, 10);
}

// Return the YYYY-MM of the month that comes `delta` months after `period`.
// Used to navigate prior months / YoY same month.
export function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

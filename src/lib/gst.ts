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

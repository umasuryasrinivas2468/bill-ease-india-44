/**
 * GST helpers — Indian-accounting rules used by the AP / GST modules.
 *
 * Real-world references (kept in sync with CGST Act 2017):
 *   • S.9(3)/9(4): Reverse Charge Mechanism — recipient pays GST instead of supplier
 *   • S.17(5): Blocked credits — input tax not eligible even if charged
 *   • Place of supply rules → CGST+SGST (intra-state) vs IGST (inter-state)
 *   • Composition scheme: vendor charges no GST → no ITC at the buyer
 */

// ── GSTIN parsing ──────────────────────────────────────────────────────────
// GSTIN format: 22 AAAAA0000A 1 Z 5
//   pos 1-2:  state code (numeric)
//   pos 3-12: PAN
//   pos 13:   entity number
//   pos 14:   default 'Z'
//   pos 15:   checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export const isValidGstin = (gstin?: string | null): boolean => {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
};

export const gstinStateCode = (gstin?: string | null): string | null => {
  if (!gstin || gstin.length < 2) return null;
  return gstin.trim().substring(0, 2);
};

// State code → state name (used for place-of-supply display).
// Source: GST portal state list. Comprehensive enough for compliance UIs.
export const STATE_CODE_MAP: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan',
  '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '25': 'Daman and Diu', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep',
  '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory',
  '99': 'Centre Jurisdiction',
};

export const stateNameFromGstin = (gstin?: string | null): string | null => {
  const code = gstinStateCode(gstin);
  return code ? (STATE_CODE_MAP[code] ?? null) : null;
};

// ── Intra-state vs inter-state ─────────────────────────────────────────────
/**
 * Intra-state when seller and buyer state codes match → CGST + SGST split.
 * Inter-state otherwise → IGST.
 *
 * Returns null when one side has no GSTIN (e.g. unregistered vendor) — caller
 * should fall back to seller_state / place_of_supply text comparison.
 */
export const isIntraState = (sellerGstin?: string | null, buyerGstin?: string | null): boolean | null => {
  const s = gstinStateCode(sellerGstin);
  const b = gstinStateCode(buyerGstin);
  if (!s || !b) return null;
  return s === b;
};

/** Splits a total GST amount into CGST/SGST or IGST based on intra_state. */
export const splitGst = (
  gstAmount: number,
  intraState: boolean
): { cgst: number; sgst: number; igst: number } => {
  if (gstAmount <= 0) return { cgst: 0, sgst: 0, igst: 0 };
  if (intraState) {
    const half = Math.round((gstAmount / 2) * 100) / 100;
    // Pad rounding error onto SGST so the sum still equals gstAmount.
    const cgst = half;
    const sgst = Math.round((gstAmount - half) * 100) / 100;
    return { cgst, sgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: Math.round(gstAmount * 100) / 100 };
};

// ── Section 17(5) Blocked Credits ──────────────────────────────────────────
// Categories where ITC is explicitly disallowed under CGST Act §17(5).
// Used to auto-flag itc_eligible = false on bill / expense entry.
export const BLOCKED_ITC_CATEGORIES = [
  'food_beverages',
  'outdoor_catering',
  'beauty_treatment',
  'health_services',
  'cosmetic_plastic_surgery',
  'rent_a_cab',
  'life_health_insurance',
  'club_membership',
  'health_club',
  'fitness_centre',
  'travel_benefits_employees',
  'works_contract_immovable',  // unless plant/machinery
  'goods_services_personal_use',
  'motor_vehicles_passenger',  // unless transport business / driving school
  'gifts_free_samples',
  'csr_expenses',              // not in furtherance of business
  'lost_destroyed_stolen_goods',
] as const;

export type BlockedItcCategory = typeof BLOCKED_ITC_CATEGORIES[number];

export const isBlockedItcCategory = (category?: string | null): boolean => {
  if (!category) return false;
  const norm = category.toLowerCase().replace(/[\s-]+/g, '_');
  return BLOCKED_ITC_CATEGORIES.includes(norm as BlockedItcCategory);
};

// ── RCM categories ─────────────────────────────────────────────────────────
// Common RCM-applicable services under CGST Notification 13/2017 (services)
// and 4/2017 (goods). Used to suggest is_rcm = true on bill entry.
//
// Generic rule: if vendor is unregistered AND value > ₹5,000/day, RCM applies
// for a registered buyer (S.9(4)). Specific notified categories below apply
// regardless of vendor registration.
export const RCM_NOTIFIED_SERVICES = [
  'goods_transport_agency',           // GTA — most common
  'legal_services_advocate',
  'security_services',                // sec services to body corporate
  'sponsorship_services',
  'arbitral_tribunal',
  'director_services',                // director's remuneration if not salaried
  'insurance_agent_services',
  'recovery_agent_services',
  'copyright_artistic_literary',
  'lottery_distributor',
  'rent_residential_dwelling',        // if rented to registered person
  'cab_rental_non_corporate',
] as const;

export type RcmService = typeof RCM_NOTIFIED_SERVICES[number];

export const isRcmNotifiedService = (category?: string | null): boolean => {
  if (!category) return false;
  const norm = category.toLowerCase().replace(/[\s-]+/g, '_');
  return RCM_NOTIFIED_SERVICES.includes(norm as RcmService);
};

/**
 * Should this bill be flagged as RCM?
 *   1. Always TRUE for notified services (GTA, legal, security, etc.)
 *   2. TRUE for unregistered/composition vendors above ₹5,000/day threshold
 *      (S.9(4) for registered buyers — the threshold is configurable)
 *   3. Otherwise FALSE
 */
export const shouldFlagRcm = (opts: {
  category?: string | null;
  vendorGstStatus?: 'registered' | 'unregistered' | 'composition' | 'unknown' | null;
  amount?: number;
  rcmThreshold?: number; // default ₹5,000/day
}): boolean => {
  const threshold = opts.rcmThreshold ?? 5000;
  if (isRcmNotifiedService(opts.category)) return true;
  if ((opts.vendorGstStatus === 'unregistered' || opts.vendorGstStatus === 'composition')
      && (opts.amount ?? 0) > threshold) {
    return true;
  }
  return false;
};

// ── ITC reversal triggers ──────────────────────────────────────────────────
// Common reasons that flip itc_status from 'claimed' → 'reversed'.
export const ITC_REVERSAL_REASONS = {
  RULE_37_180_DAYS: 'Payment to vendor not made within 180 days (Rule 37 CGST)',
  GSTR1_NOT_FILED:  'Vendor did not file GSTR-1 (Rule 36(4))',
  CREDIT_NOTE:      'Vendor issued credit note',
  RULE_42_43:       'Pro-rata reversal under Rule 42/43 (mixed taxable/exempt)',
  S17_5_RECLASSIFIED: 'Reclassified as ineligible under S.17(5)',
  OTHER:            'Other (specify in note)',
} as const;

export type ItcReversalReasonKey = keyof typeof ITC_REVERSAL_REASONS;

// ── Helpers exposed for the bill form ──────────────────────────────────────

export interface ComputeGstResult {
  intra_state: boolean | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  rcm_amount: number;     // GST that buyer self-assesses (=gstAmount when is_rcm)
}

/**
 * One-stop for the bill form: given the basic inputs, compute the full GST
 * decomposition. Falls back gracefully when GSTINs aren't both present.
 */
export const computeBillGst = (input: {
  taxable_amount: number;
  gst_rate: number;             // overall rate, e.g. 18
  cess_amount?: number;
  seller_gstin?: string | null;
  buyer_gstin?: string | null;
  seller_state?: string | null;
  place_of_supply?: string | null;
  is_rcm?: boolean;
}): ComputeGstResult => {
  const gstAmount = Math.round((input.taxable_amount * input.gst_rate / 100) * 100) / 100;

  let intraState = isIntraState(input.seller_gstin, input.buyer_gstin);
  if (intraState === null && input.seller_state && input.place_of_supply) {
    intraState = input.seller_state.trim().toLowerCase() === input.place_of_supply.trim().toLowerCase();
  }
  // Default: assume intra-state when we can't tell. Caller can override.
  const isIntra = intraState ?? true;

  const split = splitGst(gstAmount, isIntra);
  return {
    intra_state: intraState,
    cgst: split.cgst,
    sgst: split.sgst,
    igst: split.igst,
    cess: input.cess_amount ?? 0,
    rcm_amount: input.is_rcm ? gstAmount : 0,
  };
};

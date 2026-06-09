import { supabase } from '@/lib/supabase';

export type TdsAlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type TdsSection =
  | '192' | '194A' | '194C' | '194C-2' | '194H' | '194I-B' | '194I-P'
  | '194J' | '194J-T' | '194Q' | '194O' | '194R' | '195' | '194D'
  | '194LA' | '194N';

export interface TdsCompanyConfig {
  user_id: string;
  tan: string | null;
  pan: string | null;
  deductor_type: string | null;
  filing_frequency: 'monthly' | 'quarterly' | null;
  responsible_person: string | null;
  responsible_pan: string | null;
  responsible_email: string | null;
  responsible_mobile: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  default_assessment_year: string | null;
  default_fiscal_year: string | null;
  ack_no: string | null;
  ack_date: string | null;
}

export interface TdsVendorConfig {
  id?: string;
  user_id?: string;
  vendor_id: string | null;
  pan: string | null;
  tds_applicable: boolean;
  default_section: string | null;
  default_rate: number | null;
  threshold_amount: number | null;
  ldc_certificate_no: string | null;
  ldc_rate: number | null;
  ldc_valid_from: string | null;
  ldc_valid_to: string | null;
  exemption_status: 'none' | 'full_exempt' | '15g' | '15h' | 'partial' | 'nil_rate' | null;
  nature_of_payment: string | null;
  is_active: boolean;
  notes: string | null;
}

export interface TdsComputation {
  tds_applicable: boolean;
  section: string;
  rate: number;
  tds_amount: number;
  net_payable: number;
  threshold: number;
  year_paid: number;
  threshold_crossed: boolean;
  rate_source: string;
  vendor_pan?: string | null;
  reason?: string;
}

export interface TdsDashboard {
  fiscal_year: string;
  total_deducted: number;
  total_paid: number;
  payable: number;
  challan_count: number;
  section_breakup: Array<{ section: string; tds_amount: number; gross_amount: number; count: number }>;
  quarter_breakup: Array<{ quarter: string; tds_amount: number; challan_amount: number }>;
  returns_status: Array<{
    form_type: string; quarter: string; status: string;
    due_date: string | null; filed_date: string | null;
    total_tds: number; total_deductees: number;
  }>;
}

export interface TdsReconciliation {
  fiscal_year: string;
  quarter: string | null;
  books: number;
  challans: number;
  returns: number;
  form_26as: number;
  findings: Array<{
    finding: string; severity: string;
    books?: number; challans?: number; returns?: number;
    '26as'?: number; diff: number; description: string;
  }>;
  all_reconciled: boolean;
}

export interface ItcIntelligence {
  period: string;
  window_start: string;
  window_end: string;
  eligible_itc: number;
  blocked_itc: number;
  capital_goods: number;
  rcm_itc: number;
  input_services: number;
  reversed_itc: number;
  claimed_itc: number;
  pending_itc: number;
  lost_itc: number;
  journal_itc: number;
  vendor_risk_count: number;
  recommendations: Array<{ type: string; message: string; severity: string; amount?: number; count?: number }>;
}

export interface ItrAutoPopulate {
  workspace_id: string;
  fiscal_year: string;
  assessment_year: string;
  entity_type: string;
  itr_form: string;
  pnl: any;
  gst: any;
  tds: any;
  assets: any;
  liabilities: any;
  tax_computation: {
    tax_rate: number;
    gross_revenue: number;
    total_expenses: number;
    net_profit: number;
    taxable_income: number;
    tax_payable: number;
    tds_credit: number;
    net_tax_liability: number;
  };
}

export interface ComplianceScore {
  fiscal_year: string;
  overall_score: number;
  grade: string;
  breakdown: {
    tds_score: number;
    itc_score: number;
    gst_score: number;
    itr_score: number;
    calendar_score: number;
  };
}

export interface FilingReadiness {
  fiscal_year: string;
  filings: Array<{
    filing: string;
    category: string;
    status: 'ready' | 'pending';
    readiness_pct: number;
  }>;
}

export interface TaxComplianceCenterOverview {
  fiscal_year: string;
  score: ComplianceScore;
  tds: TdsDashboard;
  itc: ItcIntelligence;
  readiness: FilingReadiness;
  alerts: Array<{
    id: string; alert_type: string; severity: TdsAlertSeverity;
    title: string; description: string; recommended_action: string;
    source_module: string; monetary_impact: number | null;
    due_date: string | null; status: string; created_at: string;
  }>;
}

export const currentFy = (): string => {
  const d = new Date();
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  const startY = m >= 4 ? y : y - 1;
  return `${startY}-${(startY + 1).toString().slice(2)}`;
};

export async function fetchTaxComplianceCenterOverview(userId: string, fy?: string): Promise<TaxComplianceCenterOverview> {
  const { data, error } = await supabase.rpc('tax_compliance_center_overview', {
    p_user_id: userId, p_fiscal_year: fy ?? currentFy(),
  });
  if (error) throw error;
  return data as TaxComplianceCenterOverview;
}

export async function fetchTdsCompanyConfig(userId: string): Promise<TdsCompanyConfig | null> {
  const { data, error } = await supabase
    .from('tds_company_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as TdsCompanyConfig | null;
}

export async function upsertTdsCompanyConfig(userId: string, payload: Partial<TdsCompanyConfig>): Promise<TdsCompanyConfig> {
  const { data, error } = await supabase
    .from('tds_company_config')
    .upsert({ ...payload, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data as TdsCompanyConfig;
}

export async function fetchTdsVendorConfigs(userId: string): Promise<TdsVendorConfig[]> {
  const { data, error } = await supabase
    .from('tds_vendor_master')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as TdsVendorConfig[];
}

export async function upsertTdsVendorConfig(
  userId: string, payload: Partial<TdsVendorConfig>,
): Promise<TdsVendorConfig> {
  const row = { ...payload, user_id: userId, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('tds_vendor_master')
    .upsert(row, { onConflict: 'user_id,vendor_id' })
    .select()
    .single();
  if (error) throw error;
  return data as TdsVendorConfig;
}

export async function computeTdsForAmount(
  userId: string,
  amount: number,
  section: string,
  vendorId?: string | null,
  paymentDate?: string,
): Promise<TdsComputation> {
  const { data, error } = await supabase.rpc('tds_compute_for_amount', {
    p_user_id: userId,
    p_amount: amount,
    p_section: section,
    p_vendor_id: vendorId ?? null,
    p_payment_date: paymentDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as TdsComputation;
}

export async function fetchTdsDashboard(userId: string, fy?: string): Promise<TdsDashboard> {
  const { data, error } = await supabase.rpc('tds_engine_dashboard', {
    p_user_id: userId, p_fiscal_year: fy ?? currentFy(),
  });
  if (error) throw error;
  return data as TdsDashboard;
}

export async function fetchTdsReconciliation(userId: string, fy: string, quarter?: string | null): Promise<TdsReconciliation> {
  const { data, error } = await supabase.rpc('tds_reconcile_books_vs_returns', {
    p_user_id: userId, p_fiscal_year: fy, p_quarter: quarter ?? null,
  });
  if (error) throw error;
  return data as TdsReconciliation;
}

export async function listTdsChallans(userId: string, fy?: string) {
  let q = supabase.from('tds_challans').select('*').eq('user_id', userId);
  if (fy) q = q.eq('fiscal_year', fy);
  const { data, error } = await q.order('challan_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTdsChallan(userId: string, payload: any) {
  const { data, error } = await supabase
    .from('tds_challans')
    .insert({ ...payload, user_id: userId })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listTdsReturns(userId: string, fy?: string) {
  let q = supabase.from('tds_returns').select('*').eq('user_id', userId);
  if (fy) q = q.eq('fiscal_year', fy);
  const { data, error } = await q.order('quarter');
  if (error) throw error;
  return data ?? [];
}

export async function listTdsCertificates(userId: string, fy?: string) {
  let q = supabase.from('tds_certificates').select('*').eq('user_id', userId);
  if (fy) q = q.eq('fiscal_year', fy);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchItcIntelligenceSummary(userId: string, period?: string): Promise<ItcIntelligence> {
  const { data, error } = await supabase.rpc('itc_intelligence_summary', {
    p_user_id: userId, p_period: period ?? null,
  });
  if (error) throw error;
  return data as ItcIntelligence;
}

export async function classifyItcPurchase(userId: string, amount: number, opts: {
  hsn?: string | null; vendorId?: string | null; isCapital?: boolean; isService?: boolean;
}) {
  const { data, error } = await supabase.rpc('itc_classify_purchase', {
    p_user_id: userId, p_amount: amount,
    p_hsn: opts.hsn ?? null, p_vendor_id: opts.vendorId ?? null,
    p_is_capital: !!opts.isCapital, p_is_service: !!opts.isService,
  });
  if (error) throw error;
  return data as {
    classification: 'eligible' | 'blocked' | 'capital_goods' | 'input_services' | 'rcm' | 'ineligible';
    blocked: boolean; block_reason: string | null;
    rcm_applicable: boolean; vendor_gstin: string | null;
    reason_code: string;
  };
}

export async function autopopulateItr(userId: string, fy: string, entityType: string): Promise<ItrAutoPopulate> {
  const { data, error } = await supabase.rpc('itr_autopopulate', {
    p_user_id: userId, p_fiscal_year: fy, p_entity_type: entityType,
  });
  if (error) throw error;
  return data as ItrAutoPopulate;
}

export async function validateItr(userId: string, fy: string) {
  const { data, error } = await supabase.rpc('itr_validate', {
    p_user_id: userId, p_fiscal_year: fy,
  });
  if (error) throw error;
  return data as {
    fiscal_year: string;
    findings: Array<{ check: string; severity: string; passed: boolean; description: string; detail?: any }>;
    all_passed: boolean;
  };
}

export async function fetchComplianceScore(userId: string, fy?: string): Promise<ComplianceScore> {
  const { data, error } = await supabase.rpc('tax_compliance_score', {
    p_user_id: userId, p_fiscal_year: fy ?? currentFy(),
  });
  if (error) throw error;
  return data as ComplianceScore;
}

export async function runTaxIntelligenceScan(userId: string, fy?: string) {
  const { data, error } = await supabase.rpc('tax_intelligence_scan', {
    p_user_id: userId, p_fiscal_year: fy ?? currentFy(),
  });
  if (error) throw error;
  return data;
}

export async function listTaxComplianceAlerts(userId: string) {
  const { data, error } = await supabase
    .from('tax_compliance_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function updateTaxAlertStatus(id: string, status: 'open' | 'acknowledged' | 'resolved' | 'snoozed' | 'dismissed') {
  const { error } = await supabase
    .from('tax_compliance_alerts')
    .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function listItcClassifications(userId: string, period?: string) {
  let q = supabase.from('itc_classifications').select('*').eq('user_id', userId);
  if (period) q = q.eq('claim_period', period);
  const { data, error } = await q.order('invoice_date', { ascending: false }).limit(500);
  if (error) throw error;
  return data ?? [];
}

export async function listItrWorkspaces(userId: string) {
  const { data, error } = await supabase
    .from('itr_workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('fiscal_year', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// ════════════════════════════════════════════════════════════════════════
// Phase 32 — Address Management + GST POS + TCS + Unified Tax Determination
// ════════════════════════════════════════════════════════════════════════

export interface PartyAddress {
  id?: string;
  user_id?: string;
  party_type: 'customer' | 'vendor';
  party_id: string;
  address_type: 'billing' | 'shipping';
  label: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  state_code: string | null;
  country: string;
  pincode: string | null;
  gstin: string | null;
  is_default: boolean;
  is_active: boolean;
  notes: string | null;
}

export async function listPartyAddresses(
  userId: string,
  partyType: 'customer' | 'vendor',
  partyId: string,
): Promise<PartyAddress[]> {
  const { data, error } = await supabase
    .from('party_addresses')
    .select('*')
    .eq('user_id', userId)
    .eq('party_type', partyType)
    .eq('party_id', partyId)
    .order('address_type')
    .order('is_default', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PartyAddress[];
}

export async function upsertPartyAddress(userId: string, payload: Partial<PartyAddress>): Promise<PartyAddress> {
  const row = { ...payload, user_id: userId, updated_at: new Date().toISOString() };
  // If this is being made default, clear other defaults first
  if (payload.is_default && payload.party_id && payload.party_type && payload.address_type) {
    await supabase
      .from('party_addresses')
      .update({ is_default: false })
      .eq('user_id', userId)
      .eq('party_type', payload.party_type)
      .eq('party_id', payload.party_id)
      .eq('address_type', payload.address_type);
  }
  const { data, error } = payload.id
    ? await supabase.from('party_addresses').update(row).eq('id', payload.id).select().single()
    : await supabase.from('party_addresses').insert(row).select().single();
  if (error) throw error;
  return data as PartyAddress;
}

export async function deletePartyAddress(id: string) {
  const { error } = await supabase.from('party_addresses').delete().eq('id', id);
  if (error) throw error;
}

// GST POS / rate / unified
export async function resolvePlaceOfSupply(opts: {
  userId: string;
  supplierState?: string | null; billingState?: string | null; shippingState?: string | null;
  isService?: boolean; recipientCountry?: string;
}) {
  const { data, error } = await supabase.rpc('gst_place_of_supply', {
    p_user_id: opts.userId,
    p_supplier_state: opts.supplierState ?? null,
    p_billing_state: opts.billingState ?? null,
    p_shipping_state: opts.shippingState ?? null,
    p_is_service: !!opts.isService,
    p_recipient_country: opts.recipientCountry ?? 'India',
  });
  if (error) throw error;
  return data as {
    pos_state: string | null;
    supplier_state?: string | null;
    treatment: 'intra_state' | 'inter_state' | 'export' | 'unknown';
    reason: string;
    gst_required: boolean;
    apply_cgst_sgst?: boolean;
    apply_igst?: boolean;
  };
}

export async function resolveGstRate(hsn?: string | null, override?: number | null) {
  const { data, error } = await supabase.rpc('gst_rate_resolve', {
    p_hsn: hsn ?? null,
    p_category: null,
    p_override: override ?? null,
  });
  if (error) throw error;
  return data as { rate: number; hsn: string | null; matched_prefix: string; source: string };
}

export interface UnifiedTaxResult {
  transaction_type: 'sale' | 'purchase';
  amount: number;
  place_of_supply: {
    pos_state: string | null; treatment: string; reason: string;
    apply_cgst_sgst?: boolean; apply_igst?: boolean;
  };
  gst: { rate: number; treatment: string; cgst: number; sgst: number; igst: number; total: number; rate_source: string };
  tds: any | null;
  tcs: any | null;
  itc: any | null;
  rcm: boolean;
  totals: {
    taxable_value: number; gst_total: number; tds_amount: number; tcs_amount: number;
    gross_payable_for_purchase: number; invoice_total_for_sale: number;
  };
}

export async function determineTaxUnified(opts: {
  userId: string;
  transactionType: 'sale' | 'purchase';
  amount: number;
  partyId?: string | null;
  partyType?: 'customer' | 'vendor' | null;
  hsn?: string | null;
  isService?: boolean;
  isCapital?: boolean;
  supplierState?: string | null;
  billingState?: string | null;
  shippingState?: string | null;
  recipientCountry?: string;
  tdsSection?: string | null;
  tcsSection?: string | null;
  gstOverride?: number | null;
  log?: boolean;
}): Promise<UnifiedTaxResult> {
  const { data, error } = await supabase.rpc('tax_determine_unified', {
    p_user_id: opts.userId,
    p_transaction_type: opts.transactionType,
    p_amount: opts.amount,
    p_party_id: opts.partyId ?? null,
    p_party_type: opts.partyType ?? null,
    p_hsn: opts.hsn ?? null,
    p_is_service: !!opts.isService,
    p_is_capital: !!opts.isCapital,
    p_supplier_state: opts.supplierState ?? null,
    p_billing_state: opts.billingState ?? null,
    p_shipping_state: opts.shippingState ?? null,
    p_recipient_country: opts.recipientCountry ?? 'India',
    p_tds_section: opts.tdsSection ?? null,
    p_tcs_section: opts.tcsSection ?? null,
    p_gst_override: opts.gstOverride ?? null,
    p_log: !!opts.log,
  });
  if (error) throw error;
  return data as UnifiedTaxResult;
}

// TCS
export async function computeTcsForAmount(opts: {
  userId: string; amount: number; section: string;
  customerId?: string | null; customerPan?: string | null; paymentDate?: string;
}) {
  const { data, error } = await supabase.rpc('tcs_compute_for_amount', {
    p_user_id: opts.userId,
    p_amount: opts.amount,
    p_section: opts.section,
    p_customer_id: opts.customerId ?? null,
    p_customer_pan: opts.customerPan ?? null,
    p_payment_date: opts.paymentDate ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw error;
  return data as any;
}

export async function fetchTcsDashboard(userId: string, fy?: string) {
  const { data, error } = await supabase.rpc('tcs_engine_dashboard', {
    p_user_id: userId, p_fiscal_year: fy ?? currentFy(),
  });
  if (error) throw error;
  return data as any;
}

export async function fetchTcsCompanyConfig(userId: string) {
  const { data, error } = await supabase
    .from('tcs_company_config')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertTcsCompanyConfig(userId: string, payload: any) {
  const { data, error } = await supabase
    .from('tcs_company_config')
    .upsert({ ...payload, user_id: userId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listTcsChallans(userId: string, fy?: string) {
  let q = supabase.from('tcs_challans').select('*').eq('user_id', userId);
  if (fy) q = q.eq('fiscal_year', fy);
  const { data, error } = await q.order('challan_date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createTcsChallan(userId: string, payload: any) {
  const { data, error } = await supabase
    .from('tcs_challans')
    .insert({ ...payload, user_id: userId })
    .select().single();
  if (error) throw error;
  return data;
}

// GSTR-1 / GSTR-3B automation
export async function generateGstr1(userId: string, period: string) {
  const { data, error } = await supabase.rpc('gstr1_auto_generate', {
    p_user_id: userId, p_period: period,
  });
  if (error) throw error;
  return data as any;
}

export async function generateGstr3b(userId: string, period: string) {
  const { data, error } = await supabase.rpc('gstr3b_auto_generate', {
    p_user_id: userId, p_period: period,
  });
  if (error) throw error;
  return data as any;
}

export async function validateGstr1(userId: string, period: string) {
  const { data, error } = await supabase.rpc('gstr1_validate', {
    p_user_id: userId, p_period: period,
  });
  if (error) throw error;
  return data as any;
}

export async function fetchGstComplianceCenterOverview(userId: string, period: string) {
  const { data, error } = await supabase.rpc('gst_compliance_center_overview', {
    p_user_id: userId,
    p_period: period,
  });
  if (error) throw error;
  return data as any;
}

export async function fetchErpTaxReportsBundle(userId: string, fy: string, period: string) {
  const { data, error } = await supabase.rpc('erp_tax_reports_bundle', {
    p_user_id: userId,
    p_fiscal_year: fy,
    p_period: period,
  });
  if (error) throw error;
  return data as any;
}

export async function seedTcsComplianceCalendar(userId: string, fy: string) {
  const { data, error } = await supabase.rpc('seed_tcs_compliance_calendar', {
    p_user_id: userId,
    p_fiscal_year: fy,
  });
  if (error) throw error;
  return data as number;
}

export async function ensureDefaultPartyAddresses(opts: {
  userId: string;
  partyType: 'customer' | 'vendor';
  partyId: string;
  sameShippingAsBilling?: boolean;
}) {
  const { data, error } = await supabase.rpc('ensure_default_party_addresses', {
    p_user_id: opts.userId,
    p_party_type: opts.partyType,
    p_party_id: opts.partyId,
    p_same_shipping_as_billing: opts.sameShippingAsBilling ?? true,
  });
  if (error) throw error;
  return data as { billing_address_id: string; shipping_address_id: string | null; same_shipping_as_billing: boolean };
}

// GST state list helper (in-app constant — DB view also available)
export const GST_STATES: { code: string; name: string }[] = [
  { code: '01', name: 'Jammu and Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
  { code: '38', name: 'Ladakh' }, { code: '97', name: 'Other Territory' },
];

-- ============================================================================
-- PHASE 34 - ENTERPRISE TAX COMPLIANCE WORKFLOWS
-- ----------------------------------------------------------------------------
-- Builds on Phase 31/32 by adding the missing connective tissue requested for
-- enterprise-grade address, GST, TDS/TCS, challan, calendar and reporting
-- workflows.
--
--   1. Customer/vendor master fields for legal/trade name, GST/PAN, POS.
--   2. Default billing/shipping address automation and same-as-billing helper.
--   3. Delivery challan type + source-chain links + shipping address linkage.
--   4. POS override RPC with audit trail.
--   5. GST compliance center overview from live GSTR/ITC/recon/calendar data.
--   6. TCS calendar obligations and unified ERP tax-report bundle.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Party master enhancements
-- ---------------------------------------------------------------------------

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_shipping_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gst_registration_state TEXT,
  ADD COLUMN IF NOT EXISTS gst_registration_state_code TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_state TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code TEXT,
  ADD COLUMN IF NOT EXISTS tcs_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tcs_section TEXT;

ALTER TABLE vendors
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS trade_name TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS contact_person TEXT,
  ADD COLUMN IF NOT EXISTS billing_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_shipping_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gst_registration_state TEXT,
  ADD COLUMN IF NOT EXISTS gst_registration_state_code TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_state TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code TEXT,
  ADD COLUMN IF NOT EXISTS tds_default_section TEXT,
  ADD COLUMN IF NOT EXISTS tds_default_rate NUMERIC(6,3),
  ADD COLUMN IF NOT EXISTS tds_threshold_amount NUMERIC(18,2);

CREATE INDEX IF NOT EXISTS idx_clients_gstin ON clients(user_id, gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vendors_gstin ON vendors(user_id, gstin) WHERE gstin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_pos_state ON clients(user_id, place_of_supply_state_code);
CREATE INDEX IF NOT EXISTS idx_vendors_pos_state ON vendors(user_id, place_of_supply_state_code);

-- ---------------------------------------------------------------------------
-- 2. Address automation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION normalize_gstin_state_code(p_gstin TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_gstin IS NULL OR length(trim(p_gstin)) < 2 THEN NULL
              ELSE substring(upper(trim(p_gstin)) from 1 for 2) END;
$$;

CREATE OR REPLACE FUNCTION sync_party_master_from_default_address()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_default = TRUE THEN
    IF NEW.party_type = 'customer' THEN
      IF NEW.address_type = 'billing' THEN
        UPDATE clients
           SET billing_address_id = NEW.id,
               gstin = COALESCE(NULLIF(NEW.gstin, ''), gstin),
               gst_registration_state = COALESCE(NEW.state, gst_registration_state),
               gst_registration_state_code = COALESCE(NEW.state_code, normalize_gstin_state_code(NULLIF(NEW.gstin, '')), gst_registration_state_code),
               place_of_supply_state = COALESCE(place_of_supply_state, NEW.state),
               place_of_supply_state_code = COALESCE(place_of_supply_state_code, NEW.state_code)
         WHERE id = NEW.party_id AND user_id = NEW.user_id;
      ELSE
        UPDATE clients
           SET default_shipping_address_id = NEW.id,
               place_of_supply_state = COALESCE(NEW.state, place_of_supply_state),
               place_of_supply_state_code = COALESCE(NEW.state_code, place_of_supply_state_code)
         WHERE id = NEW.party_id AND user_id = NEW.user_id;
      END IF;
    ELSE
      IF NEW.address_type = 'billing' THEN
        UPDATE vendors
           SET billing_address_id = NEW.id,
               gstin = COALESCE(NULLIF(NEW.gstin, ''), NULLIF(gst_number, ''), gstin),
               gst_registration_state = COALESCE(NEW.state, gst_registration_state),
               gst_registration_state_code = COALESCE(NEW.state_code, normalize_gstin_state_code(NULLIF(NEW.gstin, '')), gst_registration_state_code),
               place_of_supply_state = COALESCE(place_of_supply_state, NEW.state),
               place_of_supply_state_code = COALESCE(place_of_supply_state_code, NEW.state_code)
         WHERE id = NEW.party_id AND user_id = NEW.user_id;
      ELSE
        UPDATE vendors
           SET default_shipping_address_id = NEW.id,
               place_of_supply_state = COALESCE(NEW.state, place_of_supply_state),
               place_of_supply_state_code = COALESCE(NEW.state_code, place_of_supply_state_code)
         WHERE id = NEW.party_id AND user_id = NEW.user_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_party_address_sync_master ON party_addresses;
CREATE TRIGGER trg_party_address_sync_master
  AFTER INSERT OR UPDATE OF is_default, address_type, state, state_code, gstin
  ON party_addresses
  FOR EACH ROW EXECUTE FUNCTION sync_party_master_from_default_address();

CREATE OR REPLACE FUNCTION ensure_default_party_addresses(
  p_user_id TEXT,
  p_party_type TEXT,
  p_party_id UUID,
  p_same_shipping_as_billing BOOLEAN DEFAULT TRUE
) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE
  v_name TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_address TEXT;
  v_state TEXT;
  v_gstin TEXT;
  v_billing_id UUID;
  v_shipping_id UUID;
BEGIN
  IF p_party_type = 'customer' THEN
    SELECT COALESCE(NULLIF(legal_name, ''), NULLIF(company_name, ''), NULLIF(display_name, ''), name),
           email, phone, address, COALESCE(place_of_supply_state, gst_registration_state), gstin
      INTO v_name, v_email, v_phone, v_address, v_state, v_gstin
    FROM clients WHERE id = p_party_id AND user_id = p_user_id;
  ELSIF p_party_type = 'vendor' THEN
    SELECT COALESCE(NULLIF(legal_name, ''), NULLIF(company_name, ''), name),
           email, phone, address, COALESCE(place_of_supply_state, gst_registration_state, state),
           COALESCE(gstin, gst_number)
      INTO v_name, v_email, v_phone, v_address, v_state, v_gstin
    FROM vendors WHERE id = p_party_id AND user_id = p_user_id;
  ELSE
    RAISE EXCEPTION 'party_type must be customer or vendor';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Party not found for address bootstrap.';
  END IF;

  SELECT id INTO v_billing_id
  FROM party_addresses
  WHERE user_id = p_user_id
    AND party_type = p_party_type
    AND party_id = p_party_id
    AND address_type = 'billing'
    AND is_default = TRUE
  LIMIT 1;

  IF v_billing_id IS NULL THEN
    INSERT INTO party_addresses (
      user_id, party_type, party_id, address_type, label,
      contact_person, contact_phone, contact_email,
      address_line1, state, state_code, country, gstin, is_default
    )
    VALUES (
      p_user_id, p_party_type, p_party_id, 'billing', 'Primary Billing',
      v_name, v_phone, v_email,
      COALESCE(NULLIF(v_address, ''), 'Address pending'),
      v_state, normalize_gstin_state_code(v_gstin), 'India', v_gstin, TRUE
    )
    RETURNING id INTO v_billing_id;
  END IF;

  IF p_same_shipping_as_billing THEN
    SELECT id INTO v_shipping_id
    FROM party_addresses
    WHERE user_id = p_user_id
      AND party_type = p_party_type
      AND party_id = p_party_id
      AND address_type = 'shipping'
      AND is_default = TRUE
    LIMIT 1;

    IF v_shipping_id IS NULL THEN
      INSERT INTO party_addresses (
        user_id, party_type, party_id, address_type, label,
        contact_person, contact_phone, contact_email,
        address_line1, address_line2, city, district, state, state_code,
        country, pincode, gstin, is_default, notes
      )
      SELECT
        user_id, party_type, party_id, 'shipping', 'Primary Shipping',
        contact_person, contact_phone, contact_email,
        address_line1, address_line2, city, district, state, state_code,
        country, pincode, gstin, TRUE, 'Copied from default billing address.'
      FROM party_addresses
      WHERE id = v_billing_id
      RETURNING id INTO v_shipping_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'billing_address_id', v_billing_id,
    'shipping_address_id', v_shipping_id,
    'same_shipping_as_billing', p_same_shipping_as_billing
  );
END;
$$;

GRANT EXECUTE ON FUNCTION ensure_default_party_addresses(TEXT, TEXT, UUID, BOOLEAN) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 3. Delivery challan enterprise fields and source-chain links
-- ---------------------------------------------------------------------------

ALTER TABLE delivery_challans
  ADD COLUMN IF NOT EXISTS challan_type TEXT NOT NULL DEFAULT 'sales_delivery'
    CHECK (challan_type IN ('sales_delivery','job_work','branch_transfer','return_challan')),
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS vendor_id UUID,
  ADD COLUMN IF NOT EXISTS billing_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipping_address_id UUID REFERENCES party_addresses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS quotation_id UUID,
  ADD COLUMN IF NOT EXISTS sales_order_id UUID,
  ADD COLUMN IF NOT EXISTS invoice_id UUID,
  ADD COLUMN IF NOT EXISTS branch_from_id UUID,
  ADD COLUMN IF NOT EXISTS branch_to_id UUID,
  ADD COLUMN IF NOT EXISTS place_of_supply_state TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply_state_code TEXT,
  ADD COLUMN IF NOT EXISTS gst_treatment TEXT CHECK (gst_treatment IS NULL OR gst_treatment IN ('intra_state','inter_state','export','unknown')),
  ADD COLUMN IF NOT EXISTS eway_bill_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS eway_bill_number TEXT,
  ADD COLUMN IF NOT EXISTS inventory_reservation_status TEXT NOT NULL DEFAULT 'not_reserved'
    CHECK (inventory_reservation_status IN ('not_reserved','reserved','released','fulfilled'));

CREATE INDEX IF NOT EXISTS idx_delivery_challans_chain
  ON delivery_challans(user_id, quotation_id, sales_order_id, invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_challans_type
  ON delivery_challans(user_id, challan_type, delivery_status);

CREATE OR REPLACE FUNCTION stamp_delivery_challan_tax_context()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_bill party_addresses%ROWTYPE;
  v_ship party_addresses%ROWTYPE;
  v_pos JSONB;
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    IF NEW.billing_address_id IS NULL THEN
      SELECT billing_address_id INTO NEW.billing_address_id
      FROM clients WHERE id = NEW.customer_id AND user_id = NEW.user_id;
    END IF;
    IF NEW.shipping_address_id IS NULL THEN
      SELECT default_shipping_address_id INTO NEW.shipping_address_id
      FROM clients WHERE id = NEW.customer_id AND user_id = NEW.user_id;
    END IF;
  END IF;

  IF NEW.billing_address_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM party_addresses WHERE id = NEW.billing_address_id;
  END IF;
  IF NEW.shipping_address_id IS NOT NULL THEN
    SELECT * INTO v_ship FROM party_addresses WHERE id = NEW.shipping_address_id;
  END IF;

  IF v_bill.id IS NOT NULL OR v_ship.id IS NOT NULL THEN
    v_pos := gst_place_of_supply(
      NEW.user_id,
      NULL,
      COALESCE(v_bill.state, v_bill.state_code),
      COALESCE(v_ship.state, v_ship.state_code),
      FALSE,
      COALESCE(v_ship.country, v_bill.country, 'India')
    );
    NEW.place_of_supply_state := COALESCE(v_pos->>'pos_state', NEW.place_of_supply_state);
    NEW.gst_treatment := COALESCE(v_pos->>'treatment', NEW.gst_treatment);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_challan_tax_context ON delivery_challans;
CREATE TRIGGER trg_delivery_challan_tax_context
  BEFORE INSERT OR UPDATE OF customer_id, billing_address_id, shipping_address_id, challan_type
  ON delivery_challans
  FOR EACH ROW EXECUTE FUNCTION stamp_delivery_challan_tax_context();

-- ---------------------------------------------------------------------------
-- 4. Place-of-supply manual override with audit trail
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION override_place_of_supply(
  p_user_id TEXT,
  p_source_type TEXT,
  p_source_id UUID,
  p_override_pos_state TEXT,
  p_reason TEXT,
  p_overridden_by TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_derived TEXT;
BEGIN
  IF COALESCE(trim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required for place-of-supply override.';
  END IF;

  IF p_source_type = 'delivery_challan' THEN
    SELECT place_of_supply_state INTO v_derived
    FROM delivery_challans
    WHERE id = p_source_id AND user_id = p_user_id;

    UPDATE delivery_challans
       SET place_of_supply_state = p_override_pos_state,
           gst_treatment = NULL
     WHERE id = p_source_id AND user_id = p_user_id;
  ELSE
    SELECT pos_state INTO v_derived
    FROM tax_determination_log
    WHERE user_id = p_user_id AND source_type = p_source_type AND source_id = p_source_id
    ORDER BY determined_at DESC
    LIMIT 1;
  END IF;

  INSERT INTO place_of_supply_log (
    user_id, source_type, source_id, derived_pos_state,
    override_pos_state, reason, overridden_by
  )
  VALUES (
    p_user_id, p_source_type, p_source_id, v_derived,
    p_override_pos_state, p_reason, p_overridden_by
  );
END;
$$;

GRANT EXECUTE ON FUNCTION override_place_of_supply(TEXT, TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Central GST compliance center and report bundle
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION gst_compliance_center_overview(
  p_user_id TEXT,
  p_period TEXT DEFAULT to_char(CURRENT_DATE, 'YYYY-MM')
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_gstr1 JSONB;
  v_gstr3b JSONB;
  v_validation JSONB;
  v_recon JSONB;
  v_itc JSONB;
  v_calendar JSONB;
  v_fy TEXT := CASE WHEN EXTRACT(MONTH FROM to_date(p_period || '-01', 'YYYY-MM-DD')) >= 4
                    THEN EXTRACT(YEAR FROM to_date(p_period || '-01', 'YYYY-MM-DD'))::TEXT || '-' ||
                         RIGHT((EXTRACT(YEAR FROM to_date(p_period || '-01', 'YYYY-MM-DD')) + 1)::TEXT, 2)
                    ELSE (EXTRACT(YEAR FROM to_date(p_period || '-01', 'YYYY-MM-DD')) - 1)::TEXT || '-' ||
                         RIGHT(EXTRACT(YEAR FROM to_date(p_period || '-01', 'YYYY-MM-DD'))::TEXT, 2)
               END;
BEGIN
  v_gstr1 := gstr1_auto_generate(p_user_id, p_period);
  v_gstr3b := gstr3b_auto_generate(p_user_id, p_period);
  v_validation := gstr1_validate(p_user_id, p_period);
  v_recon := get_three_way_gst_reconciliation(p_user_id, p_period);
  v_itc := itc_intelligence_summary(p_user_id, p_period);
  v_calendar := get_compliance_calendar(p_user_id, v_fy);

  RETURN jsonb_build_object(
    'period', p_period,
    'fiscal_year', v_fy,
    'gst_liability', COALESCE((v_gstr3b->>'tax_liability')::numeric, 0),
    'available_itc', COALESCE((v_gstr3b->>'eligible_itc')::numeric, 0),
    'net_gst_payable', COALESCE((v_gstr3b->>'net_payable')::numeric, 0),
    'pending_filings', COALESCE((v_calendar->>'total_obligations')::int, 0) - COALESCE((v_calendar->>'filed_count')::int, 0),
    'upcoming_due_dates', v_calendar->'obligations',
    'reconciliation_status', jsonb_build_object(
      'gst_recon_summary', v_recon->'summary',
      'gstr1_valid', v_validation->>'is_valid',
      'findings', v_validation->'findings'
    ),
    'gstr1', v_gstr1,
    'gstr3b', v_gstr3b,
    'itc', v_itc,
    'computed_at', NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION erp_tax_reports_bundle(
  p_user_id TEXT,
  p_fiscal_year TEXT,
  p_period TEXT DEFAULT to_char(CURRENT_DATE, 'YYYY-MM')
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'period', p_period,
    'gst', jsonb_build_object(
      'gstr1', gstr1_auto_generate(p_user_id, p_period),
      'gstr3b', gstr3b_auto_generate(p_user_id, p_period),
      'itc_report', itc_intelligence_summary(p_user_id, p_period),
      'gst_reconciliation', get_three_way_gst_reconciliation(p_user_id, p_period),
      'gst_liability_report', get_gstr2b_reconciliation(p_user_id, p_period)
    ),
    'tds', jsonb_build_object(
      'tds_register', tds_engine_dashboard(p_user_id, p_fiscal_year),
      'tds_payable_report', tds_reconcile_books_vs_returns(p_user_id, p_fiscal_year, NULL),
      'deductee_report', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'vendor_id', vendor_id,
          'vendor_pan', vendor_pan,
          'section', section,
          'gross_amount', gross_amount,
          'tds_amount', tds_amount,
          'status', status
        ) ORDER BY computed_at DESC)
        FROM tds_auto_deductions
        WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
      ), '[]'::jsonb)
    ),
    'tcs', jsonb_build_object(
      'tcs_register', tcs_engine_dashboard(p_user_id, p_fiscal_year),
      'tcs_collection_report', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'customer_id', customer_id,
          'customer_pan', customer_pan,
          'section', section,
          'gross_amount', gross_amount,
          'tcs_amount', tcs_amount,
          'invoice_total', invoice_total,
          'status', status
        ) ORDER BY computed_at DESC)
        FROM tcs_auto_collections
        WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
      ), '[]'::jsonb)
    ),
    'compliance', jsonb_build_object(
      'filing_readiness', tax_filing_readiness(p_user_id, p_fiscal_year),
      'due_date_tracker', get_compliance_calendar(p_user_id, p_fiscal_year),
      'compliance_score', tax_compliance_score(p_user_id, p_fiscal_year)
    ),
    'computed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION gst_compliance_center_overview(TEXT, TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION erp_tax_reports_bundle(TEXT, TEXT, TEXT) TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 6. Calendar extension: TCS payment + TCS return due dates
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION seed_tcs_compliance_calendar(
  p_user_id TEXT,
  p_fiscal_year TEXT
) RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
  v_fy_start INT;
  v_month INT;
  v_cal_year INT;
  v_real_month INT;
  v_label_month TEXT;
  v_count INT := 0;
BEGIN
  v_fy_start := CASE WHEN p_fiscal_year ~ '^\d{4}-\d{2}$'
                     THEN substring(p_fiscal_year from 1 for 4)::INT
                     ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INT END;

  FOR v_month IN 1..12 LOOP
    v_real_month := ((v_month + 3 - 1) % 12) + 1;
    v_cal_year := CASE WHEN v_real_month >= 4 THEN v_fy_start ELSE v_fy_start + 1 END;
    v_label_month := to_char(make_date(v_cal_year, v_real_month, 1), 'Mon-YYYY');

    INSERT INTO statutory_obligations (
      user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day
    )
    VALUES (
      p_user_id, 'other', 'TCS Payment for ' || v_label_month, p_fiscal_year,
      'TCS-PAY-' || v_label_month,
      (make_date(v_cal_year, v_real_month, 1) + INTERVAL '1 month' + INTERVAL '6 days')::date,
      200
    )
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  END LOOP;

  FOR v_month IN 1..4 LOOP
    INSERT INTO statutory_obligations (
      user_id, obligation_type, obligation_label, fiscal_year, period, due_date, late_fee_per_day
    )
    VALUES (
      p_user_id, 'other', 'TCS Form 27EQ Q' || v_month, p_fiscal_year,
      'TCS-27EQ-Q' || v_month,
      CASE v_month
        WHEN 1 THEN make_date(v_fy_start, 7, 15)
        WHEN 2 THEN make_date(v_fy_start, 10, 15)
        WHEN 3 THEN make_date(v_fy_start + 1, 1, 15)
        WHEN 4 THEN make_date(v_fy_start + 1, 5, 15)
      END,
      200
    )
    ON CONFLICT (user_id, obligation_type, period, fiscal_year) DO NOTHING;
  END LOOP;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION seed_tcs_compliance_calendar(TEXT, TEXT) TO authenticated, anon;

CREATE OR REPLACE FUNCTION tax_filing_readiness(
  p_user_id TEXT,
  p_fiscal_year TEXT
) RETURNS JSONB LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  v_rows JSONB := '[]'::jsonb;
  v_q TEXT;
  v_m TEXT;
  v_gstr1_validation JSONB;
  v_tds_recon JSONB := tds_reconcile_books_vs_returns(p_user_id, p_fiscal_year, NULL);
  v_itr_v JSONB := itr_validate(p_user_id, p_fiscal_year);
BEGIN
  -- GST monthly readiness from generated/validated data.
  FOR v_m IN
    SELECT to_char(d, 'YYYY-MM')
    FROM generate_series(
      make_date(substring(p_fiscal_year, 1, 4)::int, 4, 1),
      make_date(substring(p_fiscal_year, 1, 4)::int + 1, 3, 1),
      interval '1 month'
    ) AS d
  LOOP
    v_gstr1_validation := gstr1_validate(p_user_id, v_m);

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'filing', 'GSTR-1 ' || v_m,
      'category', 'GST',
      'status', CASE WHEN COALESCE((v_gstr1_validation->>'is_valid')::boolean, false) THEN 'ready' ELSE 'pending' END,
      'readiness_pct', CASE WHEN COALESCE((v_gstr1_validation->>'is_valid')::boolean, false) THEN 90 ELSE 50 END
    ));

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'filing', 'GSTR-3B ' || v_m,
      'category', 'GST',
      'status', CASE WHEN COALESCE((gstr3b_auto_generate(p_user_id, v_m)->>'net_payable')::numeric, 0) >= 0 THEN 'ready' ELSE 'pending' END,
      'readiness_pct', 85
    ));
  END LOOP;

  -- TDS and TCS quarterly readiness.
  FOR v_q IN SELECT * FROM (VALUES ('Q1'),('Q2'),('Q3'),('Q4')) AS q(quarter) LOOP
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'filing','TDS Return ' || v_q,
      'category','TDS',
      'status', CASE WHEN EXISTS (
                       SELECT 1 FROM tds_returns
                        WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                          AND quarter = v_q AND status IN ('prepared','filed','accepted'))
                     THEN 'ready' ELSE 'pending' END,
      'readiness_pct', CASE WHEN EXISTS (
                              SELECT 1 FROM tds_returns
                               WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                 AND quarter = v_q AND status = 'filed')
                            THEN 100
                            WHEN EXISTS (
                              SELECT 1 FROM tds_returns
                               WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                 AND quarter = v_q AND status = 'prepared')
                            THEN 80 ELSE 40 END
    ));

    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'filing','TCS Return 27EQ ' || v_q,
      'category','TCS',
      'status', CASE WHEN EXISTS (
                       SELECT 1 FROM tcs_returns
                        WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                          AND quarter = v_q AND status IN ('prepared','filed','accepted'))
                     THEN 'ready' ELSE 'pending' END,
      'readiness_pct', CASE WHEN EXISTS (
                              SELECT 1 FROM tcs_returns
                               WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                 AND quarter = v_q AND status = 'filed')
                            THEN 100
                            WHEN EXISTS (
                              SELECT 1 FROM tcs_returns
                               WHERE user_id = p_user_id AND fiscal_year = p_fiscal_year
                                 AND quarter = v_q AND status = 'prepared')
                            THEN 80 ELSE 40 END
    ));
  END LOOP;

  v_rows := v_rows || jsonb_build_array(jsonb_build_object(
    'filing', 'TDS Reconciliation',
    'category','TDS',
    'status', CASE WHEN COALESCE((v_tds_recon->>'all_reconciled')::boolean, true) THEN 'ready' ELSE 'pending' END,
    'readiness_pct', CASE WHEN COALESCE((v_tds_recon->>'all_reconciled')::boolean, true) THEN 100 ELSE 60 END
  ));

  v_rows := v_rows || jsonb_build_array(jsonb_build_object(
    'filing', 'ITR Filing',
    'category','ITR',
    'status', CASE WHEN COALESCE((v_itr_v->>'all_passed')::boolean, false) THEN 'ready' ELSE 'pending' END,
    'readiness_pct', CASE WHEN COALESCE((v_itr_v->>'all_passed')::boolean, false) THEN 90 ELSE 50 END
  ));

  RETURN jsonb_build_object(
    'fiscal_year', p_fiscal_year,
    'filings', v_rows,
    'computed_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION tax_filing_readiness(TEXT, TEXT) TO authenticated, anon;

NOTIFY pgrst, 'reload schema';

COMMENT ON FUNCTION gst_compliance_center_overview IS
  'Phase 34: one-shot GST center bundle: liability, ITC, net payable, due dates, validation and reconciliation.';
COMMENT ON FUNCTION erp_tax_reports_bundle IS
  'Phase 34: ERP-grade tax report bundle for GST, TDS, TCS and compliance readiness.';
COMMENT ON FUNCTION ensure_default_party_addresses IS
  'Phase 34: creates default billing and optional same-as-billing shipping addresses for customers/vendors.';

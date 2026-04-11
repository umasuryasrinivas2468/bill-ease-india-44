-- Multi-User Access: Add org_id to business tables for team data sharing
-- Run this in Supabase SQL Editor

-- 1. Add org_id column to key business tables
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.inventory ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.journals ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.purchase_bills ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.receivables ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.payables ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.delivery_challans ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.debit_notes ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.recurring_invoices ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.bank_details ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.business_profiles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id);

-- 2. Create indexes for org_id lookups
CREATE INDEX IF NOT EXISTS idx_invoices_org_id ON public.invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_clients_org_id ON public.clients(org_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org_id ON public.expenses(org_id);
CREATE INDEX IF NOT EXISTS idx_inventory_org_id ON public.inventory(org_id);
CREATE INDEX IF NOT EXISTS idx_accounts_org_id ON public.accounts(org_id);
CREATE INDEX IF NOT EXISTS idx_journals_org_id ON public.journals(org_id);
CREATE INDEX IF NOT EXISTS idx_quotations_org_id ON public.quotations(org_id);

-- 3. Create a helper function to check if user belongs to an org
CREATE OR REPLACE FUNCTION public.user_belongs_to_org(_user_id text, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_organizations
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND is_active = true
  )
  OR EXISTS (
    SELECT 1 FROM public.ca_client_assignments
    WHERE ca_user_id = _user_id
      AND client_organization_id = _org_id
      AND is_active = true
      AND (expires_at IS NULL OR expires_at > now())
  )
$$;

-- 4. Create PERMISSIVE org-based SELECT policies for key tables
-- These allow team members to see all org data (in addition to existing user-based policies)

-- Invoices: org members can view
CREATE POLICY "Org members can view org invoices"
  ON public.invoices FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- Clients: org members can view
CREATE POLICY "Org members can view org clients"
  ON public.clients FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- Quotations: org members can view
CREATE POLICY "Org members can view org quotations"
  ON public.quotations FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- Accounts: org members can view  
CREATE POLICY "Org members can view org accounts"
  ON public.accounts FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- Journals: org members can view
CREATE POLICY "Org members can view org journals"
  ON public.journals FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- Inventory: org members can view
CREATE POLICY "Org members can view org inventory"
  ON public.inventory FOR SELECT
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- 5. Org-based INSERT policies (with permission checks)
-- Members with create permissions can insert with org_id
CREATE POLICY "Org members can insert org invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
    AND has_permission(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      'invoices:create',
      org_id
    )
  );

CREATE POLICY "Org members can insert org clients"
  ON public.clients FOR INSERT
  WITH CHECK (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

-- 6. Org-based UPDATE policies
CREATE POLICY "Org members can update org invoices"
  ON public.invoices FOR UPDATE
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

CREATE POLICY "Org members can update org clients"
  ON public.clients FOR UPDATE
  USING (
    org_id IS NOT NULL 
    AND user_belongs_to_org(
      (current_setting('request.jwt.claims'::text, true))::json ->> 'sub',
      org_id
    )
  );

SELECT 'Migration complete! org_id added to business tables with org-scoped RLS policies.' as status;

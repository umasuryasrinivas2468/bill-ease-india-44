alter table public.vendors
  add column if not exists company_name text,
  add column if not exists gst_treatment text,
  add column if not exists state text,
  add column if not exists msme_registered boolean not null default false,
  add column if not exists udyam_aadhaar text,
  add column if not exists bank_account_holder text,
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text,
  add column if not exists bank_name text,
  add column if not exists bank_branch text;

alter table public.purchase_orders
  add column if not exists vendor_company_name text,
  add column if not exists vendor_gst_treatment text,
  add column if not exists vendor_state text,
  add column if not exists vendor_msme_registered boolean not null default false,
  add column if not exists vendor_udyam_aadhaar text,
  add column if not exists vendor_bank_account_holder text,
  add column if not exists vendor_bank_account_number text,
  add column if not exists vendor_bank_ifsc text,
  add column if not exists vendor_bank_name text,
  add column if not exists vendor_bank_branch text;

comment on column public.vendors.company_name is 'Vendor company or firm name';
comment on column public.vendors.gst_treatment is 'GST treatment category for the vendor';
comment on column public.vendors.msme_registered is 'Whether the vendor is registered under MSME/Udyam';
comment on column public.purchase_orders.vendor_company_name is 'Snapshot of vendor company name at order creation time';
comment on column public.purchase_orders.vendor_gst_treatment is 'Snapshot of vendor GST treatment at order creation time';
comment on column public.purchase_orders.vendor_msme_registered is 'Snapshot of vendor MSME status at order creation time';

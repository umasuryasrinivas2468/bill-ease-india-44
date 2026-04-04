alter table public.purchase_bills
  add column if not exists order_number text,
  add column if not exists payment_terms text,
  add column if not exists subject text,
  add column if not exists tcs_amount numeric default 0,
  add column if not exists tds_amount numeric default 0,
  add column if not exists bill_attachment_name text,
  add column if not exists bill_attachment_url text;

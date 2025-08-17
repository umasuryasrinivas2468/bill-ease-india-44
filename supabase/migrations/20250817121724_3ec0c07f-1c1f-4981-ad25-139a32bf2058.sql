
-- NOTE:
-- This migration standardizes RLS on tables that contain a user_id TEXT column,
-- using Clerk's user id from the JWT: current_setting('request.jwt.claims', true)::json->>'sub'.
-- It drops existing conflicting policies and creates uniform CRUD policies.

-- Helper comment: tables targeted (with user_id): 
-- accounts, bank_details, business_assets, business_profiles, clients, credit_notes, debit_notes,
-- invoices, inventory, journals, processed_documents, purchase_bills, quotations, reports,
-- time_tracking, user_apps, vendors, payment_reminders

-- ========== accounts ==========
alter table public.accounts enable row level security;

drop policy if exists "Users can only see their own accounts" on public.accounts;
drop policy if exists "Users can view their own accounts" on public.accounts;
drop policy if exists "Users can insert their own accounts" on public.accounts;
drop policy if exists "Users can update their own accounts" on public.accounts;
drop policy if exists "Users can delete their own accounts" on public.accounts;

create policy "Users can select their own accounts"
on public.accounts for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own accounts"
on public.accounts for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own accounts"
on public.accounts for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own accounts"
on public.accounts for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== bank_details ==========
alter table public.bank_details enable row level security;

drop policy if exists "Users can only see their own bank details" on public.bank_details;
drop policy if exists "Users can view their own bank details" on public.bank_details;
drop policy if exists "Users can insert their own bank details" on public.bank_details;
drop policy if exists "Users can update their own bank details" on public.bank_details;
drop policy if exists "Users can delete their own bank details" on public.bank_details;

create policy "Users can select their own bank details"
on public.bank_details for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own bank details"
on public.bank_details for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own bank details"
on public.bank_details for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own bank details"
on public.bank_details for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== business_assets ==========
alter table public.business_assets enable row level security;

drop policy if exists "Users can only see their own business assets" on public.business_assets;
drop policy if exists "Users can view their own business assets" on public.business_assets;
drop policy if exists "Users can insert their own business assets" on public.business_assets;
drop policy if exists "Users can update their own business assets" on public.business_assets;
drop policy if exists "Users can delete their own business assets" on public.business_assets;

create policy "Users can select their own business assets"
on public.business_assets for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own business assets"
on public.business_assets for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own business assets"
on public.business_assets for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own business assets"
on public.business_assets for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== business_profiles ==========
alter table public.business_profiles enable row level security;

drop policy if exists "Users can only see their own business profile" on public.business_profiles;
drop policy if exists "Users can view their own business profiles" on public.business_profiles;
drop policy if exists "Users can insert their own business profiles" on public.business_profiles;
drop policy if exists "Users can update their own business profiles" on public.business_profiles;
drop policy if exists "Users can delete their own business profiles" on public.business_profiles;

create policy "Users can select their own business profiles"
on public.business_profiles for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own business profiles"
on public.business_profiles for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own business profiles"
on public.business_profiles for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own business profiles"
on public.business_profiles for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== clients ==========
alter table public.clients enable row level security;

drop policy if exists "Users can only see their own clients" on public.clients;
drop policy if exists "Users can view their own clients" on public.clients;
drop policy if exists "Users can insert their own clients" on public.clients;
drop policy if exists "Users can update their own clients" on public.clients;
drop policy if exists "Users can delete their own clients" on public.clients;

create policy "Users can select their own clients"
on public.clients for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own clients"
on public.clients for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own clients"
on public.clients for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own clients"
on public.clients for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== credit_notes ==========
alter table public.credit_notes enable row level security;

drop policy if exists "Users can only see their own credit notes" on public.credit_notes;
drop policy if exists "Users can view their own credit notes" on public.credit_notes;
drop policy if exists "Users can insert their own credit notes" on public.credit_notes;
drop policy if exists "Users can update their own credit notes" on public.credit_notes;
drop policy if exists "Users can delete their own credit notes" on public.credit_notes;

create policy "Users can select their own credit notes"
on public.credit_notes for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own credit notes"
on public.credit_notes for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own credit notes"
on public.credit_notes for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own credit notes"
on public.credit_notes for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== debit_notes ==========
alter table public.debit_notes enable row level security;

drop policy if exists "Users can only see their own debit notes" on public.debit_notes;
drop policy if exists "Users can view their own debit notes" on public.debit_notes;
drop policy if exists "Users can insert their own debit notes" on public.debit_notes;
drop policy if exists "Users can update their own debit notes" on public.debit_notes;
drop policy if exists "Users can delete their own debit notes" on public.debit_notes;

create policy "Users can select their own debit notes"
on public.debit_notes for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own debit notes"
on public.debit_notes for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own debit notes"
on public.debit_notes for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own debit notes"
on public.debit_notes for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== invoices ==========
alter table public.invoices enable row level security;

drop policy if exists "Users can only see their own invoices" on public.invoices;
drop policy if exists "Users can view their own invoices" on public.invoices;
drop policy if exists "Users can insert their own invoices" on public.invoices;
drop policy if exists "Users can update their own invoices" on public.invoices;
drop policy if exists "Users can delete their own invoices" on public.invoices;

create policy "Users can select their own invoices"
on public.invoices for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own invoices"
on public.invoices for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own invoices"
on public.invoices for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own invoices"
on public.invoices for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== inventory ==========
alter table public.inventory enable row level security;

drop policy if exists "Users can only see their own inventory" on public.inventory;
drop policy if exists "Users can view their own inventory" on public.inventory;
drop policy if exists "Users can insert their own inventory" on public.inventory;
drop policy if exists "Users can update their own inventory" on public.inventory;
drop policy if exists "Users can delete their own inventory" on public.inventory;

create policy "Users can select their own inventory"
on public.inventory for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own inventory"
on public.inventory for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own inventory"
on public.inventory for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own inventory"
on public.inventory for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== journals ==========
alter table public.journals enable row level security;

drop policy if exists "Users can only see their own journals" on public.journals;
drop policy if exists "Users can view their own journals" on public.journals;
drop policy if exists "Users can insert their own journals" on public.journals;
drop policy if exists "Users can update their own journals" on public.journals;
drop policy if exists "Users can delete their own journals" on public.journals;

create policy "Users can select their own journals"
on public.journals for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own journals"
on public.journals for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own journals"
on public.journals for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own journals"
on public.journals for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== processed_documents ==========
alter table public.processed_documents enable row level security;

drop policy if exists "Users can only see their own documents" on public.processed_documents;
drop policy if exists "Users can view their own processed documents" on public.processed_documents;
drop policy if exists "Users can insert their own processed documents" on public.processed_documents;
drop policy if exists "Users can update their own processed documents" on public.processed_documents;
drop policy if exists "Users can delete their own processed documents" on public.processed_documents;

create policy "Users can select their own processed documents"
on public.processed_documents for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own processed documents"
on public.processed_documents for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own processed documents"
on public.processed_documents for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own processed documents"
on public.processed_documents for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== purchase_bills ==========
alter table public.purchase_bills enable row level security;

drop policy if exists "Users can only see their own purchase bills" on public.purchase_bills;
drop policy if exists "Users can view their own purchase bills" on public.purchase_bills;
drop policy if exists "Users can insert their own purchase bills" on public.purchase_bills;
drop policy if exists "Users can update their own purchase bills" on public.purchase_bills;
drop policy if exists "Users can delete their own purchase bills" on public.purchase_bills;

create policy "Users can select their own purchase bills"
on public.purchase_bills for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own purchase bills"
on public.purchase_bills for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own purchase bills"
on public.purchase_bills for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own purchase bills"
on public.purchase_bills for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== quotations ==========
alter table public.quotations enable row level security;

drop policy if exists "Users can only see their own quotations" on public.quotations;
drop policy if exists "Users can view their own quotations" on public.quotations;
drop policy if exists "Users can insert their own quotations" on public.quotations;
drop policy if exists "Users can update their own quotations" on public.quotations;
drop policy if exists "Users can delete their own quotations" on public.quotations;

create policy "Users can select their own quotations"
on public.quotations for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own quotations"
on public.quotations for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own quotations"
on public.quotations for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own quotations"
on public.quotations for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== reports ==========
alter table public.reports enable row level security;

drop policy if exists "Users can only see their own reports" on public.reports;
drop policy if exists "Users can view their own reports" on public.reports;
drop policy if exists "Users can insert their own reports" on public.reports;
drop policy if exists "Users can update their own reports" on public.reports;
drop policy if exists "Users can delete their own reports" on public.reports;

create policy "Users can select their own reports"
on public.reports for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own reports"
on public.reports for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own reports"
on public.reports for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own reports"
on public.reports for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== time_tracking ==========
alter table public.time_tracking enable row level security;

drop policy if exists "Users can only see their own time tracking" on public.time_tracking;
drop policy if exists "Users can view their own time tracking" on public.time_tracking;
drop policy if exists "Users can insert their own time tracking" on public.time_tracking;
drop policy if exists "Users can update their own time tracking" on public.time_tracking;
drop policy if exists "Users can delete their own time tracking" on public.time_tracking;

create policy "Users can select their own time tracking"
on public.time_tracking for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own time tracking"
on public.time_tracking for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own time tracking"
on public.time_tracking for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own time tracking"
on public.time_tracking for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== user_apps ==========
alter table public.user_apps enable row level security;

drop policy if exists "Users can view their own user apps" on public.user_apps;
drop policy if exists "Users can view their own installed apps" on public.user_apps;
drop policy if exists "Users can update their installed apps" on public.user_apps;
drop policy if exists "Users can update their own user apps" on public.user_apps;
drop policy if exists "Users can insert their own user apps" on public.user_apps;
drop policy if exists "Users can install apps" on public.user_apps;
drop policy if exists "Users can uninstall their apps" on public.user_apps;
drop policy if exists "Users can delete their own user apps" on public.user_apps;

create policy "Users can select their own user apps"
on public.user_apps for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own user apps"
on public.user_apps for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own user apps"
on public.user_apps for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own user apps"
on public.user_apps for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== vendors ==========
alter table public.vendors enable row level security;

drop policy if exists "Users can only see their own vendors" on public.vendors;
drop policy if exists "Users can view their own vendors" on public.vendors;
drop policy if exists "Users can insert their own vendors" on public.vendors;
drop policy if exists "Users can update their own vendors" on public.vendors;
drop policy if exists "Users can delete their own vendors" on public.vendors;

create policy "Users can select their own vendors"
on public.vendors for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own vendors"
on public.vendors for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own vendors"
on public.vendors for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own vendors"
on public.vendors for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- ========== payment_reminders ==========
alter table public.payment_reminders enable row level security;

drop policy if exists "Users can only see their own payment reminders" on public.payment_reminders;
drop policy if exists "Users can view their own payment reminders" on public.payment_reminders;
drop policy if exists "Users can insert their own payment reminders" on public.payment_reminders;
drop policy if exists "Users can update their own payment reminders" on public.payment_reminders;
drop policy if exists "Users can delete their own payment reminders" on public.payment_reminders;

create policy "Users can select their own payment reminders"
on public.payment_reminders for select
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can insert their own payment reminders"
on public.payment_reminders for insert
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can update their own payment reminders"
on public.payment_reminders for update
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
with check (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

create policy "Users can delete their own payment reminders"
on public.payment_reminders for delete
using (user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

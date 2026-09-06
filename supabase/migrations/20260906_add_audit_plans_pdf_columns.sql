-- ISO 9001 plan/report PDF support
-- Run this in Supabase Dashboard -> SQL Editor -> Run. Idempotent (safe to run twice).

alter table public.audit_plans
  add column if not exists document_number text,
  add column if not exists date_of_plan date,
  add column if not exists prepared_by text,
  add column if not exists signature text,
  add column if not exists pdf_url text,
  add column if not exists pdf_public_id text;
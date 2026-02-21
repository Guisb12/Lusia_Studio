-- Subjects table (if not already created)
-- Run this in Supabase SQL editor

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  color text,
  icon text,
  education_level text,
  grade_levels text[],
  organization_id uuid references public.organizations(id),
  active boolean default true,
  created_at timestamptz default now()
);

create index if not exists idx_subjects_org on public.subjects(organization_id);
create index if not exists idx_subjects_slug on public.subjects(slug);

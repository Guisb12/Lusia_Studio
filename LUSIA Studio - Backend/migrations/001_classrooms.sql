-- Classrooms table
-- Run this in Supabase SQL editor

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  grade_level text,
  subject_id uuid,
  teacher_id uuid references public.profiles(id),
  school_year text,
  status text default 'active' check (status in ('active', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_classrooms_org on public.classrooms(organization_id);
create index if not exists idx_classrooms_teacher on public.classrooms(teacher_id);
create index if not exists idx_classrooms_status on public.classrooms(organization_id, status);

alter table public.classrooms enable row level security;

-- Members of the same org can read classrooms
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'classrooms'
      and policyname = 'classrooms_select_org_members'
  ) then
    create policy classrooms_select_org_members
      on public.classrooms for select
      using (
        exists (
          select 1 from public.profiles p
          where p.organization_id = classrooms.organization_id
            and p.id = auth.uid()
        )
      );
  end if;
end $$;

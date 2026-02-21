# Supabase Auth Setup (Manual)

Use this checklist once in Supabase before running the Studio auth flow.

## 1) Enable providers

In Supabase Dashboard -> Authentication -> Providers:

- Enable **Email**
- Enable **Google**
  - Add Google OAuth client ID and secret

## 2) Configure redirect URLs

In Authentication -> URL Configuration:

- Site URL: `http://localhost:3000`
- Additional redirect URLs:
  - `http://localhost:3000/auth/callback`
  - `http://localhost:8000/api/v1/auth/email/verified` (optional auto-close confirmation page)

## 3) Run SQL for organizations + profiles

Run this SQL in Supabase SQL editor:

```sql
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  logo_url text,
  email text not null,
  phone text,
  address text,
  district text,
  city text,
  postal_code text,
  max_teachers integer default 100,
  max_students integer default 1000,
  stripe_customer_id text unique,
  billing_email text,
  status text default 'trial' check (status in ('trial', 'active', 'suspended', 'canceled')),
  student_enrollment_code text unique,
  teacher_enrollment_code text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists idx_organizations_slug on public.organizations(slug);
create index if not exists idx_organizations_status on public.organizations(status);
create index if not exists idx_organizations_district on public.organizations(district);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  role text not null check (role in ('admin', 'teacher', 'student')),
  status text not null default 'pending_approval'
    check (status in ('pending_approval', 'active', 'suspended')),
  full_name text not null,
  display_name text,
  avatar_url text,
  email text,
  grade_level text,
  course text,
  subject_ids text[],
  school_name text,
  parent_name text,
  parent_email text,
  parent_phone text,
  phone text,
  subjects_taught text[],
  class_ids uuid[],
  onboarding_completed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_login_at timestamptz,
  unique (organization_id, email)
);

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;

create index if not exists idx_profiles_org_role on public.profiles(organization_id, role);
create index if not exists idx_profiles_status on public.profiles(organization_id, status);
create index if not exists idx_profiles_class_ids on public.profiles using gin(class_ids);

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
  ) then
    create policy profiles_select_own
      on public.profiles
      for select
      using (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_own'
  ) then
    create policy profiles_update_own
      on public.profiles
      for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'organizations'
      and policyname = 'organizations_select_members'
  ) then
    create policy organizations_select_members
      on public.organizations
      for select
      using (
        exists (
          select 1
          from public.profiles p
          where p.organization_id = organizations.id
            and p.id = auth.uid()
        )
      );
  end if;
end $$;
```

## 4) Fill project env values

Frontend (`LUSIA Studio - Frontend/.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_API_BASE_URL` (example: `http://localhost:8000`)

Backend (`LUSIA Studio - Backend/.env`):

Required for auth/org flows:
- `SUPABASE_URL_B2B`
- `SUPABASE_SERVICE_KEY_B2B`
- `APP_AUTH_SECRET` (recommended, strong random string used to sign enrollment tokens)
- `ENROLLMENT_TOKEN_TTL_SECONDS` (optional, default `604800` = 7 days)

Optional for content-library endpoints only:
- `SUPABASE_URL_B2C`
- `SUPABASE_SERVICE_KEY_B2C`
- `SUPABASE_KEY_B2B` (legacy/optional; not required by current runtime path)

## 5) Optional sanity checks

- Create an organization with an admin account using app flow.
- Confirm org has `teacher_enrollment_code` and `student_enrollment_code`.
- Confirm invited teacher/student can only register using a valid code.

## 6) Existing projects (recommended)

If your schema was created before the latest auth hardening changes, also run:

- `migrations/003_auth_hardening.sql`

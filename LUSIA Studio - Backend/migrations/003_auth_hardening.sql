-- Auth hardening migration
-- Run in Supabase SQL editor.

alter table if exists public.profiles
  add column if not exists onboarding_completed boolean not null default false;

alter table if exists public.profiles
  add column if not exists last_login_at timestamptz;

update public.organizations
set
  teacher_enrollment_code = lower(trim(teacher_enrollment_code)),
  student_enrollment_code = lower(trim(student_enrollment_code))
where teacher_enrollment_code is not null
   or student_enrollment_code is not null;

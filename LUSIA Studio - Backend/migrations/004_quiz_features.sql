-- Quiz feature migration:
-- - question type catalog
-- - quiz question bank
-- - storage bucket for quiz images

create table if not exists public.quiz_question_types (
  id text primary key,
  label text not null
);

insert into public.quiz_question_types (id, label)
values
  ('multiple_choice', 'Escolha Múltipla'),
  ('true_false', 'Verdadeiro/Falso'),
  ('fill_blank', 'Preencher Lacunas'),
  ('matching', 'Associação'),
  ('short_answer', 'Resposta Curta'),
  ('multiple_response', 'Resposta Múltipla'),
  ('ordering', 'Ordenação')
on conflict (id) do nothing;

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  type text not null references public.quiz_question_types(id),
  content jsonb not null default '{}'::jsonb,
  subject_id uuid references public.subjects(id),
  year_level text,
  subject_component text,
  curriculum_codes text[],
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_quiz_questions_org on public.quiz_questions(organization_id);
create index if not exists idx_quiz_questions_creator on public.quiz_questions(created_by);
create index if not exists idx_quiz_questions_type on public.quiz_questions(organization_id, type);
create index if not exists idx_quiz_questions_subject on public.quiz_questions(subject_id, year_level);
create index if not exists idx_quiz_questions_component
  on public.quiz_questions(subject_component)
  where subject_component is not null;
create index if not exists idx_quiz_questions_curriculum on public.quiz_questions using gin(curriculum_codes);
create index if not exists idx_quiz_questions_content on public.quiz_questions using gin(content);

alter table public.quiz_questions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quiz_questions'
      and policyname = 'quiz_questions_owner_full_access'
  ) then
    create policy quiz_questions_owner_full_access
      on public.quiz_questions
      for all
      using (created_by = auth.uid());
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'quiz_questions'
      and policyname = 'quiz_questions_public_org_read'
  ) then
    create policy quiz_questions_public_org_read
      on public.quiz_questions
      for select
      using (
        is_public = true
        and organization_id = (
          select p.organization_id from public.profiles p where p.id = auth.uid()
        )
      );
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quiz-images',
  'quiz-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'quiz_images_public_read'
  ) then
    create policy quiz_images_public_read
      on storage.objects
      for select
      using (bucket_id = 'quiz-images');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'quiz_images_insert_own_folder'
  ) then
    create policy quiz_images_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'quiz-images'
        and (storage.foldername(name))[1] = (
          select p.organization_id::text from public.profiles p where p.id = auth.uid()
        )
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'quiz_images_update_own_folder'
  ) then
    create policy quiz_images_update_own_folder
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'quiz-images'
        and (storage.foldername(name))[1] = (
          select p.organization_id::text from public.profiles p where p.id = auth.uid()
        )
        and (storage.foldername(name))[2] = auth.uid()::text
      )
      with check (
        bucket_id = 'quiz-images'
        and (storage.foldername(name))[1] = (
          select p.organization_id::text from public.profiles p where p.id = auth.uid()
        )
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'quiz_images_delete_own_folder'
  ) then
    create policy quiz_images_delete_own_folder
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'quiz-images'
        and (storage.foldername(name))[1] = (
          select p.organization_id::text from public.profiles p where p.id = auth.uid()
        )
        and (storage.foldername(name))[2] = auth.uid()::text
      );
  end if;
end $$;


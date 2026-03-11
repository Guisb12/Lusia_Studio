-- Migration 014: Session Types and price snapshots on calendar_sessions
-- Introduces session types (tipos de sessao) with per-student and per-teacher pricing,
-- and adds price snapshot columns to calendar_sessions for historical accuracy.

-- ── Session Types table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.session_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT NULL,
  student_price_per_hour numeric(8,2) NOT NULL DEFAULT 0,
  teacher_cost_per_hour numeric(8,2) NOT NULL DEFAULT 0,
  color text DEFAULT NULL,
  icon text DEFAULT NULL,
  is_default boolean DEFAULT false,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_session_types_org
  ON public.session_types(organization_id, active);

-- Only one default session type per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_types_default
  ON public.session_types(organization_id) WHERE is_default = true;

-- ── Price snapshot columns on calendar_sessions ──────────────────────

ALTER TABLE public.calendar_sessions
  ADD COLUMN IF NOT EXISTS session_type_id uuid REFERENCES public.session_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snapshot_student_price numeric(8,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS snapshot_teacher_cost numeric(8,2) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_type
  ON public.calendar_sessions(session_type_id);

-- ── RLS policies ─────────────────────────────────────────────────────

ALTER TABLE public.session_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_types_org_read" ON public.session_types
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "session_types_org_write" ON public.session_types
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

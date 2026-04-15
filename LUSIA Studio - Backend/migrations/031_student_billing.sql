-- Migration 031: Student monthly billing model (fixed/variable + extras + payment status)

-- ── Billing settings (versioned by effective month) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.student_billing_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_month date NOT NULL,
  payment_method text NOT NULL DEFAULT 'variable' CHECK (payment_method IN ('variable', 'fixed')),
  fixed_monthly_amount numeric(10,2) NOT NULL DEFAULT 0,
  created_by uuid DEFAULT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, student_id, effective_month)
);

CREATE INDEX IF NOT EXISTS idx_student_billing_settings_lookup
  ON public.student_billing_settings(organization_id, student_id, effective_month DESC);

-- ── Monthly adjustments (boleia, subscriptions, custom) ───────────────────────

CREATE TABLE IF NOT EXISTS public.student_monthly_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL,
  label text NOT NULL,
  amount numeric(10,2) NOT NULL,
  category text DEFAULT NULL,
  created_by uuid DEFAULT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_monthly_adjustments_lookup
  ON public.student_monthly_adjustments(organization_id, student_id, month);

-- ── Monthly paid status (checkbox state) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_monthly_payment_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month date NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz DEFAULT NULL,
  paid_note text DEFAULT NULL,
  updated_by uuid DEFAULT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (organization_id, student_id, month)
);

CREATE INDEX IF NOT EXISTS idx_student_monthly_payment_status_lookup
  ON public.student_monthly_payment_status(organization_id, student_id, month);

-- ── RLS policies ───────────────────────────────────────────────────────────────

ALTER TABLE public.student_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_monthly_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_monthly_payment_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "student_billing_settings_org_read" ON public.student_billing_settings
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "student_billing_settings_org_write" ON public.student_billing_settings
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

CREATE POLICY "student_monthly_adjustments_org_read" ON public.student_monthly_adjustments
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "student_monthly_adjustments_org_write" ON public.student_monthly_adjustments
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

CREATE POLICY "student_monthly_payment_status_org_read" ON public.student_monthly_payment_status
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "student_monthly_payment_status_org_write" ON public.student_monthly_payment_status
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );

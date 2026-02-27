-- ============================================================
-- 007 · Grade Calculator — Calculadora de Médias
-- ============================================================
-- Adds 7 new tables + 2 columns on subjects for the
-- Portuguese grade tracking and CFS computation feature.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 0.  ALTER subjects — two new flag columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS affects_cfs       boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_national_exam  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN subjects.affects_cfs      IS 'false only for EMR – excluded from CFS';
COMMENT ON COLUMN subjects.has_national_exam IS 'true for subjects with national exams';

-- ─────────────────────────────────────────────────────────────
-- 1.  student_grade_settings
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_grade_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  academic_year           text        NOT NULL,              -- "2025-2026"
  education_level         text        NOT NULL,              -- matches subjects.education_level
  graduation_cohort_year  int,                               -- determines CFS formula (NULL for básico)
  regime                  text        CHECK (regime IN ('trimestral', 'semestral')),
  period_weights          numeric(5,2)[]  NOT NULL,          -- e.g. {25.00, 35.00, 40.00}
  is_locked               boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year)
);

CREATE INDEX idx_sgs_student ON student_grade_settings (student_id);

-- ─────────────────────────────────────────────────────────────
-- 2.  student_subject_enrollments
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_subject_enrollments (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id        uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_year     text        NOT NULL,
  year_level        text        NOT NULL,              -- "10","11","12" — the subject's year
  settings_id       uuid        NOT NULL REFERENCES student_grade_settings(id) ON DELETE CASCADE,
  is_active         boolean     NOT NULL DEFAULT true,
  is_exam_candidate boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year)
);

CREATE INDEX idx_sse_student_year ON student_subject_enrollments (student_id, academic_year);
CREATE INDEX idx_sse_settings     ON student_subject_enrollments (settings_id);

-- ─────────────────────────────────────────────────────────────
-- 3.  student_subject_periods
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_subject_periods (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     uuid        NOT NULL REFERENCES student_subject_enrollments(id) ON DELETE CASCADE,
  period_number     smallint    NOT NULL,              -- 1, 2, or 3
  raw_calculated    numeric(6,4),                      -- full-precision result from elements
  calculated_grade  smallint,                          -- ROUND_HALF_UP(raw_calculated)
  pauta_grade       smallint,                          -- final grade (may differ if overridden)
  is_overridden     boolean     NOT NULL DEFAULT false,
  override_reason   text,                              -- mandatory when is_overridden = true
  qualitative_grade text,                              -- 1º ciclo only
  is_locked         boolean     NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id, period_number)
);

CREATE INDEX idx_ssp_enrollment ON student_subject_periods (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 4.  subject_evaluation_elements
-- ─────────────────────────────────────────────────────────────
CREATE TABLE subject_evaluation_elements (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id         uuid        NOT NULL REFERENCES student_subject_periods(id) ON DELETE CASCADE,
  element_type      text        NOT NULL,              -- 'teste','trabalho','apresentacao_oral','atitudes_valores','outro'
  label             text        NOT NULL,              -- "Teste 1", "Projeto de Grupo"
  icon              text,                              -- custom icon identifier (optional)
  weight_percentage numeric(5,2) NOT NULL,             -- must sum to 100 per period_id
  raw_grade         numeric(6,4),                      -- the actual score
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_see_period ON subject_evaluation_elements (period_id);

-- ─────────────────────────────────────────────────────────────
-- 5.  student_annual_subject_grades  (CAF)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_annual_subject_grades (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid        NOT NULL REFERENCES student_subject_enrollments(id) ON DELETE CASCADE,
  raw_annual    numeric(6,4),                          -- weighted sum before rounding
  annual_grade  smallint    NOT NULL,                  -- ROUND_HALF_UP(raw_annual)
  is_locked     boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrollment_id)
);

CREATE INDEX idx_sasg_enrollment ON student_annual_subject_grades (enrollment_id);

-- ─────────────────────────────────────────────────────────────
-- 6.  student_subject_cfd
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_subject_cfd (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id    uuid        NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  academic_year text        NOT NULL,                  -- terminal year of the subject
  cif_raw       numeric(6,4),
  cif_grade     smallint    NOT NULL,
  exam_grade    smallint,                              -- national exam (0–20), NULL if no exam
  exam_weight   numeric(4,2),                          -- 30.00 or 25.00
  cfd_raw       numeric(6,4),
  cfd_grade     smallint    NOT NULL,
  is_finalized  boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, subject_id, academic_year)
);

CREATE INDEX idx_scfd_student ON student_subject_cfd (student_id);

-- ─────────────────────────────────────────────────────────────
-- 7.  student_cfs_snapshot
-- ─────────────────────────────────────────────────────────────
CREATE TABLE student_cfs_snapshot (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id              uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  academic_year           text        NOT NULL,
  graduation_cohort_year  int         NOT NULL,
  cfs_value               numeric(3,1) NOT NULL,       -- truncated to 1 decimal
  dges_value              smallint,                     -- cfs_value × 10
  formula_used            text,                         -- 'simple_mean' or 'weighted_mean'
  cfd_snapshot            jsonb       NOT NULL,         -- immutable record of all CFDs
  is_finalized            boolean     NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, academic_year)
);

CREATE INDEX idx_scs_student ON student_cfs_snapshot (student_id);

-- ─────────────────────────────────────────────────────────────
-- RLS POLICIES
-- ─────────────────────────────────────────────────────────────

-- student_grade_settings
ALTER TABLE student_grade_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY sgs_select ON student_grade_settings
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY sgs_insert ON student_grade_settings
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY sgs_update ON student_grade_settings
  FOR UPDATE USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY sgs_delete ON student_grade_settings
  FOR DELETE USING (auth.uid() = student_id);

-- student_subject_enrollments
ALTER TABLE student_subject_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY sse_select ON student_subject_enrollments
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY sse_insert ON student_subject_enrollments
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY sse_update ON student_subject_enrollments
  FOR UPDATE USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY sse_delete ON student_subject_enrollments
  FOR DELETE USING (auth.uid() = student_id);

-- student_subject_periods  (ownership via enrollment chain)
ALTER TABLE student_subject_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY ssp_select ON student_subject_periods
  FOR SELECT USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY ssp_insert ON student_subject_periods
  FOR INSERT WITH CHECK (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY ssp_update ON student_subject_periods
  FOR UPDATE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY ssp_delete ON student_subject_periods
  FOR DELETE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );

-- subject_evaluation_elements  (ownership two joins deep)
ALTER TABLE subject_evaluation_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY see_select ON subject_evaluation_elements
  FOR SELECT USING (
    period_id IN (
      SELECT ssp.id FROM student_subject_periods ssp
      JOIN student_subject_enrollments sse ON sse.id = ssp.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
  );
CREATE POLICY see_insert ON subject_evaluation_elements
  FOR INSERT WITH CHECK (
    period_id IN (
      SELECT ssp.id FROM student_subject_periods ssp
      JOIN student_subject_enrollments sse ON sse.id = ssp.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
  );
CREATE POLICY see_update ON subject_evaluation_elements
  FOR UPDATE USING (
    period_id IN (
      SELECT ssp.id FROM student_subject_periods ssp
      JOIN student_subject_enrollments sse ON sse.id = ssp.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
  );
CREATE POLICY see_delete ON subject_evaluation_elements
  FOR DELETE USING (
    period_id IN (
      SELECT ssp.id FROM student_subject_periods ssp
      JOIN student_subject_enrollments sse ON sse.id = ssp.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
  );

-- student_annual_subject_grades  (ownership via enrollment chain)
ALTER TABLE student_annual_subject_grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY sasg_select ON student_annual_subject_grades
  FOR SELECT USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sasg_insert ON student_annual_subject_grades
  FOR INSERT WITH CHECK (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sasg_update ON student_annual_subject_grades
  FOR UPDATE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sasg_delete ON student_annual_subject_grades
  FOR DELETE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );

-- student_subject_cfd
ALTER TABLE student_subject_cfd ENABLE ROW LEVEL SECURITY;

CREATE POLICY scfd_select ON student_subject_cfd
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY scfd_insert ON student_subject_cfd
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY scfd_update ON student_subject_cfd
  FOR UPDATE USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY scfd_delete ON student_subject_cfd
  FOR DELETE USING (auth.uid() = student_id);

-- student_cfs_snapshot
ALTER TABLE student_cfs_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY scs_select ON student_cfs_snapshot
  FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY scs_insert ON student_cfs_snapshot
  FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY scs_update ON student_cfs_snapshot
  FOR UPDATE USING (auth.uid() = student_id)
  WITH CHECK (auth.uid() = student_id);
CREATE POLICY scs_delete ON student_cfs_snapshot
  FOR DELETE USING (auth.uid() = student_id);

COMMIT;

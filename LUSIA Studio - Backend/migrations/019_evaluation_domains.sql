-- ============================================================
-- 019 · Evaluation Domains — Domain-Based Cumulative Grading
-- ============================================================
-- Introduces evaluation domains (e.g. "Testes 80%", "Apresentações 20%")
-- with per-period weight vectors, cumulative period blending, and
-- domain-grouped elements.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1.  subject_evaluation_domains
-- ─────────────────────────────────────────────────────────────
CREATE TABLE subject_evaluation_domains (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id   uuid        NOT NULL REFERENCES student_subject_enrollments(id) ON DELETE CASCADE,
  domain_type     text        NOT NULL,                -- 'teste','trabalho','apresentacao_oral','atitudes_valores','outro'
  label           text        NOT NULL,                -- user-facing label
  icon            text,                                -- custom icon identifier
  period_weights  numeric(5,2)[]  NOT NULL,            -- e.g. {80.00, 80.00, 70.00}
  sort_order      smallint    NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sed_enrollment ON subject_evaluation_domains (enrollment_id);

COMMENT ON TABLE  subject_evaluation_domains              IS 'Evaluation domain (e.g. Testes, Apresentações) per subject enrollment';
COMMENT ON COLUMN subject_evaluation_domains.period_weights IS 'Weight of this domain per period; array length = num_periods; column sums across domains = 100';

-- ─────────────────────────────────────────────────────────────
-- 2.  ALTER subject_evaluation_elements — add domain support
-- ─────────────────────────────────────────────────────────────
ALTER TABLE subject_evaluation_elements
  ADD COLUMN IF NOT EXISTS domain_id uuid REFERENCES subject_evaluation_domains(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS period_number smallint;

-- Make period_id and weight_percentage nullable for domain-based elements
ALTER TABLE subject_evaluation_elements
  ALTER COLUMN period_id DROP NOT NULL,
  ALTER COLUMN weight_percentage DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_see_domain ON subject_evaluation_elements (domain_id);

COMMENT ON COLUMN subject_evaluation_elements.domain_id        IS 'Domain this element belongs to (NULL for legacy flat elements)';
COMMENT ON COLUMN subject_evaluation_elements.period_number    IS 'Period this element is assigned to (1,2,3) when using domains';
COMMENT ON COLUMN subject_evaluation_elements.weight_percentage IS 'NULL = equal weight within domain+period; set = custom weight (must sum to 100 within domain+period)';

-- ─────────────────────────────────────────────────────────────
-- 3.  ALTER student_subject_enrollments — cumulative weights
-- ─────────────────────────────────────────────────────────────
ALTER TABLE student_subject_enrollments
  ADD COLUMN IF NOT EXISTS cumulative_weights jsonb;

COMMENT ON COLUMN student_subject_enrollments.cumulative_weights IS 'Cumulative period weight matrix, e.g. [[100],[40,60],[25,30,45]]; NULL = non-cumulative';

-- ─────────────────────────────────────────────────────────────
-- 4.  ALTER student_subject_periods — own + cumulative grades
-- ─────────────────────────────────────────────────────────────
ALTER TABLE student_subject_periods
  ADD COLUMN IF NOT EXISTS own_raw         numeric(6,4),
  ADD COLUMN IF NOT EXISTS own_grade       smallint,
  ADD COLUMN IF NOT EXISTS cumulative_raw  numeric(6,4),
  ADD COLUMN IF NOT EXISTS cumulative_grade smallint;

COMMENT ON COLUMN student_subject_periods.own_raw         IS 'Domain-weighted grade for this period alone (before cumulative blending)';
COMMENT ON COLUMN student_subject_periods.own_grade       IS 'ROUND_HALF_UP(own_raw)';
COMMENT ON COLUMN student_subject_periods.cumulative_raw  IS 'Cumulative grade (blended with previous periods)';
COMMENT ON COLUMN student_subject_periods.cumulative_grade IS 'ROUND_HALF_UP(cumulative_raw)';

-- ─────────────────────────────────────────────────────────────
-- 5.  RLS policies for subject_evaluation_domains
-- ─────────────────────────────────────────────────────────────
ALTER TABLE subject_evaluation_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY sed_select ON subject_evaluation_domains
  FOR SELECT USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sed_insert ON subject_evaluation_domains
  FOR INSERT WITH CHECK (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sed_update ON subject_evaluation_domains
  FOR UPDATE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );
CREATE POLICY sed_delete ON subject_evaluation_domains
  FOR DELETE USING (
    enrollment_id IN (
      SELECT id FROM student_subject_enrollments WHERE student_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 6.  Updated RLS for subject_evaluation_elements
--     Elements can now be owned via domain_id OR period_id
-- ─────────────────────────────────────────────────────────────
-- Drop existing policies and recreate with domain support
DROP POLICY IF EXISTS see_select ON subject_evaluation_elements;
DROP POLICY IF EXISTS see_insert ON subject_evaluation_elements;
DROP POLICY IF EXISTS see_update ON subject_evaluation_elements;
DROP POLICY IF EXISTS see_delete ON subject_evaluation_elements;

CREATE POLICY see_select ON subject_evaluation_elements
  FOR SELECT USING (
    -- Legacy path: via period_id
    period_id IN (
      SELECT ssp.id FROM student_subject_periods ssp
      JOIN student_subject_enrollments sse ON sse.id = ssp.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
    OR
    -- Domain path: via domain_id
    domain_id IN (
      SELECT sed.id FROM subject_evaluation_domains sed
      JOIN student_subject_enrollments sse ON sse.id = sed.enrollment_id
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
    OR
    domain_id IN (
      SELECT sed.id FROM subject_evaluation_domains sed
      JOIN student_subject_enrollments sse ON sse.id = sed.enrollment_id
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
    OR
    domain_id IN (
      SELECT sed.id FROM subject_evaluation_domains sed
      JOIN student_subject_enrollments sse ON sse.id = sed.enrollment_id
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
    OR
    domain_id IN (
      SELECT sed.id FROM subject_evaluation_domains sed
      JOIN student_subject_enrollments sse ON sse.id = sed.enrollment_id
      WHERE sse.student_id = auth.uid()
    )
  );

COMMIT;

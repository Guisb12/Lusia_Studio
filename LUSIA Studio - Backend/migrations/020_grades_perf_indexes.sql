-- Migration 020: Grades performance indexes
-- Supports domain+period element lookups and enrollment+period lookups
-- used heavily by the grades service during board data hydration and
-- grade recalculation.

CREATE INDEX IF NOT EXISTS idx_see_domain_period
  ON public.subject_evaluation_elements(domain_id, period_number)
  WHERE domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_periods_enrollment_number
  ON public.student_subject_periods(enrollment_id, period_number);

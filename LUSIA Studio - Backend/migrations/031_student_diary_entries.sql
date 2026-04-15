-- Shared student diary entries
-- Visibility: teachers/admins in org can read and edit entries for a student

CREATE TABLE IF NOT EXISTS student_diary_entries (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    subject_id uuid NULL REFERENCES subjects(id),
    entry_date date NOT NULL,
    content text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN student_diary_entries.student_id IS 'The student this diary entry is about';
COMMENT ON COLUMN student_diary_entries.teacher_id IS 'Teacher/admin who created the diary entry';
COMMENT ON COLUMN student_diary_entries.subject_id IS 'Optional subject context for the diary entry';
COMMENT ON COLUMN student_diary_entries.entry_date IS 'Logical day the note is attached to';

CREATE INDEX IF NOT EXISTS idx_student_diary_org_student_date
    ON student_diary_entries (organization_id, student_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_diary_org_student_subject_date
    ON student_diary_entries (organization_id, student_id, subject_id, entry_date DESC, created_at DESC);

-- Student notes: per-student post-it notes written by teachers
-- Visibility: personal by default, opt-in sharing to other teachers

CREATE TABLE IF NOT EXISTS student_notes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL REFERENCES organizations(id),
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    content text NOT NULL DEFAULT '',
    color text NOT NULL DEFAULT '#FFF9B1',
    is_shared boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

COMMENT ON COLUMN student_notes.student_id IS 'The student this note is about';
COMMENT ON COLUMN student_notes.teacher_id IS 'The teacher who wrote the note (owner)';
COMMENT ON COLUMN student_notes.is_shared IS 'When true, note is visible to other teachers in the org';

-- Primary: teacher lists their own notes for a specific student
CREATE INDEX IF NOT EXISTS idx_student_notes_org_student_teacher
    ON student_notes (organization_id, student_id, teacher_id);

-- Secondary: fetch shared notes from other teachers for a student
CREATE INDEX IF NOT EXISTS idx_student_notes_org_student_shared
    ON student_notes (organization_id, student_id)
    WHERE is_shared = true;

-- Replace is_shared boolean with shared_with_ids uuid[] for granular sharing

ALTER TABLE student_notes ADD COLUMN IF NOT EXISTS shared_with_ids uuid[] NOT NULL DEFAULT '{}';

-- Migrate existing shared notes: if is_shared was true, leave shared_with_ids empty
-- (no way to know who it was shared with, teacher can re-share)

ALTER TABLE student_notes DROP COLUMN IF EXISTS is_shared;

-- Drop the old partial index for is_shared
DROP INDEX IF EXISTS idx_student_notes_org_student_shared;

-- New GIN index for array containment queries (teacher sees notes shared with them)
CREATE INDEX IF NOT EXISTS idx_student_notes_shared_with_gin
    ON student_notes USING gin (shared_with_ids);

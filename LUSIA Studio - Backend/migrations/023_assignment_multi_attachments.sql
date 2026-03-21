-- Migration: Convert assignments from single artifact_id to artifact_ids array
-- Supports up to 3 attached documents per assignment, ordered by array position.

BEGIN;

-- 1. Add new array column
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS artifact_ids uuid[] DEFAULT '{}';

-- 2. Migrate existing data: single artifact_id → 1-element array
UPDATE assignments
SET artifact_ids = ARRAY[artifact_id]
WHERE artifact_id IS NOT NULL
  AND (artifact_ids IS NULL OR artifact_ids = '{}');

-- 3. Drop old column
ALTER TABLE assignments DROP COLUMN IF EXISTS artifact_id;

-- 4. GIN index for "which assignments reference this artifact?" lookups
CREATE INDEX IF NOT EXISTS idx_assignments_artifact_ids_gin
ON assignments USING GIN (artifact_ids);

COMMIT;

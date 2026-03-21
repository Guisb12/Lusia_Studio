-- Add 'presentation' to the artifacts.artifact_type CHECK constraint
ALTER TABLE artifacts DROP CONSTRAINT IF EXISTS artifacts_artifact_type_check;
ALTER TABLE artifacts ADD CONSTRAINT artifacts_artifact_type_check
  CHECK (artifact_type IN ('quiz', 'note', 'exercise_sheet', 'uploaded_file', 'presentation'));

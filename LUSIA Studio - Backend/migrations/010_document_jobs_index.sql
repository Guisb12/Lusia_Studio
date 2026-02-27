-- Indexes for document_jobs table
-- The status polling endpoint queries this table by artifact_id every 5 seconds
-- per active upload. Without indexes this is a full-table scan on every poll.

CREATE INDEX IF NOT EXISTS idx_document_jobs_artifact_id
    ON document_jobs (artifact_id);

-- Composite: most common query pattern is artifact_id + status
CREATE INDEX IF NOT EXISTS idx_document_jobs_artifact_status
    ON document_jobs (artifact_id, status);

-- Speeds up list_processing_artifacts which filters by org + user
CREATE INDEX IF NOT EXISTS idx_artifacts_org_user_processed
    ON artifacts (organization_id, user_id, is_processed);

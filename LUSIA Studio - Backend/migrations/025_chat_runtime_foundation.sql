/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 025 — CHAT RUNTIME FOUNDATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adds run-based execution and replay support for the student chat feature:
 *   - chat_runs: one record per assistant turn / execution
 *   - chat_run_events: structured runtime events for observability and replay
 *   - chat_messages upgrades: run linkage, transcript ordering, content blocks
 */

-- ── Runs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_run_id       UUID REFERENCES chat_runs(id) ON DELETE SET NULL,
    status              TEXT NOT NULL CHECK (status IN ('queued', 'streaming', 'requires_action', 'completed', 'failed', 'cancelled')),
    request_payload     JSONB NOT NULL DEFAULT '{}'::JSONB,
    pending_action      JSONB,
    error_message       TEXT,
    idempotency_key     TEXT,
    user_message_id     UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    assistant_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_runs_conversation
    ON chat_runs(conversation_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_runs_user_status
    ON chat_runs(user_id, status, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_runs_conversation_idempotency
    ON chat_runs(conversation_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- ── Message upgrades ────────────────────────────────────────────────────────

ALTER TABLE chat_messages
    ADD COLUMN IF NOT EXISTS run_id UUID REFERENCES chat_runs(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS content_blocks JSONB DEFAULT '[]'::JSONB;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_sequence
    ON chat_messages(conversation_id, sequence, created_at);

CREATE INDEX IF NOT EXISTS idx_chat_messages_run
    ON chat_messages(run_id, sequence);

-- ── Events ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_run_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id       UUID NOT NULL REFERENCES chat_runs(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    event_type   TEXT NOT NULL,
    block_id     INTEGER NOT NULL DEFAULT 0,
    payload      JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (run_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_chat_run_events_run_seq
    ON chat_run_events(run_id, seq);

-- ── Backfill run ordering on existing messages ──────────────────────────────

WITH ordered_messages AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at, id) AS row_num
    FROM chat_messages
)
UPDATE chat_messages AS m
SET sequence = ordered_messages.row_num
FROM ordered_messages
WHERE m.id = ordered_messages.id
  AND (m.sequence IS NULL OR m.sequence = 0);

UPDATE chat_messages
SET content_blocks = '[]'::JSONB
WHERE content_blocks IS NULL;

-- ── Row Level Security ──────────────────────────────────────────────────────

ALTER TABLE chat_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chat runs"
    ON chat_runs FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Users see events in own chat runs"
    ON chat_run_events FOR ALL
    USING (
        run_id IN (
            SELECT id FROM chat_runs WHERE user_id = auth.uid()
        )
    );

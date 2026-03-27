/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 027 — CHAT MODEL MODES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adds explicit model-mode persistence for chat runs so each turn records
 * whether it used the fast or thinking preset, plus the resolved model name.
 */

ALTER TABLE chat_runs
    ADD COLUMN IF NOT EXISTS model_mode TEXT NOT NULL DEFAULT 'fast'
        CHECK (model_mode IN ('fast', 'thinking')),
    ADD COLUMN IF NOT EXISTS model_name TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_runs_model_mode
    ON chat_runs(model_mode, started_at DESC);

UPDATE chat_runs
SET
    model_mode = COALESCE(NULLIF(request_payload->>'model_mode', ''), 'fast'),
    model_name = COALESCE(
        NULLIF(model_name, ''),
        NULLIF(request_payload->>'model_name', '')
    )
WHERE model_mode IS NULL
   OR model_name IS NULL;

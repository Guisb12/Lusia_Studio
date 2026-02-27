/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 006 — CHAT AI TABLES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Two tables for the student AI chat feature:
 *   - chat_conversations: top-level conversation metadata
 *   - chat_messages: individual messages within a conversation
 */

-- ── Conversations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user
    ON chat_conversations(user_id, updated_at DESC);

-- ── Messages ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chat_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content         TEXT NOT NULL DEFAULT '',
    tool_calls      JSONB,
    tool_call_id    TEXT,
    tool_name       TEXT,
    metadata        JSONB DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv
    ON chat_messages(conversation_id, created_at);

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see/manage their own conversations
CREATE POLICY "Users manage own conversations"
    ON chat_conversations FOR ALL
    USING (user_id = auth.uid());

-- Users can only see messages in conversations they own
CREATE POLICY "Users see messages in own conversations"
    ON chat_messages FOR ALL
    USING (
        conversation_id IN (
            SELECT id FROM chat_conversations WHERE user_id = auth.uid()
        )
    );

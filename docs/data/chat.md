---
last-updated: 2026-03-19
stability: semi-stable
agent-routing: "Read when working on chat/AI conversation data layer."
---

# Chat Domain Entities

AI chat conversations and messages. User-scoped (not org-scoped) — the only domain that scopes by `user_id` referencing `auth.users` instead of `organization_id`.

---

## Table: `chat_conversations`

**Purpose:** Stores AI chat conversation sessions, one per user interaction thread.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `user_id` | uuid | Owning user (Supabase auth) | FK → auth.users(id) ON DELETE CASCADE, NOT NULL |
| `title` | text | Conversation title (auto-generated or user-set) | |
| `created_at` | timestamptz | When conversation started | NOT NULL, DEFAULT now() |
| `updated_at` | timestamptz | Last activity timestamp | NOT NULL, DEFAULT now() |

### Indexes

```
Index: idx_chat_conversations_user
Columns: (user_id, updated_at DESC)
Type: btree composite
Purpose: Serves: conversation list sorted by recency per user
```

### Relationships

- Each conversation belongs to one Supabase auth user (`user_id` → `auth.users.id`) — NOT to a profile or organization.
- Each conversation has many messages (`chat_messages.conversation_id` → `chat_conversations.id`).
- Deleting a user cascades to delete all their conversations, which cascades to delete all messages.

### Access Patterns

- **List by user (recent first):** Chat service queries `.eq("user_id", user_id).order("updated_at", desc=True)`.
- **Get by ID:** `.eq("id", conversation_id).eq("user_id", user_id).limit(1)` — ownership check via user_id filter.
- **Create:** `.insert({"user_id": user_id, "title": title})`.
- **Update title:** `.update({"title": title}).eq("id", conversation_id).eq("user_id", user_id)`.
- **Delete:** `.delete().eq("id", conversation_id).eq("user_id", user_id)`.

### RLS Policies

- `Users manage own conversations`: FOR ALL USING (`user_id = auth.uid()`).

---

## Table: `chat_messages`

**Purpose:** Individual messages within a chat conversation — user prompts, assistant responses, tool calls, and system messages.

### Columns

| Column | Type | Purpose | Constraints |
|--------|------|---------|-------------|
| `id` | uuid | Primary key | PK, DEFAULT gen_random_uuid() |
| `conversation_id` | uuid | Parent conversation | FK → chat_conversations(id) ON DELETE CASCADE, NOT NULL |
| `role` | text | Message author type | NOT NULL, CHECK (role IN ('user', 'assistant', 'tool', 'system')) |
| `content` | text | Message text content | NOT NULL, DEFAULT '' |
| `tool_calls` | jsonb | Tool call data for assistant messages | |
| `tool_call_id` | text | ID of the tool call this message responds to | |
| `tool_name` | text | Name of the tool that produced this message | |
| `metadata` | jsonb | Additional message metadata | DEFAULT '{}' |
| `created_at` | timestamptz | When message was created | NOT NULL, DEFAULT now() |

### Indexes

```
Index: idx_chat_messages_conv
Columns: (conversation_id, created_at)
Type: btree composite
Purpose: Serves: loading all messages in a conversation in chronological order
```

### Relationships

- Each message belongs to one conversation (`conversation_id` → `chat_conversations.id`).
- Messages are ordered chronologically within a conversation via `created_at`.
- Tool messages reference their originating tool call via `tool_call_id` and `tool_name`.
- Deleting a conversation cascades to delete all its messages.

### Access Patterns

- **List messages for conversation:** `.eq("conversation_id", conversation_id).order("created_at", desc=False)`.
- **Append message:** `.insert({"conversation_id": conv_id, "role": role, "content": content, ...})`.
- **No pagination:** Messages are loaded in full per conversation (chat history is typically bounded by context window).

### RLS Policies

- `Users see messages in own conversations`: FOR ALL USING (`conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = auth.uid())`).

---

## Domain Relationships Summary

Chat is the most isolated domain in the system. Conversations scope by `auth.users.id` (not `profiles.id` or `organization_id`), making them independent of the multi-tenant organization model used everywhere else. Messages belong to conversations with a simple parent-child relationship and cascade delete. The chat backend (`app/chat/`) uses LangGraph for AI agent orchestration, but the data layer is straightforward: create conversations, append messages, list by user.

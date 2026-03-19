---
last-updated: 2026-03-19
stability: frequently-updated
agent-routing: "Read before working on chat feature code. Covers the LangGraph agent, SSE streaming, curriculum tools, and conversation data model."
---

# Chat

## 1. Overview

The chat is an AI tutoring assistant available to students. Students converse with a curriculum-aware LLM agent that can look up curriculum indexes and content to provide contextual, pedagogically-guided answers in European Portuguese. The system supports multimodal input (text + images), real-time streaming responses via SSE, and tool-calling for curriculum queries. Conversations are persisted in the database and organized in a sidebar list. This feature differs from most LUSIA features because it is **not CRUD** — it is a streaming LLM interaction with a LangGraph agent loop on the backend.

## 2. Availability

| Attribute | Value |
|---|---|
| **Roles** | Student (full access) |
| **Center types** | All (trial included) |
| **Student route** | `/student/chat` |

Teachers and admins do not have access to the chat feature. See `ARCHITECTURE.md` §Access Matrix.

## 3. Architecture

### 3.1 Route — `app/(student)/student/chat/page.tsx`

Server component. Calls `fetchChatConversationsServer()` to load the student's conversation list, then passes it as `initialConversations` to `ChatShell`. Only the conversation list is fetched server-side — messages are loaded on-demand when a conversation is selected.

A `loading.tsx` skeleton renders animated placeholder chat bubbles (user and assistant) during navigation.

### 3.2 Server Fetch — `lib/chat.server.ts`

Calls `fetchBackendJsonServer()` directly against the FastAPI backend to fetch `/api/v1/chat/conversations`. Returns `Conversation[]` with an empty-array fallback. Same pattern as calendar — skips the Next.js API route proxy for SSR.

### 3.3 Feature Shell — `components/chat/ChatShell.tsx`

Client component. Primes the conversation cache via `primeChatConversationsCache(initialConversations)` so the sidebar renders instantly without a loading state, then delegates all rendering to `ChatPage`.

### 3.4 Chat Page — `components/chat/ChatPage.tsx`

The orchestration layer (analogous to `CalendarShell` for calendar). Manages:

- **Conversation selection and creation** — tracks `activeConversationId` state, creates new conversations via `createConversationWithCache()`
- **Message fetching** — `useChatMessagesQuery(activeConversationId)` loads messages when a conversation is selected
- **Streaming** — `useChatStream()` hook manages the SSE connection, streaming text, and active tool calls
- **User message handling** — `handleSend()` creates an optimistic user message object, appends it to the message cache via `appendChatMessage()`, then calls `sendMessage()` to start the stream
- **Pending message detection** — checks `sessionStorage` for a pre-filled message (allows navigation to chat with a message ready to send from other parts of the app)
- **Stream completion** — `handleStreamComplete()` converts the accumulated streaming text and tool calls into a final assistant `Message` object and appends it to the cache

**Render states:**
- No conversations → `ChatSplash` (welcome screen with initial message input)
- Loading messages → skeleton
- Active conversation → `ChatContent` + `ChatInput`

### 3.5 UI Components

**Component tree:**

```
ChatShell
└── ChatPage
    ├── Sidebar (conversation list)
    ├── ChatSplash (empty state)
    │   └── ChatInput
    ├── ChatContent
    │   ├── ChatMessage (role=user) — per historical message
    │   │   ├── Subject context pills
    │   │   └── Image attachments
    │   ├── ChatMessage (role=assistant) — per historical message
    │   │   ├── Response (markdown renderer)
    │   │   ├── Tool call cards (from registry)
    │   │   └── Copy button
    │   └── Streaming message (live)
    │       ├── Response (partial markdown)
    │       └── Active tool call cards
    └── ChatInput
        ├── PromptInputTextarea
        ├── Image upload (drag-drop, paste, file picker)
        ├── ContextPicker
        │   ├── SubjectCombobox
        │   └── ThemeCombobox
        └── Send/Stop button
```

**ChatContent** (`components/chat/ChatContent.tsx`):
- Renders historical messages from query data and the live streaming message
- Auto-scrolls on new content via a scroll-to-bottom ref
- Sticky fade gradients at top and bottom for visual polish

**ChatMessage** (`components/chat/ChatMessage.tsx`):
- **UserMessage:** Parses `<subject_context>` XML tags from content to display context pills. Extracts `<frontend_images>` for image attachments. Renders plain text body.
- **AssistantMessage:** Token-fade effect splits content into rendered prefix (markdown) and streaming tail for progressive rendering. Renders tool call cards from the message's `toolCalls` record via the tool registry. Copy button appears on hover. Shows "A pensar..." shimmer when streaming with no content yet.

**ChatInput** (`components/chat/ChatInput.tsx`):
- Text input via auto-expanding textarea (Enter to submit, Shift+Enter for newline)
- Image upload: up to 4 images, max 10MB each, via file input, drag-drop, or paste. Images are uploaded immediately to `/api/chat/upload` and tracked with upload state (uploading/uploaded/error).
- Context picker: two-step flow — select subject (preferred subjects shown first) → select curriculum theme (fetched from curriculum nodes API). Selected context is wrapped in `<subject_context>` XML in the message.
- Send/Stop toggle button based on streaming state

**ChatSplash** (`components/chat/ChatSplash.tsx`):
- Welcome screen with animated Lusia logo, greeting ("Como posso ajudar hoje, {firstName}?"), and an embedded `ChatInput` for the first message

**Response** (`components/chat/Response.tsx`):
- Markdown renderer using `react-markdown` with plugins: `remarkGfm` (tables, strikethrough), `remarkMath` (LaTeX), `remarkBreaks`, `rehypeRaw` (HTML), `rehypeKatex` (math rendering)
- Handles incomplete markdown during streaming via `parseIncompleteMarkdown()` (closes unterminated tokens)
- Normalizes LaTeX delimiters (`\(...\)` → `$...$`, `\[...\]` → `$$...$$`)
- Custom components for lists, tables, headings, code blocks, blockquotes, images (with zoom modal)
- Memoized for performance

**CodeBlock** (`components/chat/CodeBlock.tsx`):
- Syntax-highlighted code blocks with copy-to-clipboard button (hover reveal)

### 3.6 Tool Rendering System

**Registry** (`components/chat/tools/registry.tsx`):
Maps tool names to renderer components:
- `get_curriculum_index` → `CurriculumIndexTool`
- `get_curriculum_content` → `CurriculumContentTool`
- Unknown tools → `DefaultTool`

**Tool call state** (`components/chat/tools/types.ts`):
```
ToolCallState {
    started: boolean       // execution initiated
    name: string           // tool function name
    args: string           // arguments passed
    result: string         // returned value
    final: boolean         // execution complete
    finalArgs: string      // stringified final arguments
}
```

**DefaultTool** (`components/chat/tools/DefaultTool.tsx`):
- Generic card with loading spinner or success checkmark, human-readable label (snake_case → Title Case), and progress bar shimmer during execution

**CurriculumIndexTool** (`components/chat/tools/CurriculumIndexTool.tsx`):
- Displays curriculum index search results with subject/year pills
- Parses structured markdown result to extract topics matching `- [emoji] **CODE** — Title`
- Collapsible topic list with count

**CurriculumContentTool** (`components/chat/tools/CurriculumContentTool.tsx`):
- Displays curriculum content retrieval with title extraction from `## CODE — Title`
- Collapsible content preview (max 400 chars) with gradient mask

### 3.7 Streaming Hook — `lib/hooks/use-chat-stream.ts`

The `useChatStream()` hook manages the entire SSE lifecycle:

**State:**
- `streamingText` — accumulated response text
- `status` — `idle | streaming | done | error`
- `activeToolCalls` — `Record<string, ToolCallState>` tracking live tool executions
- `error` — error message string

**SSE frame types:**

| Frame Type | Data | Action |
|---|---|---|
| `run_status` | `"streaming"` or `"done"` | Sets status |
| `token` | text delta | Appends to `streamingText` |
| `tool_call` | `{ name }` | Creates new entry in `activeToolCalls` |
| `tool_call_args` | `{ args }` | Attaches args to latest non-final tool |
| `tool_result` | `{ result }` | Marks tool as final with result |
| `error` | `{ message }` | Sets error state |

**`sendMessage(conversationId, message, images?)`:**
1. Aborts any existing stream via `AbortController`
2. POSTs to `/api/chat/conversations/{id}/stream` with `{ message, images }`
3. Reads response body as newline-delimited JSON (SSE)
4. Parses each frame and updates state accordingly
5. Handles `AbortError` gracefully for user cancellation

**`cancel()`:** Aborts the current stream and resets to idle.
**`reset()`:** Clears all streaming state (text, tools, error).

### 3.8 Next.js API Routes

All routes are thin auth proxies following the standard pattern. See `STANDARDS.md` §API Design Rules.

| Route File | Method | Proxies To |
|---|---|---|
| `app/api/chat/conversations/route.ts` | `GET` | `GET /api/v1/chat/conversations` |
| | `POST` | `POST /api/v1/chat/conversations` |
| `app/api/chat/conversations/[id]/route.ts` | `DELETE` | `DELETE /api/v1/chat/conversations/{id}` |
| `app/api/chat/conversations/[id]/messages/route.ts` | `GET` | `GET /api/v1/chat/conversations/{id}/messages` |
| `app/api/chat/conversations/[id]/stream/route.ts` | `POST` | `POST /api/v1/chat/conversations/{id}/stream` |
| `app/api/chat/upload/route.ts` | `POST` | `POST /api/v1/chat/storage/upload` |

The stream route returns the response with `content-type: text/event-stream`, preserving the SSE format from the backend.

### 3.9 Backend Router — `routers/chat.py`

| Method | Path | Auth | Delegates to |
|---|---|---|---|
| `GET` | `/conversations` | `require_student` | `ChatService.list_conversations()` |
| `POST` | `/conversations` | `require_student` | `ChatService.create_conversation()` |
| `GET` | `/conversations/{id}/messages` | `require_student` | `ChatService.list_messages()` |
| `POST` | `/conversations/{id}/stream` | `require_student` | `stream_chat_response()` (SSE generator) |
| `DELETE` | `/conversations/{id}` | `require_student` | `ChatService.delete_conversation()` |
| `POST` | `/storage/upload` | `require_student` | Direct Supabase Storage upload |

**Stream endpoint details:**
- Validates that message or images are non-empty
- Loads user's preferred subjects via `ChatService.get_user_preferred_subjects()`
- Extracts `grade_level` from user profile and converts to `education_level` string
- Returns `StreamingResponse` with headers: `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`

**Upload endpoint details:**
- Validates MIME type: `image/jpeg`, `image/png`, `image/gif`, `image/webp`
- Max file size: 10 MB
- Storage bucket: `chat-images`
- Storage path: `{org_id}/{user_id}/{uuid}.{ext}`
- Creates bucket if it doesn't exist (public bucket)
- Returns public URL and storage path

### 3.10 Backend Agent — `app/chat/agent.py`

LangGraph agent implementing a tool-calling loop:

```
START → agent_node → should_continue? ─── has tool_calls ──→ tools → agent_node (loop)
                                       └── no tool_calls ──→ END
```

**`ChatState`:**
- `messages: Annotated[list, add_messages]` — conversation history (LangChain message objects)
- `user_name: str` — student's display name
- `grade_level: str` — e.g., "7"
- `education_level: str` — e.g., "3.º Ciclo (7.º–9.º ano)"
- `preferred_subjects: list[dict]` — student's subject list with names/IDs

**`_agent_node(state)`:** Invokes the LLM with tools bound. Prepends the system prompt (built dynamically from user context) if not already present in message history.

**`_should_continue(state)`:** If the last AI message has `tool_calls`, routes to the `tools` node. Otherwise routes to `END`.

**`build_chat_graph()`:** Compiles the LangGraph `StateGraph` with agent and tools nodes. Uses a singleton pattern — the graph is compiled once and reused.

### 3.11 LLM Configuration — `app/chat/llm.py`

Factory function `get_chat_llm()` returns a `ChatOpenAI` instance configured for OpenRouter:

- **API base:** `https://openrouter.ai/api/v1`
- **API key:** `OPENROUTER_API_KEY` from settings
- **Model:** Configurable via `CHAT_MODEL` or `OPENROUTER_MODEL` setting (default: `google/gemini-3-flash-preview`)
- **Temperature:** Configurable via `CHAT_TEMPERATURE` (default: 0.4)
- **Max tokens:** Configurable via `CHAT_MAX_TOKENS` (default: 8192)
- **Streaming:** Always enabled

### 3.12 System Prompt — `app/chat/prompts.py`

`build_system_prompt(state)` constructs a dynamic system prompt incorporating:

- **Student profile:** Name, year/grade, education level, preferred subjects
- **Language rules:** European Portuguese, Markdown formatting, LaTeX math support (`$...$` and `$$...$$`)
- **Pedagogical rules:** Encourage critical thinking, use practical examples, reference curriculum tools
- **Tool documentation:** Describes `get_curriculum_index` and `get_curriculum_content` with usage instructions
- **Workflow guidance:** 2-step process — first search the index, then fetch content for relevant nodes
- **Current date injection**

Education level labels map Portuguese school years to cycle names (e.g., 7 → "3.º Ciclo (7.º–9.º ano)").

### 3.13 Agent Tools — `app/chat/tools.py`

Two LangChain `@tool`-decorated functions exported as `CHAT_TOOLS`:

**`get_curriculum_index(subject_name, year_level, subject_component?)`:**
- Resolves subject name to UUID via `_resolve_subject_id()` (case-insensitive, partial match fallback)
- Maps year to education level via `YEAR_TO_EDUCATION_LEVEL` dict
- Queries curriculum nodes at levels 0-2 (domains, chapters, subchapters) filtered by subject + education level
- Returns a formatted hierarchical tree with emoji icons (`📂`, `📄`), level indicators, and node IDs

**`get_curriculum_content(node_id, subject_name, year_level)`:**
- Fetches all leaf nodes under the target node (via code prefix pattern matching)
- Batch-fetches `base_content` records by `curriculum_id`
- Builds hierarchy headers showing the node's ancestor path
- Extracts text from structured `content_json` fields
- Returns formatted content with headers and body text

**Helper functions:**
- `_resolve_subject_id()` — matches subject name + year to a UUID. First tries case-insensitive exact match, then partial match.
- `_build_tree()` — formats flat node list into indented hierarchical tree string
- `_extract_text_from_content()` — extracts markdown/text from JSON-structured content

### 3.14 Streaming Pipeline — `app/chat/streaming.py`

`stream_chat_response()` is an async generator that produces SSE events:

1. **Save user message** to DB with metadata (images list if provided)
2. **Load conversation history** from DB (all messages in the conversation)
3. **Build multimodal content** if images present — creates `HumanMessage` with `[{type: "text", text: ...}, {type: "image_url", image_url: {url: ...}}]`
4. **Build agent state** with messages, user context (name, grade, education level, subjects)
5. **Stream LangGraph events** via `graph.astream_events(state, version="v2")`:
   - `on_chat_model_stream` → yields `token` frames for text deltas
   - `on_chat_model_stream` with `tool_call_chunks` → yields `tool_call` frames (name only)
   - `on_tool_start` → yields `tool_call_args` frames with input arguments
   - `on_tool_end` → yields `tool_result` frames with output
6. **Save assistant message** to DB with `tool_calls` (results truncated to 2000 chars each)
7. **Auto-generate title** from first user message (first 60 chars) if conversation has no title
8. **Error handling** — catches exceptions, yields `error` frame, saves error message to DB

SSE format: each event is a JSON line prefixed with `data: ` and terminated with `\n\n`.

### 3.15 Chat Service — `app/chat/service.py`

`ChatService` class encapsulates all database operations. Instantiated with a Supabase client.

**Conversation operations:**
- `list_conversations(user_id)` — max 50 conversations, ordered by `updated_at DESC`
- `create_conversation(user_id)` — creates empty conversation, returns it
- `get_conversation(user_id, conversation_id)` — fetches with ownership verification
- `delete_conversation(user_id, conversation_id)` — verifies ownership, then deletes
- `update_conversation_title(conversation_id, title)` — updates title field
- `touch_conversation(conversation_id)` — sets `updated_at` to now

**Message operations:**
- `list_messages(user_id, conversation_id)` — all messages in conversation, verifies ownership, ordered by `created_at ASC`
- `save_message(conversation_id, role, content, ...)` — inserts message with optional `tool_calls`, `tool_call_id`, `tool_name`, `metadata`; touches the parent conversation's `updated_at`

**User data:**
- `get_user_preferred_subjects(user_id)` — fetches subject details from the user's `subject_ids` preference list

**Note:** This service does NOT follow the `FEATURE_LIST_SELECT`/`FEATURE_DETAIL_SELECT` pattern from `STANDARDS.md` because chat has no summary/detail split — conversations are lightweight and messages are always fetched in full per conversation.

## 4. Cache Contract

| Attribute | Value |
|---|---|
| **Conversation namespace** | `chat:conversations` (single key, not parameterized) |
| **Message namespace** | `chat:messages:{conversationId}` |
| **Conversation staleTime** | 60,000ms (1 minute) |
| **Message staleTime** | 60,000ms (1 minute) |

**Conversation query key:**
- `buildChatConversationsQueryKey()` → `"chat:conversations"`
- Single key — no pagination, no filters. All conversations are fetched at once (capped at 50 by backend).

**Message query keys:**
- `buildChatMessagesQueryKey(conversationId)` → `"chat:messages:{conversationId}"`
- One key per conversation. Messages are loaded on-demand when a conversation is selected.

**Cache updates on mutations:**

| Action | Cache Update |
|---|---|
| Create conversation | `patchChatConversationsQuery()` — appends new conversation, re-sorts by `updated_at` |
| Delete conversation | `patchChatConversationsQuery()` — removes from list; `setChatMessagesData(id, [])` — clears message cache |
| Send message (user) | `appendChatMessage()` — appends user message to the conversation's message cache |
| Stream complete (assistant) | `appendChatMessage()` — appends final assistant message with `tool_calls` |

**Invalidation rules:**

| Trigger | What is invalidated |
|---|---|
| Error during stream | No automatic invalidation (error is displayed in-line) |
| `invalidateChatQueries()` | Invalidates the conversations list query |
| `invalidateChatMessagesQuery(id)` | Invalidates messages for a specific conversation |

**What the chat cache does NOT have** (compared to calendar):
- No snapshot/restore — chat does not use optimistic mutations with rollback
- No cross-query sync — each conversation's messages are independent
- No prefetch — messages are fetched on conversation selection only
- No summary/detail split — all message data is fetched in full

## 5. Optimistic Update Strategy

Chat uses a **simpler optimistic pattern** than the standard `STANDARDS.md` contract because messages are append-only and streaming prevents traditional optimistic mutations:

1. **User message:** Immediately appended to the message cache via `appendChatMessage()` before the stream starts. No snapshot or rollback — user messages are always valid (they reflect exactly what the user typed).

2. **Assistant message (streaming):** Displayed live via the `useChatStream()` hook state (`streamingText`, `activeToolCalls`). NOT written to cache during streaming. Only appended to cache via `appendChatMessage()` after the stream completes.

3. **No rollback needed:** If the stream fails, the error is displayed inline. The user message remains in the cache (it was saved to DB). No cache restoration is needed because no optimistic assistant message was ever written to cache.

This is intentionally different from the full snapshot → apply → restore pattern used by calendar, assignments, and other CRUD features. Chat is append-only — there is no update/delete on messages.

## 6. Payload Shapes

### Conversation

```typescript
interface Conversation {
    id: string
    title: string | null
    created_at: string
    updated_at: string
}
```

Used in both the conversation list and detail — no summary/detail split. Conversations are lightweight metadata containers.

### Message

```typescript
interface Message {
    id: string
    role: "user" | "assistant"
    content: string
    created_at: string
    metadata: Record<string, unknown>
    tool_calls: Array<{
        name: string
        args: string
        result: string
    }>
}
```

Frontend filters to `user` and `assistant` roles only. `tool` and `system` role messages exist in the DB but are excluded from the frontend query.

The `metadata` field stores auxiliary data (e.g., `{ images: [url1, url2] }` for user messages with images).

The `tool_calls` array is populated on assistant messages that invoked tools. Each entry records the tool name, arguments, and result.

### Backend Schemas

**`SendMessageRequest`** (Pydantic):
```
message: str (max 10,000 chars)
images: list[str] | None (max 4 URLs)
```

**`ConversationOut`:** `id, title, created_at, updated_at`

**`MessageOut`:** `id, role, content, tool_calls, tool_name, metadata, created_at`

## 7. Database

### Tables

| Table | Description |
|---|---|
| `chat_conversations` | Conversation metadata — links to user, tracks title and timestamps |
| `chat_messages` | Individual messages — content, role, tool calls, metadata |

Cross-reference: See `data/chat.md` for full entity schemas, column definitions, and index details.

### Schema

**`chat_conversations`:**

| Column | Type | Purpose |
|---|---|---|
| `id` | `UUID` (PK, auto) | Conversation identifier |
| `user_id` | `UUID` (FK → `auth.users`, CASCADE) | Owning student |
| `title` | `TEXT` (nullable) | Auto-generated from first message (first 60 chars) |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | Last activity timestamp (touched on every new message) |

**`chat_messages`:**

| Column | Type | Purpose |
|---|---|---|
| `id` | `UUID` (PK, auto) | Message identifier |
| `conversation_id` | `UUID` (FK → `chat_conversations`, CASCADE) | Parent conversation |
| `role` | `TEXT` (CHECK: `user`, `assistant`, `tool`, `system`) | Message sender type |
| `content` | `TEXT` (default `''`) | Message text content |
| `tool_calls` | `JSONB` (nullable) | Tool invocations on assistant messages |
| `tool_call_id` | `TEXT` (nullable) | Links tool result to its call |
| `tool_name` | `TEXT` (nullable) | Tool function name (on tool role messages) |
| `metadata` | `JSONB` (default `{}`) | Auxiliary data (e.g., image URLs) |
| `created_at` | `TIMESTAMPTZ` | Message timestamp |

### Indexes

| Index | Table | Columns | Serves |
|---|---|---|---|
| `idx_chat_conversations_user_updated` | `chat_conversations` | `(user_id, updated_at DESC)` | Listing user's conversations sorted by recent activity |
| `idx_chat_messages_conversation_created` | `chat_messages` | `(conversation_id, created_at)` | Loading messages for a conversation in chronological order |

### Row-Level Security

Both tables have RLS enabled:
- **`chat_conversations`:** Users can only select, insert, update, delete their own conversations (`user_id = auth.uid()`)
- **`chat_messages`:** Users can only access messages in their own conversations (join to `chat_conversations` on `user_id = auth.uid()`)

### Read Patterns

| Pattern | Index Used | Query Shape |
|---|---|---|
| User's conversation list | `idx_chat_conversations_user_updated` | `.eq("user_id", uid).order("updated_at", desc=True).limit(50)` |
| Single conversation | Primary key + `user_id` check | `.eq("id", cid).eq("user_id", uid)` |
| Messages in conversation | `idx_chat_messages_conversation_created` | `.eq("conversation_id", cid).order("created_at")` |

## 8. Edge Cases and Notes

### Conversation Title Auto-Generation

When a conversation's first message is sent, the streaming pipeline auto-generates a title from the first 60 characters of the user's message via `_generate_title_sync()`. This happens after the assistant response is saved, so it doesn't block streaming.

### Pending Message via SessionStorage

Other parts of the app can navigate to `/student/chat` with a pre-filled message by setting a `sessionStorage` entry. `ChatPage` checks for this on mount — if found, it creates a new conversation and sends the pending message automatically. This enables flows like "ask the AI about this topic" from other student pages.

### Image Upload and Multimodal Messages

- Images are uploaded immediately on attachment (not on send) to `/api/chat/upload` → Supabase Storage
- Up to 4 images per message, max 10 MB each
- Allowed types: JPEG, PNG, GIF, WebP
- The backend builds multimodal `HumanMessage` content with `[{type: "text"}, {type: "image_url"}]` for LLM consumption
- Image URLs are stored in message `metadata.images`

### Subject Context Injection

When a student selects a subject and/or curriculum theme in the context picker, the input is wrapped in XML:
```
<subject_context>Matemática · Funções</subject_context>
What is a quadratic function?
```
The frontend parses this XML to display context pills. The LLM receives the full text including the XML tag, providing subject context for better answers.

### Tool Result Truncation

Tool results saved to the database are truncated to 2,000 characters each to prevent oversized message records. The full result is streamed to the frontend in real time but only the truncated version is persisted.

### Conversation History Loading

On each new message turn, the full conversation history is loaded from the database and passed to the LangGraph agent as context. There is no windowing or summarization — all messages in the conversation are included. This means very long conversations may hit LLM context limits.

### Stream Abort Handling

The frontend `useChatStream` hook supports user cancellation via `cancel()`. This aborts the `fetch` request. The backend does not receive explicit cancellation — the SSE connection simply closes. Any partial assistant response is NOT saved to the database (only complete responses are saved).

### No Conversation Update/Rename

Conversations cannot be renamed by the user. The title is auto-generated from the first message. The only user mutation on conversations is delete.

### Message Roles in DB vs Frontend

The database stores four message roles: `user`, `assistant`, `tool`, `system`. The frontend query filters to `user` and `assistant` only. Tool messages (intermediate tool call results) and system messages (system prompt) exist in the DB for the LangGraph agent's conversation history but are not displayed to the user. Tool call information is surfaced via the `tool_calls` field on assistant messages instead.

## 9. Reference Status

The chat feature is **not** the reference implementation for LUSIA Studio engineering standards — that role belongs to calendar. Chat intentionally diverges from several standard patterns due to its unique architecture:

| Standard Pattern | Chat Approach | Why |
|---|---|---|
| Summary/detail payload split | No split — conversations are lightweight, messages are always full | No list rendering of messages; conversations have only 4 fields |
| `FEATURE_LIST_SELECT` / `FEATURE_DETAIL_SELECT` | Not used | `ChatService` uses simple selects; no batch hydration needed |
| Optimistic snapshot → restore | Append-only optimistic | Messages are never updated or deleted; streaming prevents traditional optimistic patterns |
| Feature query module with full contract | Simplified — no snapshot/restore, no cross-query sync, no prefetch | Chat's data model is append-only conversations + messages, not mutable entity lists |
| Server-side initial data for first paint | Conversations only (not messages) | Messages are loaded on conversation selection, not on route load |
| Batch hydration | Not applicable | No foreign key relationships to hydrate on messages |

When building or refactoring the chat feature, refer to this doc for chat-specific patterns, and to `STANDARDS.md` for general engineering rules that still apply (cache key design, API route thinness, error handling).

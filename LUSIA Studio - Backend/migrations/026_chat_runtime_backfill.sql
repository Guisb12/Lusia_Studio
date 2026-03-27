/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 026 — CHAT RUNTIME BACKFILL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Upgrades pre-runtime chat history into the new model by:
 *   - creating a chat_run for each historical assistant turn
 *   - linking existing user / assistant messages to that run
 *   - generating replayable assistant content_blocks
 *   - inserting synthetic assistant-tool-call and tool-result transcript rows
 *   - generating structured run events for historical replay / observability
 */

-- ── Identify assistant turns that predate the runtime model ─────────────────

CREATE TEMP TABLE tmp_chat_backfill_targets AS
SELECT
    gen_random_uuid() AS run_id,
    assistant.id AS assistant_message_id,
    assistant.conversation_id,
    convo.user_id,
    assistant.created_at AS assistant_created_at,
    COALESCE(assistant.content, '') AS assistant_content,
    COALESCE(assistant.tool_calls, '[]'::JSONB) AS assistant_tool_calls,
    COALESCE(assistant.metadata, '{}'::JSONB) AS assistant_metadata,
    user_msg.id AS user_message_id,
    COALESCE(user_msg.content, '') AS user_content,
    COALESCE(user_msg.metadata, '{}'::JSONB) AS user_metadata,
    CASE
        WHEN COALESCE(assistant.metadata->>'run_status', '') = 'requires_action' THEN 'requires_action'
        ELSE 'completed'
    END AS run_status
FROM chat_messages AS assistant
JOIN chat_conversations AS convo
    ON convo.id = assistant.conversation_id
LEFT JOIN LATERAL (
    SELECT u.id, u.content, u.metadata
    FROM chat_messages AS u
    WHERE u.conversation_id = assistant.conversation_id
      AND u.role = 'user'
      AND u.created_at <= assistant.created_at
    ORDER BY u.created_at DESC, u.id DESC
    LIMIT 1
) AS user_msg ON TRUE
WHERE assistant.role = 'assistant'
  AND assistant.run_id IS NULL;

-- ── Create historical runs ──────────────────────────────────────────────────

INSERT INTO chat_runs (
    id,
    conversation_id,
    user_id,
    status,
    request_payload,
    pending_action,
    user_message_id,
    assistant_message_id,
    started_at,
    completed_at,
    created_at,
    updated_at
)
SELECT
    target.run_id,
    target.conversation_id,
    target.user_id,
    target.run_status,
    jsonb_strip_nulls(
        jsonb_build_object(
            'message', NULLIF(target.user_content, ''),
            'images', COALESCE(target.user_metadata->'images', '[]'::JSONB),
            'backfilled', true
        )
    ),
    CASE
        WHEN target.run_status = 'requires_action'
            THEN COALESCE(
                target.assistant_metadata->'pending_action',
                jsonb_build_object(
                    'type', 'clarification_request',
                    'question', NULLIF(target.assistant_content, ''),
                    'resume_run_id', target.run_id::TEXT
                )
            )
        ELSE NULL
    END,
    target.user_message_id,
    target.assistant_message_id,
    target.assistant_created_at,
    CASE
        WHEN target.run_status IN ('completed', 'requires_action') THEN target.assistant_created_at
        ELSE NULL
    END,
    target.assistant_created_at,
    target.assistant_created_at
FROM tmp_chat_backfill_targets AS target;

-- ── Link historical transcript rows to their run ────────────────────────────

UPDATE chat_messages AS assistant
SET
    run_id = target.run_id,
    metadata = COALESCE(assistant.metadata, '{}'::JSONB) ||
        jsonb_build_object('message_kind', 'assistant_final', 'backfilled', true)
FROM tmp_chat_backfill_targets AS target
WHERE assistant.id = target.assistant_message_id;

WITH unique_user_links AS (
    SELECT user_message_id, MIN(run_id::TEXT)::UUID AS run_id
    FROM tmp_chat_backfill_targets
    WHERE user_message_id IS NOT NULL
    GROUP BY user_message_id
    HAVING COUNT(*) = 1
)
UPDATE chat_messages AS user_msg
SET
    run_id = links.run_id,
    metadata = COALESCE(user_msg.metadata, '{}'::JSONB) || jsonb_build_object('backfilled', true)
FROM unique_user_links AS links
WHERE user_msg.id = links.user_message_id
  AND user_msg.run_id IS NULL;

-- ── Insert synthetic assistant-tool-call rows for replay fidelity ───────────

INSERT INTO chat_messages (
    id,
    conversation_id,
    role,
    content,
    run_id,
    sequence,
    tool_calls,
    content_blocks,
    metadata,
    created_at
)
SELECT
    gen_random_uuid(),
    target.conversation_id,
    'assistant',
    '',
    target.run_id,
    0,
    target.assistant_tool_calls,
    '[]'::JSONB,
    jsonb_build_object(
        'message_kind', 'assistant_tool_call',
        'backfilled', true,
        'source_assistant_message_id', target.assistant_message_id::TEXT
    ),
    target.assistant_created_at - INTERVAL '3 milliseconds'
FROM tmp_chat_backfill_targets AS target
WHERE jsonb_array_length(target.assistant_tool_calls) > 0;

-- ── Insert synthetic tool-result rows for LLM replay fidelity ───────────────

INSERT INTO chat_messages (
    id,
    conversation_id,
    role,
    content,
    run_id,
    sequence,
    tool_call_id,
    tool_name,
    content_blocks,
    metadata,
    created_at
)
SELECT
    gen_random_uuid(),
    target.conversation_id,
    'tool',
    COALESCE(tool_call.value->>'result', ''),
    target.run_id,
    0,
    target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
    COALESCE(tool_call.value->>'name', 'tool'),
    '[]'::JSONB,
    jsonb_build_object(
        'args', COALESCE(tool_call.value->'args', '{}'::JSONB),
        'message_kind', 'tool_result',
        'backfilled', true,
        'source_assistant_message_id', target.assistant_message_id::TEXT
    ),
    target.assistant_created_at - INTERVAL '2 milliseconds' + ((tool_call.ordinality - 1) * INTERVAL '1 millisecond')
FROM tmp_chat_backfill_targets AS target
CROSS JOIN LATERAL jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)
WHERE jsonb_array_length(target.assistant_tool_calls) > 0;

-- ── Build replayable content blocks for historical assistant rows ───────────

WITH historical_blocks AS (
    SELECT
        target.assistant_message_id,
        CASE
            WHEN target.run_status = 'requires_action' THEN
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
                                'type', 'tool_call',
                                'block_id', tool_call.ordinality - 1,
                                'tool_name', COALESCE(tool_call.value->>'name', 'tool'),
                                'args', COALESCE(tool_call.value->'args', '{}'::JSONB),
                                'result', COALESCE(tool_call.value->>'result', ''),
                                'state', 'completed'
                            )
                            ORDER BY tool_call.ordinality
                        )
                        FROM jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)
                    ),
                    '[]'::JSONB
                ) || jsonb_build_array(
                    jsonb_build_object(
                        'id', target.assistant_message_id::TEXT || ':clarification',
                        'type', 'clarification_request',
                        'question', COALESCE(
                            target.assistant_metadata->'pending_action'->>'question',
                            NULLIF(target.assistant_content, ''),
                            'Podes esclarecer melhor o que pretendes?'
                        ),
                        'reason', NULLIF(target.assistant_metadata->'pending_action'->>'reason', '')
                    )
                )
            ELSE
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
                                'type', 'tool_call',
                                'block_id', tool_call.ordinality - 1,
                                'tool_name', COALESCE(tool_call.value->>'name', 'tool'),
                                'args', COALESCE(tool_call.value->'args', '{}'::JSONB),
                                'result', COALESCE(tool_call.value->>'result', ''),
                                'state', 'completed'
                            )
                            ORDER BY tool_call.ordinality
                        )
                        FROM jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)
                    ),
                    '[]'::JSONB
                ) || CASE
                    WHEN NULLIF(BTRIM(target.assistant_content), '') IS NOT NULL THEN
                        jsonb_build_array(
                            jsonb_build_object(
                                'id', target.assistant_message_id::TEXT || ':text',
                                'type', 'assistant_text',
                                'block_id', jsonb_array_length(target.assistant_tool_calls),
                                'text', target.assistant_content
                            )
                        )
                    ELSE '[]'::JSONB
                END
        END AS content_blocks
    FROM tmp_chat_backfill_targets AS target
)
UPDATE chat_messages AS assistant
SET content_blocks = historical_blocks.content_blocks
FROM historical_blocks
WHERE assistant.id = historical_blocks.assistant_message_id;

-- ── Generate historical run events ──────────────────────────────────────────

WITH tool_event_rows AS (
    SELECT
        target.run_id,
        (tool_call.ordinality - 1) AS block_id,
        (100 + ((tool_call.ordinality - 1) * 10) + 1) AS sort_key,
        'tool.call.started' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', tool_call.ordinality - 1,
            'tool_call_id', target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
            'tool_name', COALESCE(tool_call.value->>'name', 'tool'),
            'args', COALESCE(tool_call.value->'args', '{}'::JSONB)
        ) AS payload,
        target.assistant_created_at - INTERVAL '2 milliseconds' + ((tool_call.ordinality - 1) * INTERVAL '1 millisecond') AS created_at
    FROM tmp_chat_backfill_targets AS target
    CROSS JOIN LATERAL jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)

    UNION ALL

    SELECT
        target.run_id,
        (tool_call.ordinality - 1) AS block_id,
        (100 + ((tool_call.ordinality - 1) * 10) + 2) AS sort_key,
        'tool.call.completed' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', tool_call.ordinality - 1,
            'tool_call_id', target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
            'tool_name', COALESCE(tool_call.value->>'name', 'tool'),
            'args', COALESCE(tool_call.value->'args', '{}'::JSONB)
        ) AS payload,
        target.assistant_created_at - INTERVAL '1500 microseconds' + ((tool_call.ordinality - 1) * INTERVAL '1 millisecond') AS created_at
    FROM tmp_chat_backfill_targets AS target
    CROSS JOIN LATERAL jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)

    UNION ALL

    SELECT
        target.run_id,
        (tool_call.ordinality - 1) AS block_id,
        (100 + ((tool_call.ordinality - 1) * 10) + 3) AS sort_key,
        'tool.result' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', tool_call.ordinality - 1,
            'tool_call_id', target.assistant_message_id::TEXT || ':tool:' || tool_call.ordinality::TEXT,
            'tool_name', COALESCE(tool_call.value->>'name', 'tool'),
            'args', COALESCE(tool_call.value->'args', '{}'::JSONB),
            'content', COALESCE(tool_call.value->>'result', '')
        ) AS payload,
        target.assistant_created_at - INTERVAL '1 millisecond' + ((tool_call.ordinality - 1) * INTERVAL '1 millisecond') AS created_at
    FROM tmp_chat_backfill_targets AS target
    CROSS JOIN LATERAL jsonb_array_elements(target.assistant_tool_calls) WITH ORDINALITY AS tool_call(value, ordinality)
),
text_event_rows AS (
    SELECT
        target.run_id,
        jsonb_array_length(target.assistant_tool_calls) AS block_id,
        1000 AS sort_key,
        'assistant.block.started' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', jsonb_array_length(target.assistant_tool_calls),
            'format', 'markdown'
        ) AS payload,
        target.assistant_created_at - INTERVAL '500 microseconds' AS created_at
    FROM tmp_chat_backfill_targets AS target
    WHERE target.run_status <> 'requires_action'
      AND NULLIF(BTRIM(target.assistant_content), '') IS NOT NULL

    UNION ALL

    SELECT
        target.run_id,
        jsonb_array_length(target.assistant_tool_calls) AS block_id,
        1001 AS sort_key,
        'assistant.block.delta' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', jsonb_array_length(target.assistant_tool_calls),
            'delta', target.assistant_content
        ) AS payload,
        target.assistant_created_at - INTERVAL '250 microseconds' AS created_at
    FROM tmp_chat_backfill_targets AS target
    WHERE target.run_status <> 'requires_action'
      AND NULLIF(BTRIM(target.assistant_content), '') IS NOT NULL

    UNION ALL

    SELECT
        target.run_id,
        jsonb_array_length(target.assistant_tool_calls) AS block_id,
        1002 AS sort_key,
        'assistant.block.completed' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'block_id', jsonb_array_length(target.assistant_tool_calls)
        ) AS payload,
        target.assistant_created_at AS created_at
    FROM tmp_chat_backfill_targets AS target
    WHERE target.run_status <> 'requires_action'
      AND NULLIF(BTRIM(target.assistant_content), '') IS NOT NULL
),
final_event_rows AS (
    SELECT
        target.run_id,
        0 AS block_id,
        1 AS sort_key,
        'run.started' AS event_type,
        jsonb_build_object(
            'run_id', target.run_id::TEXT,
            'conversation_id', target.conversation_id::TEXT,
            'status', target.run_status
        ) AS payload,
        target.assistant_created_at - INTERVAL '4 milliseconds' AS created_at
    FROM tmp_chat_backfill_targets AS target

    UNION ALL

    SELECT
        target.run_id,
        0 AS block_id,
        2000 AS sort_key,
        CASE
            WHEN target.run_status = 'requires_action' THEN 'run.requires_action'
            ELSE 'run.completed'
        END AS event_type,
        CASE
            WHEN target.run_status = 'requires_action' THEN
                jsonb_build_object(
                    'run_id', target.run_id::TEXT,
                    'conversation_id', target.conversation_id::TEXT,
                    'action', COALESCE(
                        target.assistant_metadata->'pending_action',
                        jsonb_build_object(
                            'type', 'clarification_request',
                            'question', COALESCE(NULLIF(target.assistant_content, ''), 'Podes esclarecer melhor o que pretendes?'),
                            'resume_run_id', target.run_id::TEXT
                        )
                    )
                )
            ELSE
                jsonb_build_object(
                    'run_id', target.run_id::TEXT,
                    'conversation_id', target.conversation_id::TEXT,
                    'assistant_message_id', target.assistant_message_id::TEXT,
                    'status', 'completed'
                )
        END AS payload,
        target.assistant_created_at AS created_at
    FROM tmp_chat_backfill_targets AS target
),
all_event_rows AS (
    SELECT * FROM final_event_rows
    UNION ALL
    SELECT * FROM tool_event_rows
    UNION ALL
    SELECT * FROM text_event_rows
),
sequenced_event_rows AS (
    SELECT
        run_id,
        ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY sort_key, created_at, event_type) AS seq,
        event_type,
        block_id,
        payload,
        created_at
    FROM all_event_rows
)
INSERT INTO chat_run_events (id, run_id, seq, event_type, block_id, payload, created_at)
SELECT
    gen_random_uuid(),
    run_id,
    seq,
    event_type,
    block_id,
    payload,
    created_at
FROM sequenced_event_rows;

-- ── Rebuild message ordering now that synthetic rows exist ──────────────────

WITH ordered_messages AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY conversation_id
            ORDER BY created_at, id
        ) AS row_num
    FROM chat_messages
)
UPDATE chat_messages AS message
SET sequence = ordered_messages.row_num
FROM ordered_messages
WHERE message.id = ordered_messages.id;

DROP TABLE IF EXISTS tmp_chat_backfill_targets;

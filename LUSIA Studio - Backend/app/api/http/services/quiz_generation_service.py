"""
Quiz generation service — business logic for the AI quiz creation pipeline.

Handles artifact creation, curriculum matching, and streaming question generation.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from supabase import Client

from app.api.http.schemas.quiz_generation import (
    CurriculumMatchIn,
    GeneratedQuestion,
    QuizGenerationStartIn,
)
from app.pipeline.clients.openrouter import (
    OpenRouterError,
    chat_completion,
    chat_completion_stream,
)
from app.pipeline.steps.categorize_document import (
    get_curriculum_tree,
    get_subject_name,
    serialize_tree,
)
from app.pipeline.steps.extract_questions import (
    insert_question_tree,
    normalize_content,
    validate_type,
)
from app.utils.db import parse_single_or_404, supabase_execute

logger = logging.getLogger(__name__)


# ── Artifact creation ─────────────────────────────────────────


def create_quiz_artifact(
    db: Client,
    org_id: str,
    user_id: str,
    payload: QuizGenerationStartIn,
) -> dict:
    """
    Create a quiz artifact row with is_processed=False.

    Stores generation parameters in the content JSONB for the stream
    endpoint to pick up later.
    """
    subject_name = get_subject_name(db, payload.subject_id) or "Quiz"
    artifact_name = f"Quiz · {subject_name} · {payload.year_level}º ano"

    now = datetime.now(timezone.utc).isoformat()

    insert_data = {
        "organization_id": org_id,
        "user_id": user_id,
        "artifact_type": "quiz",
        "source_type": "native",
        "artifact_name": artifact_name,
        "icon": "📝",
        "content": {
            "generation_params": {
                "source_type": payload.source_type,
                "upload_artifact_id": payload.upload_artifact_id,
                "num_questions": payload.num_questions,
                "difficulty": payload.difficulty,
                "extra_instructions": payload.extra_instructions,
                "theme_query": payload.theme_query,
            },
        },
        "subject_id": payload.subject_id,
        "subject_ids": [payload.subject_id],
        "year_level": payload.year_level,
        "curriculum_codes": payload.curriculum_codes,
        "is_processed": False,
        "processing_failed": False,
        "is_public": False,
        "created_at": now,
        "updated_at": now,
    }

    if payload.subject_component:
        insert_data["subject_component"] = payload.subject_component

    response = supabase_execute(
        db.table("artifacts").insert(insert_data),
        entity="artifact",
    )
    return parse_single_or_404(response, entity="artifact")


# ── Curriculum matching ───────────────────────────────────────


MATCH_SYSTEM_PROMPT = (
    "You are a curriculum matching assistant for Portuguese secondary education.\n"
    "Given a teacher's free-text description and the curriculum tree, "
    "identify the curriculum codes that best match the teacher's intent.\n"
    "Respond ONLY with valid JSON. No explanation, no markdown, no preamble."
)

MATCH_USER_TEMPLATE = """\
The teacher wants to create a quiz about the following topic:
"{query}"

Subject: {subject_name}
Year: {year_level}º ano
{component_line}

Below is the curriculum tree for this subject and year.
Format: [CODE] (level N) Title — keywords

{serialized_tree}

---
Task: Return the curriculum codes that best match the teacher's description.

Rules:
- Return ALL codes that are relevant, not just one.
- Prefer more specific codes (level 2 over level 1, level 1 over level 0).
- If the teacher's description maps to a broad topic, include the parent AND its children.
- Only return codes that exist exactly in the curriculum tree above.

Respond with ONLY this JSON structure:
{{
  "curriculum_codes": ["CODE_1", "CODE_2"]
}}"""


async def match_curriculum(
    db: Client,
    payload: CurriculumMatchIn,
) -> list[dict]:
    """
    Match a teacher's free-text description to curriculum codes.

    Uses a lightweight LLM call (non-streaming) to map the description
    to the most relevant curriculum nodes.
    """
    subject_name = get_subject_name(db, payload.subject_id)
    if not subject_name:
        return []

    tree_nodes = get_curriculum_tree(
        db, payload.subject_id, payload.year_level, payload.subject_component
    )
    if not tree_nodes:
        return []

    has_components = any(n.get("subject_component") for n in tree_nodes)
    serialized = serialize_tree(tree_nodes, include_component=has_components)
    valid_codes = {n["code"] for n in tree_nodes if n.get("code")}

    component_line = (
        f"Component: {payload.subject_component}"
        if payload.subject_component
        else ""
    )

    user_text = MATCH_USER_TEMPLATE.format(
        query=payload.query,
        subject_name=subject_name,
        year_level=payload.year_level,
        component_line=component_line,
        serialized_tree=serialized,
    )

    try:
        result = await chat_completion(
            system_prompt=MATCH_SYSTEM_PROMPT,
            user_prompt=user_text,
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=1024,
        )
    except OpenRouterError:
        logger.exception("Curriculum matching LLM call failed")
        return []

    raw_codes = result.get("curriculum_codes", [])
    if not isinstance(raw_codes, list):
        raw_codes = [raw_codes] if raw_codes else []

    validated_codes = [c for c in raw_codes if c in valid_codes]

    if not validated_codes:
        logger.warning("No valid curriculum codes matched for query: %s", payload.query)
        return []

    # Fetch full node data for validated codes
    response = supabase_execute(
        db.table("curriculum")
        .select("id,code,title,full_path,level")
        .eq("subject_id", payload.subject_id)
        .eq("year_level", payload.year_level)
        .in_("code", validated_codes),
        entity="curriculum",
    )

    return response.data or []


# ── Streaming question generation ─────────────────────────────


GENERATION_SYSTEM_PROMPT = """\
És um professor especialista em educação portuguesa do ensino secundário.
A tua tarefa é criar questões originais de alta qualidade para um quiz, \
baseadas nos conteúdos curriculares fornecidos.

Responde APENAS com JSON válido. Sem explicações, sem markdown, sem preâmbulo.

Regras obrigatórias:
- Cada questão deve ser autoconsistente e compreensível sem contexto externo
- A dificuldade deve ser aplicada de forma consistente em todas as questões
- O campo "solution" deve sempre conter a resposta correta exata
- O campo "criteria" deve descrever a lógica de correção
- Todos os campos "ai_generated_fields" devem listar os campos que geraste (sempre inclui "solution" e "criteria")
- Nunca copies texto diretamente dos conteúdos fornecidos — reformula sempre
- "image_url" é sempre null (não geres imagens)
- "original_grade" é sempre null (só se aplica a questões extraídas de documentos)
- Varia os tipos de questão para manter o quiz interessante
- NUNCA uses os tipos "open_extended" ou "context_group" — este quiz é online e só aceita tipos com correção automática
- "children" é sempre null
- Na PRIMEIRA questão (label "1."), inclui o campo "quiz_name" com um nome curto e descritivo para o quiz (máximo 8 palavras, ex: "Quiz sobre a Revolução Francesa"). Nas restantes questões, omite este campo.\
"""

GENERATION_USER_TEMPLATE = """\
Cria {num_questions} questões de quiz sobre os seguintes conteúdos curriculares.

Disciplina: {subject_name}
Ano: {year_level}º ano
{component_line}
Dificuldade: {difficulty}

--- TEMA INDICADO PELO PROFESSOR ---
{theme_query}

--- CONTEÚDOS CURRICULARES ---
{curriculum_content}

--- INSTRUÇÃO ADICIONAL DO PROFESSOR ---
{extra_instructions}

--- FORMATO DE RESPOSTA ---
Responde com um array JSON. Cada elemento do array é uma questão com esta estrutura:

{{
  "type": "multiple_choice | true_false | fill_blank | matching | short_answer | multiple_response | ordering",
  "label": "1.",
  "quiz_name": "Quiz sobre ...",
  "content": {{
    "question": "Texto da questão em markdown",
    "image_url": null,
    "options": [
      {{"label": "A", "text": "texto da opção", "image_url": null}},
      {{"label": "B", "text": "texto da opção", "image_url": null}}
    ],
    "solution": "Depende do tipo — ver abaixo",
    "criteria": "Critérios de correção",
    "original_grade": null,
    "ai_generated_fields": ["solution", "criteria"]
  }},
  "children": null
}}

Tipos e formatos de solution:
- multiple_choice: label da opção correta (ex: "B"). options obrigatório com 4 opções.
- true_false: true ou false (booleano). options com [{{"label":"V","text":"Verdadeiro"}},{{"label":"F","text":"Falso"}}]
- fill_blank: solution é lista [{{"answer":"resposta","image_url":null}}], uma por lacuna, na ordem. \
No question usa {{{{blank}}}} para cada espaço em branco (NUNCA _____ ou outro marcador). \
options é OBRIGATÓRIO — array de arrays, uma lista interna de opções por lacuna (inclui a resposta correta + distratores). \
Cada lacuna DEVE ter pelo menos 2 opções. NUNCA uses texto livre (sem opções). \
Exemplo: {{"question":"O {{{{blank}}}} é o maior planeta e o {{{{blank}}}} é o mais pequeno.","options":[["Júpiter","Saturno","Marte"],["Mercúrio","Vénus","Terra"]],"solution":[{{"answer":"Júpiter","image_url":null}},{{"answer":"Mercúrio","image_url":null}}]}}
- matching: lista [{{"left":"A","right":"1"}}]. options com label e text para cada par.
- ordering: lista ordenada de labels ["C","A","B"]. options com items a ordenar.
- short_answer: texto da resposta.
- multiple_response: lista de labels corretas ["A","C"]. options obrigatório.

Numera as questões sequencialmente (1., 2., 3., etc.).\
"""


async def generate_questions_stream(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Stream quiz generation via SSE.

    Yields SSE-formatted strings: "data: {...}\\n\\n"
    """
    try:
        # 1. Fetch artifact metadata
        artifact = _get_artifact_for_generation(db, artifact_id, user_id)
        params = artifact.get("content", {}).get("generation_params", {})

        subject_id = artifact["subject_id"]
        year_level = artifact["year_level"]
        subject_component = artifact.get("subject_component")
        curriculum_codes = artifact.get("curriculum_codes") or []
        num_questions = params.get("num_questions", 10)
        difficulty = params.get("difficulty", "Médio")
        extra_instructions = params.get("extra_instructions") or "Nenhuma."
        theme_query = params.get("theme_query") or "Não especificado."
        source_type = params.get("source_type", "dge")
        upload_artifact_id = params.get("upload_artifact_id")

        # 2. Get subject name
        subject_name = get_subject_name(db, subject_id) or "Desconhecida"

        # 3. Get curriculum content for the prompt
        curriculum_content = _build_curriculum_content(
            db,
            subject_id=subject_id,
            year_level=year_level,
            subject_component=subject_component,
            curriculum_codes=curriculum_codes,
            source_type=source_type,
            upload_artifact_id=upload_artifact_id,
        )

        component_line = (
            f"Componente: {subject_component}" if subject_component else ""
        )

        # 4. Build prompt
        user_prompt = GENERATION_USER_TEMPLATE.format(
            num_questions=num_questions,
            subject_name=subject_name,
            year_level=year_level,
            component_line=component_line,
            difficulty=difficulty,
            theme_query=theme_query,
            curriculum_content=curriculum_content,
            extra_instructions=extra_instructions,
        )

        # 5. Yield "started" event
        yield _sse_event({"type": "started", "num_questions": num_questions})

        # 6. Stream questions from LLM
        question_ids: list[str] = []
        label_to_id: dict[str, str] = {}
        order = 0
        quiz_name_emitted = False

        async for generated_q in chat_completion_stream(
            system_prompt=GENERATION_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_model=GeneratedQuestion,
            temperature=0.3,
            max_tokens=32768,
        ):
            try:
                # Extract quiz_name from the first question (if present)
                if not quiz_name_emitted and generated_q.quiz_name:
                    quiz_name = generated_q.quiz_name.strip()
                    if quiz_name:
                        quiz_name_emitted = True
                        supabase_execute(
                            db.table("artifacts")
                            .update({
                                "artifact_name": quiz_name,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            })
                            .eq("id", artifact_id),
                            entity="artifact",
                        )
                        yield _sse_event({"type": "quiz_name", "name": quiz_name})

                order += 1
                q_content = generated_q.content
                q_content = normalize_content(q_content)

                # Ensure ai_generated_fields is set for AI-created questions
                q_content.setdefault("ai_generated_fields", [])
                if "solution" not in q_content["ai_generated_fields"]:
                    if q_content.get("solution") is not None:
                        q_content["ai_generated_fields"].append("solution")
                if "criteria" not in q_content["ai_generated_fields"]:
                    if q_content.get("criteria") is not None:
                        q_content["ai_generated_fields"].append("criteria")

                # Build raw question dict for insert_question_tree
                raw_q = {
                    "type": generated_q.type,
                    "label": generated_q.label,
                    "content": q_content,
                }

                # Add children for context_group
                if generated_q.children:
                    raw_q["children"] = [
                        {
                            "type": child.type,
                            "label": child.label,
                            "content": child.content,
                        }
                        for child in generated_q.children
                    ]

                parent_id, child_ids = insert_question_tree(
                    db,
                    raw_q,
                    org_id=org_id,
                    user_id=user_id,
                    artifact_id=artifact_id,
                    subject_id=subject_id,
                    year_level=year_level,
                    subject_component=subject_component,
                    curriculum_codes=curriculum_codes,
                )

                question_ids.append(parent_id)
                question_ids.extend(child_ids)
                label_to_id[generated_q.label] = parent_id

                # Yield question event
                yield _sse_event({
                    "type": "question",
                    "question": {
                        "id": parent_id,
                        "type": generated_q.type,
                        "label": generated_q.label,
                        "content": q_content,
                        "order": order,
                    },
                })

            except Exception as exc:
                logger.warning(
                    "Failed to process generated question (label=%s): %s",
                    generated_q.label if generated_q else "?",
                    exc,
                )
                continue

        # 7. Finalize artifact
        now = datetime.now(timezone.utc).isoformat()
        supabase_execute(
            db.table("artifacts")
            .update({
                "content": {"question_ids": question_ids},
                "is_processed": True,
                "updated_at": now,
            })
            .eq("id", artifact_id),
            entity="artifact",
        )

        yield _sse_event({
            "type": "done",
            "artifact_id": artifact_id,
            "total_questions": len(
                [qid for qid in question_ids]
            ),
        })

    except Exception as exc:
        logger.exception("Quiz generation failed for artifact %s", artifact_id)

        # Mark artifact as failed
        try:
            supabase_execute(
                db.table("artifacts")
                .update({
                    "processing_failed": True,
                    "processing_error": str(exc)[:500],
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
                .eq("id", artifact_id),
                entity="artifact",
            )
        except Exception:
            logger.exception("Failed to mark artifact %s as failed", artifact_id)

        yield _sse_event({
            "type": "error",
            "message": "Erro ao gerar questões. Tenta novamente.",
        })


# ── Helpers ───────────────────────────────────────────────────


def _get_artifact_for_generation(db: Client, artifact_id: str, user_id: str) -> dict:
    """Fetch artifact and verify ownership."""
    response = supabase_execute(
        db.table("artifacts")
        .select(
            "id,user_id,content,subject_id,year_level,"
            "subject_component,curriculum_codes,"
            "is_processed,processing_failed"
        )
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    artifact = parse_single_or_404(response, entity="artifact")

    if artifact["user_id"] != user_id:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Not authorized for this artifact")

    if artifact.get("is_processed"):
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400, detail="Quiz already generated for this artifact"
        )

    return artifact


def _build_curriculum_content(
    db: Client,
    *,
    subject_id: str,
    year_level: str,
    subject_component: str | None,
    curriculum_codes: list[str],
    source_type: str,
    upload_artifact_id: str | None,
) -> str:
    """
    Build the curriculum/content section for the generation prompt.

    For DGE path: fetches base_content.content_json for each curriculum code.
    For Upload path: fetches markdown_content from the uploaded artifact.
    """
    if source_type == "upload" and upload_artifact_id:
        return _get_upload_content(db, upload_artifact_id)

    # DGE path: fetch base_content for each curriculum code
    parts: list[str] = []

    # First, get the curriculum tree as context
    tree_nodes = get_curriculum_tree(db, subject_id, year_level, subject_component)
    if tree_nodes:
        has_components = any(n.get("subject_component") for n in tree_nodes)
        parts.append("Árvore curricular:")
        parts.append(serialize_tree(tree_nodes, include_component=has_components))
        parts.append("")

    # Then, fetch base_content for each selected code
    if curriculum_codes:
        # Get curriculum IDs for the selected codes
        response = supabase_execute(
            db.table("curriculum")
            .select("id,code,title")
            .eq("subject_id", subject_id)
            .eq("year_level", year_level)
            .in_("code", curriculum_codes),
            entity="curriculum",
        )
        nodes = response.data or []

        for node in nodes:
            curriculum_id = node["id"]
            # Fetch base_content
            bc_response = supabase_execute(
                db.table("base_content")
                .select("content_json")
                .eq("curriculum_id", curriculum_id)
                .limit(1),
                entity="base_content",
            )
            bc_rows = bc_response.data or []
            if bc_rows and bc_rows[0].get("content_json"):
                content_json = bc_rows[0]["content_json"]
                parts.append(f"\n--- {node.get('title', node['code'])} ---")
                # content_json is a TipTap-like JSON structure; extract text
                text = _extract_text_from_content_json(content_json)
                if text:
                    parts.append(text)

    if not parts:
        # Fallback: just use the tree
        parts.append("Sem conteúdo base disponível. Gera as questões com base nos tópicos curriculares indicados.")

    return "\n".join(parts)


def _get_upload_content(db: Client, upload_artifact_id: str) -> str:
    """Fetch markdown_content from an uploaded artifact."""
    response = supabase_execute(
        db.table("artifacts")
        .select("markdown_content")
        .eq("id", upload_artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    if rows and rows[0].get("markdown_content"):
        return rows[0]["markdown_content"]
    return "Conteúdo do ficheiro não disponível."


def _extract_text_from_content_json(content_json: dict | list) -> str:
    """
    Recursively extract plain text from a TipTap/ProseMirror JSON structure.

    Handles nested content arrays and text nodes.
    """
    if isinstance(content_json, str):
        return content_json

    if isinstance(content_json, list):
        return "\n".join(
            _extract_text_from_content_json(item) for item in content_json
        )

    if isinstance(content_json, dict):
        # Text node
        if content_json.get("type") == "text":
            return content_json.get("text", "")

        # Recurse into content array
        children = content_json.get("content", [])
        if isinstance(children, list):
            texts = [_extract_text_from_content_json(c) for c in children]
            return "\n".join(t for t in texts if t)

    return ""


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE event string."""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── Resolve curriculum codes to full nodes ────────────────────


def resolve_curriculum_codes(
    db: Client,
    subject_id: str,
    year_level: str,
    codes: list[str],
) -> list[dict]:
    """
    Resolve a list of curriculum codes into full node objects
    (id, code, title, full_path, level).
    """
    if not codes:
        return []

    response = supabase_execute(
        db.table("curriculum")
        .select("id,code,title,full_path,level")
        .eq("subject_id", subject_id)
        .eq("year_level", year_level)
        .in_("code", codes),
        entity="curriculum",
    )

    return response.data or []

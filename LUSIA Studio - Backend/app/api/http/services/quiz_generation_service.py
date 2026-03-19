"""
Quiz generation service — business logic for the AI quiz creation pipeline.

Handles artifact creation, curriculum matching, and streaming question generation.
Uses the shared generation_context module for content assembly.
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
from app.api.http.services.generation_context import assemble_generation_context
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
    # Inherit tags from upload artifact when not provided by the frontend
    subject_id = payload.subject_id
    year_level = payload.year_level
    subject_component = payload.subject_component
    curriculum_codes = payload.curriculum_codes

    if payload.upload_artifact_id and not curriculum_codes:
        doc_resp = supabase_execute(
            db.table("artifacts")
            .select("subject_id,year_level,subject_component,curriculum_codes")
            .eq("id", payload.upload_artifact_id)
            .limit(1),
            entity="artifact",
        )
        doc_rows = doc_resp.data or []
        if doc_rows:
            doc = doc_rows[0]
            curriculum_codes = doc.get("curriculum_codes") or []
            if not subject_id and doc.get("subject_id"):
                subject_id = doc["subject_id"]
            if not year_level and doc.get("year_level"):
                year_level = doc["year_level"]
            if not subject_component and doc.get("subject_component"):
                subject_component = doc["subject_component"]

    if subject_id:
        subject_name = get_subject_name(db, subject_id) or "Quiz"
        artifact_name = f"Quiz · {subject_name}"
        if year_level:
            artifact_name += f" · {year_level}º ano"
    else:
        artifact_name = "Quiz"

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
        "subject_id": subject_id,
        "subject_ids": [subject_id] if subject_id else [],
        "year_level": year_level,
        "curriculum_codes": curriculum_codes,
        "is_processed": False,
        "processing_failed": False,
        "is_public": False,
        "created_at": now,
        "updated_at": now,
    }

    if subject_component:
        insert_data["subject_component"] = subject_component

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
A tua tarefa é criar questões originais de alta qualidade para um quiz.

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
- Quando usares notação matemática, escreve-a SEMPRE em LaTeX simples e consistente:
  - inline: `$...$`
  - bloco: `$$...$$`
  - usa comandos LaTeX normais como `\\frac`, `\\sqrt`, `\\sin`, `\\cos`, `^`, `_`, `\\circ`
  - NUNCA devolvas HTML, spans, classes CSS, KaTeX renderizado, MathML ou pseudo-marcadores
  - NUNCA escapes os delimitadores de matemática como `\\$...\\$`
  - NUNCA mistures texto matemático solto quando a expressão deve estar dentro de delimitadores LaTeX\
  - escreve funções e símbolos matemáticos sempre no formato LaTeX canónico: `$f(x)=\\tan(x)$`, `$\\cos(x)$`, `$\\frac{\\sqrt{3}}{2}$`, `$[0, 2\\pi[$`
  - se uma expressão matemática completa couber numa única frase, mantém-na toda dentro do MESMO par de delimitadores; não partas uma expressão em vários blocos desnecessariamente
  - se tiveres dúvida entre duas formas, escolhe a mais simples e mais renderizável pelo frontend
  - fallback obrigatório: se não souberes formatar uma expressão complexa com segurança, usa uma versão matemática mais simples mas ainda correta, em vez de inventar sintaxe inválida\
"""

RESPONSE_FORMAT = """\
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
Regra crítica para matemática em fill_blank: NUNCA coloques `{{{{blank}}}}` dentro do interior de uma expressão LaTeX delimitada por `$...$` ou `$$...$$`. \
Se a resposta fizer parte de uma expressão matemática, reescreve a frase para que a lacuna substitua a expressão inteira ou fique fora dos delimitadores. \
Bom exemplo: `\"question\":\"Sabemos que {{{{blank}}}}.\", \"options\":[[\"$\\\\sin^2(60^\\\\circ)+\\\\cos^2(60^\\\\circ)=1$\", \"$\\\\sin(60^\\\\circ)=1$\"]]` \
Mau exemplo: `\"question\":\"Sabemos que $\\\\sin^2(60^\\\\circ)+\\\\cos^2(60^\\\\circ)={{{{blank}}}}$\"` \
Exemplo: {{"question":"O {{{{blank}}}} é o maior planeta e o {{{{blank}}}} é o mais pequeno.","options":[["Júpiter","Saturno","Marte"],["Mercúrio","Vénus","Terra"]],"solution":[{{"answer":"Júpiter","image_url":null}},{{"answer":"Mercúrio","image_url":null}}]}}
- matching: lista [{{"left":"A","right":"1"}}]. options com label e text para cada par.
- ordering: lista ordenada de labels ["C","A","B"]. options com items a ordenar.
- short_answer: texto da resposta.
- multiple_response: lista de labels corretas ["A","C"]. options obrigatório.

Numera as questões sequencialmente (1., 2., 3., etc.).\
"""


def _format_bank_questions_for_quiz(bank_questions: list[dict]) -> str:
    """Format bank questions with full content for style reference, stripping noise fields."""
    NOISE_KEYS = {"original_grade", "ai_generated_fields", "image_url"}

    parts: list[str] = []
    for q in bank_questions:
        q_type = q.get("type", "?")
        exam_year = q.get("exam_year", "?")
        exam_phase = q.get("exam_phase", "?")
        codes = q.get("curriculum_codes") or []

        header = f"type={q_type} exam={exam_year}/{exam_phase}"
        if codes:
            header += f" codes={','.join(codes)}"

        # Send question + options + solution — strip noise
        content = q.get("content", {})
        if isinstance(content, dict):
            content = {k: v for k, v in content.items() if k not in NOISE_KEYS}
            # Also strip image_url from options
            opts = content.get("options")
            if isinstance(opts, list):
                content["options"] = [
                    {ok: ov for ok, ov in opt.items() if ok != "image_url"}
                    if isinstance(opt, dict) else opt
                    for opt in opts
                ]

        content_json = json.dumps(content, ensure_ascii=False, indent=None)
        parts.append(f"[{header}]\n{content_json}")

    return "\n\n".join(parts)


def _build_quiz_user_prompt(
    *,
    num_questions: int,
    context: dict,
    year_level: str | None,
    subject_component: str | None,
    difficulty: str,
    theme_query: str | None,
    extra_instructions: str | None,
) -> str:
    """
    Build the user prompt following the content hierarchy:
      1. User indications (highest priority)
      2. Document content (base material)
      3. Curriculum content + bank questions (supplementary)
    """
    parts: list[str] = []

    parts.append(f"Cria {num_questions} questões de quiz.\n")

    # Subject context (informational)
    if context["subject_name"]:
        parts.append(f"Disciplina: {context['subject_name']}")
    if year_level:
        parts.append(f"Ano: {year_level}º ano")
    if subject_component:
        parts.append(f"Componente: {subject_component}")
    parts.append(f"Dificuldade: {difficulty}")
    parts.append("")

    # ── 1. USER INSTRUCTIONS (highest priority) ──
    parts.append("=== INSTRUÇÕES DO PROFESSOR (PRIORIDADE MÁXIMA) ===")
    parts.append("Segue estas indicações com a máxima prioridade.")
    if theme_query:
        parts.append(f"Tema: {theme_query}")
    if extra_instructions:
        parts.append(f"Instruções adicionais: {extra_instructions}")
    else:
        parts.append("Sem instruções adicionais.")
    parts.append("")

    # ── 2. DOCUMENT CONTENT (base material) ──
    if context["document_content"]:
        parts.append("=== CONTEÚDO DO DOCUMENTO (MATERIAL BASE) ===")
        parts.append(
            "Gera as questões principalmente a partir deste material. "
            "Este é o conteúdo principal para a geração."
        )
        parts.append(context["document_content"])
        parts.append("")

    # ── 3. CURRICULUM + BANK (supplementary context) ──
    has_curriculum = context["curriculum_tree"] or context["base_content_by_code"]
    has_bank = bool(context["bank_questions"])

    if has_curriculum:
        parts.append("=== CONTEÚDOS CURRICULARES (CONTEXTO SUPLEMENTAR) ===")
        parts.append(
            "Usa estes conteúdos como contexto adicional para enriquecer as questões."
        )
        if context["curriculum_tree"]:
            parts.append("Árvore curricular:")
            parts.append(context["curriculum_tree"])
            parts.append("")
        for code, text in context["base_content_by_code"].items():
            parts.append(f"--- {code} ---")
            parts.append(text)
            parts.append("")

    if has_bank:
        bank_sample = context["bank_questions"][:20]
        parts.append("=== QUESTÕES DE EXAME NACIONAL (REFERÊNCIA DE ESTILO) ===")
        parts.append(
            "Usa estas questões APENAS como referência de estilo e qualidade. "
            "NÃO copies nem reutilizes diretamente — inspira-te nelas."
        )
        parts.append(_format_bank_questions_for_quiz(bank_sample))
        parts.append("")

    # Response format (always last)
    parts.append(RESPONSE_FORMAT)

    return "\n".join(parts)


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
        extra_instructions = params.get("extra_instructions")
        theme_query = params.get("theme_query")
        upload_artifact_id = params.get("upload_artifact_id")

        # 2. Assemble context using the shared module
        context = assemble_generation_context(
            db,
            subject_id=subject_id,
            year_level=year_level,
            subject_component=subject_component,
            curriculum_codes=curriculum_codes,
            upload_artifact_id=upload_artifact_id,
        )

        # 3. Build prompt with proper hierarchy
        user_prompt = _build_quiz_user_prompt(
            num_questions=num_questions,
            context=context,
            year_level=year_level,
            subject_component=subject_component,
            difficulty=difficulty,
            theme_query=theme_query,
            extra_instructions=extra_instructions,
        )

        # 4. Yield "started" event
        yield _sse_event({"type": "started", "num_questions": num_questions})

        # 5. Stream questions from LLM
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

                # Add children for context_group (shouldn't happen for quiz but defensive)
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

        # 6. Finalize artifact
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
            "total_questions": len(question_ids),
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

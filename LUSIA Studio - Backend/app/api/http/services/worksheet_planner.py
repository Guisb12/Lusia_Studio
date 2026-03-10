"""
Worksheet planner — generates the initial blueprint from assembled context.

Uses a non-streaming JSON call to the planner model. The planner receives the
full context (curriculum, base_content, bank questions, teacher documents) plus
the teacher's prompt, and returns a structured blueprint of question blocks.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections.abc import AsyncGenerator

from supabase import Client

from app.api.http.schemas.worksheet_generation import Blueprint, BlueprintBlock
from app.api.http.services.generation_context import assemble_generation_context
from app.api.http.services.worksheet_generation_service import (
    get_worksheet_artifact,
    update_worksheet_content,
)
from app.api.http.services.worksheet_templates import (
    get_template,
    template_to_blueprint_skeleton,
)
from app.pipeline.clients.openrouter import OpenRouterError, chat_completion, chat_completion_stream

logger = logging.getLogger(__name__)


# ── Planner system prompt ────────────────────────────────────


PLANNER_SYSTEM_PROMPT = """\
És um assistente de planeamento de fichas de exercícios para o ensino secundário português.

Recebes um TEMPLATE (esqueleto) com grupos e slots pré-definidos. \
A tua tarefa é PREENCHER cada slot com códigos curriculares, objetivos e fonte (banco ou IA).

Responde APENAS com JSON válido. Sem explicações, sem markdown, sem preâmbulo.

--- REGRAS ---

1. NÃO alteres o número de slots, tipos de questão, nem a estrutura de grupos do template. \
O template define a estrutura — tu preenches o conteúdo.

2. ATRIBUIÇÃO POR GRUPO: distribui os códigos curriculares ao nível do grupo primeiro. \
Cada grupo deve cobrir 1-2 áreas temáticas coerentes. \
Depois, dentro de cada grupo, atribui códigos específicos a cada slot.

3. Cada bloco tem um `source`:
   - "bank": seleciona uma questão existente do banco de questões fornecido. \
Indica o `question_id` da questão selecionada.
   - "ai_generated": será gerada por IA na fase de resolução. \
Opcionalmente indica `reference_question_ids` — IDs de questões do banco para usar como exemplos \
de estilo e profundidade na geração.

4. Prefere questões do banco (source="bank") quando existir uma questão adequada \
do tipo correto para o slot. Usa "ai_generated" para preencher lacunas.

5. O `goal` de cada bloco deve ser descritivo: "Testar compreensão das reações de fotossíntese", \
não "Questão sobre fotossíntese".

6. Respeita a dificuldade indicada no template para cada slot. \
Se a dificuldade do slot é "mixed", usa o nível global indicado pelo professor.

7. Os `reference_question_ids` só devem ser usados em blocos `ai_generated`, \
e devem ser IDs de questões do banco fornecido que servem como bons exemplos \
do tipo e estilo pretendido.

8. Para context_group: os `children` já vêm definidos no template. \
Preenche cada filho com o mesmo curriculum_code do pai (ou sub-códigos relacionados). \
O `goal` do context_group deve ser um título descritivo do grupo, ex: "Leitura e Interpretação de Texto" ou "Geometria e Medida". \
Usa o `group_label` existente (ex: "Grupo I") como prefixo — o `goal` fica "Grupo I — Leitura e Interpretação".

9. Mantém os `id` dos blocos do template. Não geres novos IDs.

--- FORMATO DE RESPOSTA ---

{{
  "blocks": [
    {{
      "id": "id-do-template",
      "order": 1,
      "source": "bank",
      "question_id": "uuid-da-questao",
      "curriculum_code": "CODIGO",
      "curriculum_path": "Caminho > Completo > Do > Nó",
      "type": "multiple_choice",
      "goal": "Descrição do objetivo desta questão",
      "difficulty": "Fácil",
      "group_label": "Grupo I",
      "reference_question_ids": [],
      "children": null
    }}
  ]
}}\
"""


# ── Streaming system prompt (array output for instructor create_iterable) ────

PLANNER_STREAM_SYSTEM_PROMPT = """\
És um assistente de planeamento de fichas de exercícios para o ensino secundário português.

Recebes um TEMPLATE (esqueleto) com grupos e slots pré-definidos. \
A tua tarefa é PREENCHER cada slot com códigos curriculares, objetivos e fonte (banco ou IA).

Responde APENAS com um JSON array válido. Sem wrapper de objeto, sem chave "blocks", sem markdown, sem preâmbulo.
A resposta começa com `[` e termina com `]`.

--- REGRAS ---

1. NÃO alteres o número de slots, tipos de questão, nem a estrutura de grupos do template. \
O template define a estrutura — tu preenches o conteúdo.

2. ATRIBUIÇÃO POR GRUPO: distribui os códigos curriculares ao nível do grupo primeiro. \
Cada grupo deve cobrir 1-2 áreas temáticas coerentes. \
Depois, dentro de cada grupo, atribui códigos específicos a cada slot.

3. Cada bloco tem um `source`:
   - "bank": seleciona uma questão existente do banco de questões fornecido. \
Indica o `question_id` da questão selecionada.
   - "ai_generated": será gerada por IA na fase de resolução. \
Opcionalmente indica `reference_question_ids` — IDs de questões do banco para usar como exemplos \
de estilo e profundidade na geração.

4. Prefere questões do banco (source="bank") quando existir uma questão adequada \
do tipo correto para o slot. Usa "ai_generated" para preencher lacunas.

5. O `goal` de cada bloco deve ser descritivo: "Testar compreensão das reações de fotossíntese", \
não "Questão sobre fotossíntese".

6. Respeita a dificuldade indicada no template para cada slot. \
Se a dificuldade do slot é "mixed", usa o nível global indicado pelo professor.

7. Os `reference_question_ids` só devem ser usados em blocos `ai_generated`, \
e devem ser IDs de questões do banco fornecido que servem como bons exemplos \
do tipo e estilo pretendido.

8. Para context_group: os `children` já vêm definidos no template. \
Preenche cada filho com o mesmo curriculum_code do pai (ou sub-códigos relacionados). \
O `goal` do context_group deve ser um título descritivo do grupo, ex: "Leitura e Interpretação de Texto" ou "Geometria e Medida". \
Usa o `group_label` existente (ex: "Grupo I") como prefixo — o `goal` fica "Grupo I — Leitura e Interpretação".

9. Mantém os `id` dos blocos do template. Não geres novos IDs.

--- FORMATO DE RESPOSTA ---

[
  {{
    "id": "id-do-template",
    "order": 1,
    "source": "bank",
    "question_id": "uuid-da-questao",
    "curriculum_code": "CODIGO",
    "curriculum_path": "Caminho > Completo > Do > Nó",
    "type": "multiple_choice",
    "goal": "Descrição do objetivo desta questão",
    "difficulty": "Fácil",
    "group_label": "Grupo I",
    "reference_question_ids": [],
    "children": null
  }}
]\
"""


def _build_planner_user_prompt(
    *,
    context: dict,
    year_level: str | None,
    subject_component: str | None,
    difficulty: str,
    prompt: str,
    template_skeleton_json: str,
    bank_questions_section: str,
    base_content_section: str,
) -> str:
    """
    Build the planner user prompt following the content hierarchy:
      1. Template skeleton (structure to fill)
      2. User indications (highest priority for content)
      3. Document content (base material)
      4. Curriculum content + bank questions (supplementary)
    """
    parts: list[str] = []

    parts.append("Preenche o blueprint da ficha de exercícios usando o template fornecido.\n")

    # Subject context (informational)
    if context["subject_name"]:
        parts.append(f"Disciplina: {context['subject_name']}")
    if year_level:
        parts.append(f"Ano: {year_level}º ano")
    if subject_component:
        parts.append(f"Componente: {subject_component}")
    parts.append(f"Dificuldade global: {difficulty}")
    parts.append("")

    # ── 0. TEMPLATE SKELETON (structure) ──
    parts.append("=== TEMPLATE (ESQUELETO A PREENCHER) ===")
    parts.append(
        "Este é o esqueleto da ficha. Mantém os IDs, tipos e estrutura de grupos. "
        "Preenche curriculum_code, goal e source em cada slot."
    )
    parts.append(template_skeleton_json)
    parts.append("")

    # ── 1. TEACHER INSTRUCTIONS (highest priority for content) ──
    parts.append("=== INSTRUÇÕES DO PROFESSOR (PRIORIDADE MÁXIMA) ===")
    parts.append("Segue estas indicações com a máxima prioridade ao atribuir temas e objetivos.")
    parts.append(prompt)
    parts.append("")

    # ── 2. DOCUMENT CONTENT (base material) ──
    if context["document_content"]:
        parts.append("=== CONTEÚDO DO DOCUMENTO (MATERIAL BASE) ===")
        parts.append(
            "Usa este material como base principal para planear as questões. "
            "O conteúdo do documento tem prioridade sobre os conteúdos curriculares."
        )
        parts.append(context["document_content"])
        parts.append("")

    # ── 3. CURRICULUM + BANK (supplementary context) ──
    has_curriculum = context["curriculum_tree"] or context["base_content_by_code"]
    has_bank = bool(context["bank_questions"])

    if has_curriculum:
        parts.append("=== CONTEÚDOS CURRICULARES (CONTEXTO SUPLEMENTAR) ===")
        parts.append(
            "Usa estes conteúdos como contexto adicional para enriquecer o plano."
        )
        if context["curriculum_tree"]:
            parts.append("Árvore curricular:")
            parts.append(context["curriculum_tree"])
            parts.append("")
        if context["base_content_by_code"]:
            parts.append(base_content_section)
            parts.append("")

    if has_bank:
        parts.append("=== BANCO DE QUESTÕES DISPONÍVEIS ===")
        parts.append(
            "Usa estas questões quando são adequadas ao objetivo. "
            "Para as restantes, planeia questões ai_generated."
        )
        parts.append(bank_questions_section)
        parts.append("")

    parts.append("---\nPreenche o blueprint JSON agora.")

    return "\n".join(parts)


# ── Public API ───────────────────────────────────────────────


async def generate_initial_blueprint(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
) -> Blueprint:
    """
    Generate the initial worksheet blueprint from assembled context.

    Fetches the artifact's generation params, assembles context, calls the
    planner LLM, validates the output, and persists it to the artifact.
    """
    artifact = get_worksheet_artifact(db, artifact_id, user_id)
    content = artifact.get("content", {})
    params = content.get("generation_params", {})

    subject_id = artifact["subject_id"]
    year_level = artifact["year_level"]
    subject_component = artifact.get("subject_component")
    curriculum_codes = artifact.get("curriculum_codes") or []

    # Assemble context
    year_range = params.get("year_range")
    context = assemble_generation_context(
        db,
        subject_id=subject_id,
        year_level=year_level,
        subject_component=subject_component,
        curriculum_codes=curriculum_codes,
        upload_artifact_id=params.get("upload_artifact_id"),
        year_range=year_range,
    )

    # Load template and expand to skeleton
    template_id = params.get("template_id", "practice")
    template = get_template(template_id)
    skeleton = template_to_blueprint_skeleton(template)
    skeleton_json = json.dumps(skeleton, ensure_ascii=False, indent=2)

    # Build prompt with hierarchy
    user_prompt = _build_planner_user_prompt(
        context=context,
        year_level=year_level,
        subject_component=subject_component,
        difficulty=params.get("difficulty", "Médio"),
        prompt=params.get("prompt", ""),
        template_skeleton_json=skeleton_json,
        bank_questions_section=_format_bank_questions(context["bank_questions"]),
        base_content_section=_format_base_content(context["base_content_by_code"]),
    )

    # Call planner LLM
    try:
        result = await chat_completion(
            system_prompt=PLANNER_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=16384,
        )
    except OpenRouterError:
        logger.exception("Planner LLM call failed for artifact %s", artifact_id)
        raise

    # Parse and validate
    blueprint = _parse_blueprint(result)

    # Persist to artifact
    content["blueprint"] = blueprint.model_dump()
    content["phase"] = "blueprint_review"
    content["assembled_context_summary"] = {
        "subject_name": context["subject_name"],
        "subject_status": context["subject_status"],
        "has_national_exam": context["has_national_exam"],
        "bank_question_count": len(context["bank_questions"]),
        "document_attached": context.get("document_content") is not None,
        "curriculum_code_count": len(curriculum_codes),
    }
    update_worksheet_content(db, artifact_id, content)

    return blueprint


# ── Streaming API ────────────────────────────────────────────


async def stream_initial_blueprint(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Stream blueprint blocks as SSE-formatted strings.

    If the blueprint was already generated (phase=blueprint_review), replays
    existing blocks immediately. Otherwise assembles context, calls the planner
    via instructor's create_iterable, and emits each block as it completes.
    """
    try:
        artifact = get_worksheet_artifact(db, artifact_id, user_id)
        content = artifact.get("content", {})

        # Already generated — replay existing blocks immediately
        if content.get("phase") == "blueprint_review":
            existing_bp = Blueprint(**(content.get("blueprint", {}) or {}))
            for block in existing_bp.blocks:
                if block.type == "context_group" and block.children:
                    parent_dict = block.model_dump()
                    parent_dict["children"] = []
                    yield f"data: {json.dumps({'type': 'block', 'block': parent_dict})}\n\n"
                    for child in block.children:
                        yield f"data: {json.dumps({'type': 'child_block', 'parent_id': block.id, 'block': child.model_dump()})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'block', 'block': block.model_dump()})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return

        params = content.get("generation_params", {})
        subject_id = artifact["subject_id"]
        year_level = artifact["year_level"]
        subject_component = artifact.get("subject_component")
        curriculum_codes = artifact.get("curriculum_codes") or []

        # Assemble context (same as non-streaming planner)
        year_range = params.get("year_range")
        context = assemble_generation_context(
            db,
            subject_id=subject_id,
            year_level=year_level,
            subject_component=subject_component,
            curriculum_codes=curriculum_codes,
            upload_artifact_id=params.get("upload_artifact_id"),
            year_range=year_range,
        )

        # Load template and expand to skeleton
        template_id = params.get("template_id", "practice")
        template = get_template(template_id)
        skeleton = template_to_blueprint_skeleton(template)
        skeleton_json = json.dumps(skeleton, ensure_ascii=False, indent=2)

        user_prompt = _build_planner_user_prompt(
            context=context,
            year_level=year_level,
            subject_component=subject_component,
            difficulty=params.get("difficulty", "Médio"),
            prompt=params.get("prompt", ""),
            template_skeleton_json=skeleton_json,
            bank_questions_section=_format_bank_questions(context["bank_questions"]),
            base_content_section=_format_base_content(context["base_content_by_code"]),
        )

        # Stream blocks via instructor create_iterable
        blocks: list[BlueprintBlock] = []
        async for block in chat_completion_stream(
            system_prompt=PLANNER_STREAM_SYSTEM_PROMPT,
            user_prompt=user_prompt,
            response_model=BlueprintBlock,
            temperature=0.3,
            max_tokens=16384,
        ):
            blocks.append(block)

            # For context_groups: emit parent (no children) first, then
            # stagger each child as a separate SSE event so the frontend
            # can render questions appearing one by one.
            if block.type == "context_group" and block.children:
                parent_dict = block.model_dump()
                parent_dict["children"] = []
                yield f"data: {json.dumps({'type': 'block', 'block': parent_dict})}\n\n"
                for child in block.children:
                    await asyncio.sleep(0.15)
                    yield f"data: {json.dumps({'type': 'child_block', 'parent_id': block.id, 'block': child.model_dump()})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'block', 'block': block.model_dump()})}\n\n"

        # Persist the complete blueprint
        blueprint = Blueprint(blocks=blocks, version=1)
        content["blueprint"] = blueprint.model_dump()
        content["phase"] = "blueprint_review"
        content["assembled_context_summary"] = {
            "subject_name": context["subject_name"],
            "subject_status": context["subject_status"],
            "has_national_exam": context["has_national_exam"],
            "bank_question_count": len(context["bank_questions"]),
            "document_attached": context.get("document_content") is not None,
            "curriculum_code_count": len(curriculum_codes),
        }
        update_worksheet_content(db, artifact_id, content)
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception:
        logger.exception("Blueprint streaming failed for artifact %s", artifact_id)
        yield f"data: {json.dumps({'type': 'error', 'message': 'Falha ao gerar o plano. Tenta novamente.'})}\n\n"


# ── Helpers ──────────────────────────────────────────────────


def _format_base_content(base_content_by_code: dict[str, str]) -> str:
    if not base_content_by_code:
        return "Sem conteúdo base disponível."

    parts = []
    for code, text in base_content_by_code.items():
        parts.append(f"[{code}]\n{text}")
    return "\n\n".join(parts)


def _format_bank_questions(bank_questions: list[dict]) -> str:
    if not bank_questions:
        return "Sem questões no banco para os códigos curriculares selecionados."

    parts = []
    for q in bank_questions:
        q_id = q.get("id", "?")
        q_type = q.get("type", "?")
        exam_year = q.get("exam_year")
        exam_phase = q.get("exam_phase", "")
        codes = q.get("curriculum_codes") or []
        content = q.get("content", {})

        header = f"[{q_id}] type={q_type}"
        if exam_year:
            header += f" exam={exam_year} {exam_phase}"
        if codes:
            header += f" codes={','.join(codes)}"

        content_json = json.dumps(content, ensure_ascii=False, indent=None)
        parts.append(f"{header}\n{content_json}")

    return "\n\n".join(parts)


def _parse_blueprint(raw: dict) -> Blueprint:
    """Parse and validate the planner's raw JSON output into a Blueprint."""
    raw_blocks = raw.get("blocks", [])
    if not isinstance(raw_blocks, list):
        raw_blocks = []

    blocks: list[BlueprintBlock] = []

    for i, raw_block in enumerate(raw_blocks):
        block = _parse_block(raw_block, order_fallback=i + 1)
        if block:
            blocks.append(block)

    return Blueprint(blocks=blocks, version=1)


def _parse_block(raw: dict, order_fallback: int) -> BlueprintBlock | None:
    """Parse a single block from the planner output."""
    try:
        block_id = raw.get("id") or str(uuid.uuid4())
        source = raw.get("source", "ai_generated")
        if source not in ("bank", "ai_generated"):
            source = "ai_generated"

        question_id = raw.get("question_id") if source == "bank" else None
        curriculum_code = raw.get("curriculum_code", "")

        q_type = raw.get("type", "short_answer")
        goal = raw.get("goal", "")

        reference_ids = raw.get("reference_question_ids") or []
        if not isinstance(reference_ids, list):
            reference_ids = []

        # Parse children for context_group
        children = None
        raw_children = raw.get("children")
        if q_type == "context_group" and isinstance(raw_children, list):
            children = []
            for j, raw_child in enumerate(raw_children):
                child = _parse_block(raw_child, order_fallback=j + 1)
                if child:
                    children.append(child)

        return BlueprintBlock(
            id=block_id,
            order=raw.get("order", order_fallback),
            source=source,
            question_id=question_id,
            curriculum_code=curriculum_code,
            curriculum_path=raw.get("curriculum_path"),
            type=q_type,
            goal=goal,
            difficulty=raw.get("difficulty"),
            group_label=raw.get("group_label"),
            reference_question_ids=reference_ids,
            comments=[],
            children=children,
        )

    except Exception:
        logger.warning("Failed to parse blueprint block: %s", raw, exc_info=True)
        return None

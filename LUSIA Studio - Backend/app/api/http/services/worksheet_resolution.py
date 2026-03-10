"""
Worksheet resolution — resolves a confirmed blueprint into full questions.

Bank blocks are fetched from the DB. AI-generated blocks are grouped by L1
curriculum ancestor and generated in parallel, with results interleaved
into a single SSE stream.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import defaultdict
from collections.abc import AsyncGenerator
from datetime import datetime, timezone

from supabase import Client

from app.api.http.schemas.worksheet_generation import (
    Blueprint,
    BlueprintBlock,
    GeneratedQuestion,
)
from app.api.http.services.generation_context import assemble_generation_context
from app.api.http.services.worksheet_generation_service import (
    get_worksheet_artifact,
    mark_worksheet_failed,
    update_worksheet_content,
)
from app.pipeline.clients.openrouter import OpenRouterError, chat_completion_stream
from app.pipeline.steps.extract_questions import (
    insert_question_tree,
    normalize_content,
    validate_type,
)
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)


# ── Question type specs (included dynamically per call) ──────


QUESTION_TYPE_SPECS = {
    "multiple_choice": """\
multiple_choice — Escolha múltipla (1 opção correta):
- content.question: enunciado em markdown (português)
- content.image_url: null
- content.options: array de 4 opções, cada uma:
  {{"label": "A", "text": "texto da opção", "image_url": null}}
  Labels: A/B/C/D. Texto claro e distinto entre opções.
- content.solution: string — label da opção correta (ex: "B")
- content.criteria: critérios de correção (ex: "A resposta correta é a opção (B).")
- Se apenas 2 opções existem, é STILL multiple_choice, NÃO true_false.
- Se 5+ opções, incluir todas.""",

    "true_false": """\
true_false — Verdadeiro/Falso (RARO — só quando explicitamente V/F):
- content.question: afirmação em markdown
- content.image_url: null
- content.options: [{{"label":"V","text":"Verdadeiro","image_url":null}},{{"label":"F","text":"Falso","image_url":null}}]
- content.solution: booleano (true ou false), NUNCA a string "Verdadeiro"/"Falso"
- content.criteria: critérios de correção
- APENAS usar quando a pergunta pede explicitamente classificação V/F.
- Questões Sim/Não ou Correto/Incorreto → multiple_choice.""",

    "fill_blank": """\
fill_blank — Preenchimento de lacunas:
- content.question: texto com {{blank}} para cada lacuna (substituir ___, [ ], etc.)
- content.image_url: null
- content.options: array de arrays — uma inner array por lacuna com opções (resposta correta + distratores).
  Se sem opções fornecidas → [] (array vazio = lacunas de texto livre).
  Cada inner array contém strings simples: ["opção1", "opção2", "opção3"]
- content.solution: array de objetos, um por lacuna, na ordem:
  [{{"answer": "resposta correta", "image_url": null}}, ...]
- content.criteria: critérios de correção (ex: "Nível 2 — quatro opções corretas: 12 pontos.")
- A ordem das lacunas em solution e options DEVE corresponder esquerda→direita, cima→baixo no texto.""",

    "matching": """\
matching — Associação (ligar itens):
- content.question: instrução de associação em markdown
- content.image_url: null
- content.left: array de itens do lado esquerdo (Coluna I):
  [{{"label": "a", "text": "descrição", "image_url": null}}, ...]
- content.right: array de itens do lado direito (Coluna II):
  [{{"label": "1", "text": "designação", "image_url": null}}, ...]
  O array right pode ter MAIS itens que left (distratores).
- content.solution: array de pares [left_label, right_label]:
  [["a", "2"], ["b", "3"], ["c", "1"]]
- content.criteria: critérios de correção
- NOTA: NÃO usa campo "options" — usa "left" e "right".""",

    "short_answer": """\
short_answer — Resposta curta (1-3 frases):
- content.question: pergunta em markdown
- content.image_url: null
- content.options: [] (vazio)
- content.solution: string — texto da resposta
- content.criteria: critérios de correção
- Usar para: definições breves, identificações, cálculos simples.
- "Resposta restrita" nos critérios → short_answer.""",

    "multiple_response": """\
multiple_response — Múltiplas respostas corretas:
- content.question: pergunta em markdown
  Palavras-chave: "seleciona todas", "identifique as três afirmações corretas", "indica quais"
- content.image_url: null
- content.options: array de 4+ opções:
  [{{"label": "I", "text": "afirmação", "image_url": null}}, ...]
  Labels podem ser I/II/III/IV/V (romanos) ou A/B/C/D/E.
- content.solution: SEMPRE array de labels corretas: ["II", "IV", "V"]
  Mesmo com apenas 1 correta, DEVE ser array: ["A"]
- content.criteria: critérios de correção""",

    "ordering": """\
ordering — Ordenação de itens:
- content.question: instrução de ordenação em markdown
  Padrões: "Ordene as expressões...", "Ordena as etapas..."
- content.image_url: null
- content.items: array de itens na ordem BARALHADA (como apresentados):
  [{{"label": "A", "text": "item", "image_url": null}}, ...]
- content.solution: array de labels na ordem CORRETA: ["C", "B", "A", "E", "D"]
- content.criteria: critérios de correção
- NOTA: NÃO usa campo "options" — usa "items".""",

    "open_extended": """\
open_extended — Resposta aberta / desenvolvimento:
- content.question: pergunta aberta em markdown
  Padrões: "Apresente todos os cálculos", "Na sua resposta, desenvolva...", "Explica..."
- content.image_url: null
- content.options: [] (vazio)
- content.solution: resposta modelo completa (texto)
- content.criteria: critérios de correção DETALHADOS:
  - Decompor pontuação por tópico/passo: "Referir X: 2 pontos. Explicar Y: 3 pontos."
  - Se aplicável, incluir tabela de Níveis (Nível 5→1 com descritores)
  - Se há processos alternativos (1.º Processo, 2.º Processo) → incluir TODOS
- "Resposta aberta" / "Resposta extensa" nos critérios → open_extended.""",

    "context_group": """\
context_group — Grupo contextual (NÃO é uma questão):
- content.question: contexto/enunciado partilhado (texto introdutório, cenário, dados)
- content.image_url: null
- content.solution: SEMPRE null
- content.criteria: SEMPRE null
- content.original_grade: SEMPRE null
- content.ai_generated_fields: SEMPRE []
- children: array de questões-filhas, cada uma com a sua estrutura COMPLETA
  (type, label, content com question/options/solution/criteria/ai_generated_fields)
- O contexto em "question" deve ser suficiente para todas as questões-filhas.""",
}


# ── Resolution system prompt ─────────────────────────────────


RESOLUTION_SYSTEM_PROMPT = """\
És um professor especialista em educação portuguesa do ensino secundário.
A tua tarefa é gerar questões completas para uma ficha de exercícios, \
baseadas nos conteúdos curriculares e no plano (blueprint) fornecido.

Responde APENAS com JSON válido — um array de questões. Sem explicações, sem markdown, sem preâmbulo.

═══════════════════════════════════════════════════════════════
CAMPOS UNIVERSAIS (todos os tipos)
═══════════════════════════════════════════════════════════════

Cada questão tem estes campos dentro de "content":
{{
  "question": "texto da questão em Português",
  "image_url": null,
  "solution": "...",
  "criteria": "...",
  "original_grade": null,
  "ai_generated_fields": ["solution", "criteria"]
}}

Regras:
- "question" — texto da questão. Sempre em Português.
- "image_url" — SEMPRE null (não geres imagens).
- "solution" — resposta correta. Formato varia por tipo. SEMPRE presente exceto context_group (null).
- "criteria" — lógica de correção. SEMPRE presente exceto context_group (null).
- "original_grade" — SEMPRE null.
- "ai_generated_fields" — SEMPRE ["solution", "criteria"] para questões geradas.
  Para context_group → SEMPRE [].

═══════════════════════════════════════════════════════════════
FORMATO DAS OPÇÕES
═══════════════════════════════════════════════════════════════

Todos os arrays de opções/items (options, left, right, items) usam:
{{"label": "A", "text": "texto da opção", "image_url": null}}

- "label" — sempre presente. Usado em referências da solução.
- "text" — texto da opção.
- "image_url" — sempre null na geração.

═══════════════════════════════════════════════════════════════
ESPECIFICAÇÕES POR TIPO
═══════════════════════════════════════════════════════════════

{type_specs}

═══════════════════════════════════════════════════════════════
REGRAS GERAIS DE GERAÇÃO
═══════════════════════════════════════════════════════════════

- Cada questão deve ser autoconsistente e compreensível sem contexto externo
- Mantém o block_id de cada bloco na resposta para mapeamento
- Para context_group: o "label" deve ser o nome do grupo (ex: "Grupo I", "Grupo II"). \
Usa o group_label do blueprint como label da questão.
- Todo o texto DEVE ser em Português Europeu
- Para fórmulas matemáticas, usa LaTeX: $...$ (inline) ou $$...$$ (display)
- Assegura JSON válido: escapa aspas, trata backslashes de LaTeX

═══════════════════════════════════════════════════════════════
FORMATO DE RESPOSTA
═══════════════════════════════════════════════════════════════

Array JSON de questões. Cada elemento:
{{
  "block_id": "uuid-do-bloco",
  "type": "...",
  "label": "1.",
  "order_in_parent": null,
  "content": {{
    "question": "...",
    "image_url": null,
    "solution": "...",
    "criteria": "...",
    "original_grade": null,
    "ai_generated_fields": ["solution", "criteria"]
  }},
  "children": null
}}\
"""


RESOLUTION_USER_TEMPLATE = """\
Gera as seguintes questões para a ficha de exercícios.

Disciplina: {subject_name}
Ano: {year_level}º ano
Dificuldade: {difficulty}

--- CONTEÚDOS BASE ---
{base_content}

--- DOCUMENTO DO PROFESSOR ---
{document_content}

--- QUESTÕES DE REFERÊNCIA ---
{reference_questions}

--- BLOCOS A GERAR ---
{blocks_json}

Gera APENAS as questões listadas acima, respeitando o tipo e objetivo de cada bloco.\
"""


# ── Public API ───────────────────────────────────────────────


async def resolve_worksheet_stream(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """
    Stream worksheet resolution via SSE.

    Resolves bank blocks immediately, then generates AI blocks in parallel
    grouped by L1 curriculum ancestor. Interleaves results from parallel
    streams into a single SSE output.
    """
    try:
        artifact = get_worksheet_artifact(db, artifact_id, user_id)
        content = artifact.get("content", {})
        params = content.get("generation_params", {})
        raw_blueprint = content.get("blueprint", {})

        if not raw_blueprint:
            yield _sse("error", message="Nenhum blueprint encontrado.")
            return

        blueprint = Blueprint(**raw_blueprint)

        # Update phase
        content["phase"] = "resolving"
        update_worksheet_content(db, artifact_id, content)

        subject_id = artifact["subject_id"]
        year_level = artifact["year_level"]
        subject_component = artifact.get("subject_component")
        curriculum_codes = artifact.get("curriculum_codes") or []

        # Assemble context for generation
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

        # Separate bank vs AI blocks
        bank_blocks = [b for b in blueprint.blocks if b.source == "bank"]
        ai_blocks = [b for b in blueprint.blocks if b.source == "ai_generated"]

        # Total = all nodes that will become questionBlock entries in the editor
        total = _count_total_nodes(blueprint.blocks)
        yield _sse("started", total_blocks=total)

        # Track resolved questions for final assembly
        resolved: list[dict] = []

        # 1. Resolve bank blocks
        for block in bank_blocks:
            if not block.question_id:
                yield _sse("block_warning", block_id=block.id, message="Sem question_id.")
                continue

            resp = supabase_execute(
                db.table("questions")
                .select("id,type,label,content")
                .eq("id", block.question_id)
                .limit(1),
                entity="question",
            )

            if not resp.data:
                yield _sse(
                    "block_warning",
                    block_id=block.id,
                    message=f"Questão {block.question_id} já não existe.",
                )
                continue

            q = resp.data[0]
            resolved.append({
                "block_id": block.id,
                "question_id": q["id"],
                "source": "bank",
                "order": block.order,
                "type": q["type"],
            })

            yield _sse(
                "bank_resolved",
                block_id=block.id,
                question_id=q["id"],
                question_type=q["type"],
                order=block.order,
                question_content=q.get("content"),
            )

        # 2. Group AI blocks by context_group (if any), else by L1 ancestor
        gen_groups = _group_ai_blocks(ai_blocks)

        if gen_groups:
            # Create a queue for interleaved results
            result_queue: asyncio.Queue = asyncio.Queue()

            async def generate_group(group_key: str, blocks: list[BlueprintBlock]):
                try:
                    async for block_id, question_data in _generate_ai_group(
                        db=db,
                        group_key=group_key,
                        blocks=blocks,
                        context=context,
                        params=params,
                        org_id=org_id,
                        user_id=user_id,
                        artifact_id=artifact_id,
                        subject_id=subject_id,
                        year_level=year_level,
                        subject_component=subject_component,
                        curriculum_codes=curriculum_codes,
                    ):
                        await result_queue.put(("question", block_id, question_data))
                except Exception as exc:
                    logger.error("Group %s failed: %s", group_key, exc, exc_info=True)
                    for block in blocks:
                        await result_queue.put(("error", block.id, str(exc)))

            # Fire all groups in parallel
            tasks = [
                asyncio.create_task(generate_group(group_key, blocks))
                for group_key, blocks in gen_groups.items()
            ]

            # Also create a sentinel task to signal completion
            async def wait_all():
                await asyncio.gather(*tasks, return_exceptions=True)
                await result_queue.put(("done", None, None))

            asyncio.create_task(wait_all())

            # Consume results from the queue
            while True:
                event_type, block_id, data = await result_queue.get()

                if event_type == "done":
                    break
                elif event_type == "question":
                    resolved.append(data)
                    evt_kwargs = {
                        "block_id": data["block_id"],
                        "question_id": data["question_id"],
                        "question_type": data["type"],
                        "label": data.get("label", ""),
                        "order": data["order"],
                        "question_content": data.get("content"),
                    }
                    if data.get("parent_question_id"):
                        evt_kwargs["parent_question_id"] = data["parent_question_id"]
                    yield _sse("question", **evt_kwargs)
                elif event_type == "error":
                    yield _sse(
                        "block_error",
                        block_id=block_id,
                        message=data,
                    )

        # 3. Assemble worksheet (parents before their children, then by order)
        resolved.sort(key=lambda r: (
            r["order"],
            0 if not r.get("parent_question_id") else 1,
        ))
        _assemble_worksheet(db, artifact_id, resolved, blueprint)

        yield _sse("done", artifact_id=artifact_id, total_questions=len(resolved))

    except Exception as exc:
        logger.exception("Worksheet resolution failed for artifact %s", artifact_id)
        mark_worksheet_failed(db, artifact_id, str(exc))
        yield _sse("error", message="Erro ao resolver a ficha. Tenta novamente.")


# ── L1 grouping ──────────────────────────────────────────────


def _get_l1_ancestor(code: str) -> str:
    """
    Extract the L1 ancestor from a curriculum code.

    Codes follow the pattern: SUBJECT_YEAR_COMPONENT_L0_L1_L2_L3
    The L1 ancestor includes everything up to L1: SUBJECT_YEAR_COMPONENT_L0_L1

    Uses underscore segments. If the code has fewer than 5 segments,
    returns the code itself.
    """
    parts = code.split("_")
    if len(parts) >= 5:
        return "_".join(parts[:5])
    return code


def _group_ai_blocks(blocks: list[BlueprintBlock]) -> dict[str, list[BlueprintBlock]]:
    """
    Group AI blocks for parallel generation.

    If context_group blocks exist, each context_group becomes its own call.
    Remaining standalone blocks are grouped by L1 ancestor.
    If no context_groups exist, all blocks are grouped by L1.
    """
    context_groups = [b for b in blocks if b.type == "context_group"]
    standalone = [b for b in blocks if b.type != "context_group"]

    groups: dict[str, list[BlueprintBlock]] = {}

    if context_groups:
        for cg in context_groups:
            groups[f"cg_{cg.id}"] = [cg]
        # Standalone blocks alongside context_groups → still group by L1
        l1_standalone: dict[str, list[BlueprintBlock]] = defaultdict(list)
        for block in standalone:
            l1_standalone[_get_l1_ancestor(block.curriculum_code)].append(block)
        groups.update(l1_standalone)
    else:
        l1_groups: dict[str, list[BlueprintBlock]] = defaultdict(list)
        for block in blocks:
            l1_groups[_get_l1_ancestor(block.curriculum_code)].append(block)
        groups.update(l1_groups)

    return groups


# ── AI generation per L1 group ───────────────────────────────


async def _generate_ai_group(
    *,
    db: Client,
    group_key: str,
    blocks: list[BlueprintBlock],
    context: dict,
    params: dict,
    org_id: str,
    user_id: str,
    artifact_id: str,
    subject_id: str,
    year_level: str,
    subject_component: str | None,
    curriculum_codes: list[str],
) -> AsyncGenerator[tuple[str, dict], None]:
    """
    Generate questions for one group (context_group or L1 curriculum group).

    Yields (block_id, resolved_question_data) tuples.
    """
    # Collect question types needed for this group
    types_needed = set()
    for block in blocks:
        types_needed.add(block.type)
        if block.children:
            for child in block.children:
                types_needed.add(child.type)

    # Build type specs (only for types in this group)
    type_specs = "\n\n".join(
        QUESTION_TYPE_SPECS.get(t, f"{t}: (sem spec)")
        for t in sorted(types_needed)
    )

    # Collect all curriculum codes present in this group
    group_codes: list[str] = []
    for block in blocks:
        if block.curriculum_code:
            group_codes.append(block.curriculum_code)
        if block.children:
            for child in block.children:
                if child.curriculum_code:
                    group_codes.append(child.curriculum_code)

    # Scope base_content to the codes in this group
    base_content = _scope_base_content(context, group_codes)

    document_content = context.get("document_content") or "Nenhum documento."

    # Collect reference questions
    ref_ids = set()
    for block in blocks:
        ref_ids.update(block.reference_question_ids)
        if block.children:
            for child in block.children:
                ref_ids.update(child.reference_question_ids)

    reference_questions = _fetch_reference_questions(db, list(ref_ids))

    # Build blocks JSON
    blocks_json = json.dumps(
        [_block_to_prompt_dict(b) for b in blocks],
        ensure_ascii=False,
        indent=2,
    )

    system_prompt = RESOLUTION_SYSTEM_PROMPT.format(type_specs=type_specs)

    user_prompt = RESOLUTION_USER_TEMPLATE.format(
        subject_name=context["subject_name"],
        year_level=year_level,
        difficulty=params.get("difficulty", "Médio"),
        base_content=base_content,
        document_content=document_content[:8000] if len(document_content) > 8000 else document_content,
        reference_questions=reference_questions,
        blocks_json=blocks_json,
    )

    # Stream generation
    async for generated_q in chat_completion_stream(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        response_model=GeneratedQuestion,
        temperature=0.3,
        max_tokens=32768,
    ):
        try:
            block_id = generated_q.block_id

            # Find the corresponding blueprint block for metadata
            block = _find_block(blocks, block_id)
            block_curriculum_codes = [block.curriculum_code] if block else curriculum_codes

            q_content = normalize_content(generated_q.content)
            q_content.setdefault("ai_generated_fields", [])
            if "solution" not in q_content["ai_generated_fields"] and q_content.get("solution") is not None:
                q_content["ai_generated_fields"].append("solution")
            if "criteria" not in q_content["ai_generated_fields"] and q_content.get("criteria") is not None:
                q_content["ai_generated_fields"].append("criteria")

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
                curriculum_codes=block_curriculum_codes,
            )

            order = block.order if block else 0

            yield block_id, {
                "block_id": block_id,
                "question_id": parent_id,
                "source": "ai_generated",
                "order": order,
                "type": generated_q.type,
                "label": generated_q.label,
                "content": q_content,
            }

            # Yield children of context_group so they get their own
            # questionBlock nodes in the editor
            if generated_q.children and child_ids:
                for child, child_id in zip(generated_q.children, child_ids):
                    child_content = normalize_content(child.content)
                    yield child.block_id, {
                        "block_id": child.block_id,
                        "question_id": child_id,
                        "source": "ai_generated",
                        "order": order,
                        "type": child.type,
                        "label": child.label,
                        "content": child_content,
                        "parent_question_id": parent_id,
                    }

        except Exception as exc:
            logger.warning(
                "Failed to process generated question (block_id=%s): %s",
                getattr(generated_q, "block_id", "?"),
                exc,
            )
            continue


# ── Worksheet assembly ────────────────────────────────────────


def _assemble_worksheet(
    db: Client,
    artifact_id: str,
    resolved: list[dict],
    blueprint: Blueprint,
) -> None:
    """Build tiptap_json and finalize the artifact."""
    # Build question list for content
    questions_list = [
        {"question_id": r["question_id"], "source": r["source"]}
        for r in resolved
    ]

    # Build tiptap_json with questionBlock nodes
    tiptap_content = []
    for r in resolved:
        tiptap_content.append({
            "type": "questionBlock",
            "attrs": {
                "questionId": r["question_id"],
                "questionType": r["type"],
            },
        })

    tiptap_json = {
        "type": "doc",
        "content": tiptap_content or [{"type": "paragraph"}],
    }

    # Collect all curriculum codes
    all_codes = set()
    for block in blueprint.blocks:
        if block.curriculum_code:
            all_codes.add(block.curriculum_code)
        if block.children:
            for child in block.children:
                if child.curriculum_code:
                    all_codes.add(child.curriculum_code)

    now = datetime.now(timezone.utc).isoformat()

    supabase_execute(
        db.table("artifacts")
        .update({
            "content": {"questions": questions_list},
            "tiptap_json": tiptap_json,
            "curriculum_codes": list(all_codes),
            "is_processed": True,
            "updated_at": now,
        })
        .eq("id", artifact_id),
        entity="artifact",
    )


# ── Helpers ──────────────────────────────────────────────────


def _sse(event_type: str, **kwargs) -> str:
    """Format an SSE event."""
    data = {"type": event_type, **kwargs}
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _count_total_nodes(blocks: list[BlueprintBlock]) -> int:
    """Count all nodes (parent + children) that will become questionBlock entries."""
    count = 0
    for block in blocks:
        count += 1
        if block.children:
            count += len(block.children)
    return count


def _find_block(blocks: list[BlueprintBlock], block_id: str) -> BlueprintBlock | None:
    """Find a block by ID, searching top-level and children."""
    for block in blocks:
        if block.id == block_id:
            return block
        if block.children:
            for child in block.children:
                if child.id == block_id:
                    return child
    return None


def _scope_base_content(context: dict, group_codes: list[str]) -> str:
    """Get base_content relevant to the given curriculum codes (matched by L1 ancestor)."""
    relevant_l1s = {_get_l1_ancestor(code) for code in group_codes}
    parts = []
    for code, text in context.get("base_content_by_code", {}).items():
        if _get_l1_ancestor(code) in relevant_l1s:
            parts.append(f"[{code}]\n{text}")

    if not parts:
        # Fallback: include all base_content
        for code, text in context.get("base_content_by_code", {}).items():
            parts.append(f"[{code}]\n{text}")

    return "\n\n".join(parts) if parts else "Sem conteúdo base."


def _fetch_reference_questions(db: Client, ref_ids: list[str]) -> str:
    """Fetch full content of reference questions for one-shot examples."""
    if not ref_ids:
        return "Sem questões de referência."

    resp = supabase_execute(
        db.table("questions")
        .select("id,type,label,content")
        .in_("id", ref_ids),
        entity="questions",
    )
    questions = resp.data or []

    if not questions:
        return "Sem questões de referência."

    parts = []
    for q in questions:
        q_json = json.dumps(q.get("content", {}), ensure_ascii=False, indent=2)
        parts.append(f"[Referência] type={q['type']} label={q.get('label', '?')}\n{q_json}")

    return "\n\n".join(parts)


def _block_to_prompt_dict(block: BlueprintBlock) -> dict:
    """Convert a BlueprintBlock to a dict for the generation prompt."""
    d = {
        "id": block.id,
        "type": block.type,
        "curriculum_code": block.curriculum_code,
        "goal": block.goal,
    }

    if block.comments:
        d["comments"] = block.comments

    if block.children:
        d["children"] = [
            {
                "id": child.id,
                "type": child.type,
                "goal": child.goal,
                "comments": child.comments if child.comments else [],
            }
            for child in block.children
        ]

    return d

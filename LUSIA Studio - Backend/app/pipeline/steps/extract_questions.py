"""
Step 4: Question Extraction — extract questions from document markdown
and insert them into the questions table.

Runs only when document_category is 'exercises' or 'study_exercises'.

1. Calls the LLM to extract questions as a flat JSON array
2. Rebuilds parent-child tree from parent_label references
3. Inserts questions recursively into the DB with source_type='ai_created'

Fatal: if extraction fails the pipeline job fails.
"""

from __future__ import annotations

import logging
import re
from collections import defaultdict
from datetime import datetime, timezone

from supabase import Client

from app.pipeline.clients.openrouter import chat_completion
from app.pipeline.steps.image_utils import resolve_images_for_llm
from app.utils.db import supabase_execute

logger = logging.getLogger(__name__)


VALID_QUESTION_TYPES = {
    "multiple_choice",
    "true_false",
    "fill_blank",
    "matching",
    "short_answer",
    "multiple_response",
    "ordering",
    "open_extended",
    "context_group",
}

SYSTEM_PROMPT = """\
You are an expert at extracting structured questions and exercises from \
Portuguese educational documents (exams, worksheets, textbooks, study guides, \
exercise sheets, tests).

You will receive the document content as markdown. Your task is to extract \
ALL questions/exercises and return them as a structured JSON object.

═══════════════════════════════════════════════════════════════════════════════
SECTION 1 — DOCUMENT TYPES YOU MAY ENCOUNTER
═══════════════════════════════════════════════════════════════════════════════

Documents can be any of:
- National exams (EXAME + CRITÉRIOS DE CLASSIFICAÇÃO)
- School tests and worksheets (fichas de trabalho, fichas de exercícios)
- Textbook exercises
- Study guides with embedded questions
- Standalone exercise collections
- Mixed study + exercise documents

Some documents include solutions, marking criteria, or grade allocations. \
Others have none. Adapt accordingly.

**What to SKIP (NEVER extract as questions):**
- YAML frontmatter
- Institutional headers (school name, logos, metadata)
- Instructions not related to specific questions ("Utilize caneta...", "Leia \
com atenção...")
- Page numbers, page markers, watermarks
- Formulário sections (formula sheets, constants, periodic tables)
- General marking criteria that apply to the whole document (not to a \
specific question)

**What to EXTRACT:**
- ALL questions and exercises, organized hierarchically
- Solutions/answers when present in the document
- Marking criteria when present (per-question)
- Grade/point allocations when present (COTAÇÕES table or inline)

═══════════════════════════════════════════════════════════════════════════════
SECTION 2 — IMAGE HANDLING
═══════════════════════════════════════════════════════════════════════════════

Images in the markdown use `artifact-image://` URLs.

Rules:
- When a question or context requires an image, use the EXACT URL path from \
the markdown as `image_url`
- Options can also have images — use the `image_url` field on the option object
- Context groups can have images (e.g., a passage with an accompanying figure)
- If no image is referenced, set `image_url` to `null`
- NEVER invent image paths — only use paths that appear in the markdown

═══════════════════════════════════════════════════════════════════════════════
SECTION 3 — OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════════════

Return a JSON object with a "questions" key containing a flat array. Each \
element:

{{
  "questions": [
    {{
      "type": "<question_type>",
      "label": "<display label from document>",
      "parent_label": "<immediate parent's label, or null if top-level>",
      "order_in_parent": <1-indexed integer position among siblings with \
same parent>,
      "content": {{ /* type-specific fields — see below */ }}
    }}
  ]
}}

═══════════════════════════════════════════════════════════════════════════════
SECTION 4 — UNIVERSAL CONTENT FIELDS
═══════════════════════════════════════════════════════════════════════════════

Every question type has these fields inside `content`:

{{
  "question": "texto da questão em Português",
  "image_url": null,
  "solution": "...",
  "criteria": "...",
  "original_grade": null,
  "ai_generated_fields": []
}}

Field definitions:
- `question` — the question text. Always present. Keep in Portuguese.
- `image_url` — image for the question stem. Null if none. Use EXACT URL \
from markdown.
- `solution` — the answer. Format varies by type (see type specs). Always \
present EXCEPT for context_group (always null). If the document does NOT \
provide the answer, GENERATE a correct solution and add "solution" to \
ai_generated_fields.
- `criteria` — correction/marking criteria. Always present EXCEPT for \
context_group (always null). If the document does NOT provide criteria, \
GENERATE appropriate marking criteria and add "criteria" to \
ai_generated_fields. For objective types (MC, TF, MR, fill_blank, matching, \
ordering), criteria can be brief. For open types (short_answer, \
open_extended), generate detailed criteria with expected answer points.
- `original_grade` — numeric point value from the document ONLY (e.g., \
from a COTAÇÕES table or inline "20 pontos"). Null if not in document. \
NEVER AI-generated. NEVER added to ai_generated_fields.
- `ai_generated_fields` — array of field names that you generated because \
they were absent from the document. Examples: ["solution", "criteria"], \
["criteria"], or []. NEVER includes "original_grade". For context_group, \
always [].

IMPORTANT: You MUST always provide `solution` and `criteria` for every \
non-context_group question. If the document provides them, extract them. \
If not, generate them and mark them in ai_generated_fields. The only \
exception is context_group where both are always null.

═══════════════════════════════════════════════════════════════════════════════
SECTION 5 — OPTIONS FORMAT
═══════════════════════════════════════════════════════════════════════════════

All option/item arrays (options, left, right, items) use this structure:

{{ "label": "A", "text": "option text here", "image_url": null }}

- `label` — always present. Used in solution references (e.g. "A", "B", \
"1", "I").
- `text` — the option text. Null if image-only option.
- `image_url` — image for this option. Null if text-only.
- Both `text` and `image_url` can be present simultaneously.

═══════════════════════════════════════════════════════════════════════════════
SECTION 6 — HIERARCHY & GROUPING RULES (CRITICAL)
═══════════════════════════════════════════════════════════════════════════════

Documents can have various hierarchical structures. You MUST handle all of \
these patterns correctly.

### Pattern A: GRUPO / Section + Shared Context

Documents organized into sections (GRUPO I, II, III or Secção, Parte, etc.) \
with shared context (text passages, figures, data) followed by questions.

Example structure:
```
# GRUPO I
## Texto 1
[Long passage or context]

1. [Question referencing Texto 1]
2. [Context for sub-questions]
  2.1. [Sub-question]
  2.2. [Sub-question]
```

Extraction:
```
context_group  label="Grupo I"    parent_label=null         order=1
  context_group  label="Texto 1"  parent_label="Grupo I"    order=1
    ← Passage text goes in this context_group's "question" field
    multiple_choice    label="1."   parent_label="Texto 1"  order=1
    context_group      label="2."   parent_label="Texto 1"  order=2
      ← Introductory paragraph in "2."'s question field
      multiple_choice  label="2.1." parent_label="2."       order=1
      multiple_choice  label="2.2." parent_label="2."       order=2
```

### Pattern B: GRUPO + PARTE (common in Português, Literatura)

Extra nesting level: GRUPO → PARTE → questions.

```
context_group  label="Grupo I"     parent_label=null        order=1
  context_group  label="Parte A"   parent_label="Grupo I"   order=1
    ← Literary text excerpt in question field
    short_answer     label="1."    parent_label="Parte A"   order=1
    open_extended    label="2."    parent_label="Parte A"   order=2
  context_group  label="Parte B"   parent_label="Grupo I"   order=2
    ← Poem text in question field
    short_answer     label="4."    parent_label="Parte B"   order=1
```

### Pattern C: Flat with Sub-questions (common in Matemática)

No section structure. Questions are flat at the top level, some with \
sub-questions.

```
multiple_choice  label="1."   parent_label=null   order=1
context_group    label="2."   parent_label=null   order=2
  ← Context paragraph in question field
  open_extended  label="2.1." parent_label="2."   order=1
  open_extended  label="2.2." parent_label="2."   order=2
```

### Pattern D: Completely Flat (simple worksheets, 9° ano)

No sections, no sub-questions. All questions at the top level.

```
multiple_choice    label="1."   parent_label=null  order=1
multiple_choice    label="2."   parent_label=null  order=2
short_answer       label="3."   parent_label=null  order=3
```

### Pattern E: Sections with Documents/Sources (História, Geografia)

Sections use shared documents (text, images, data) as context.

```
context_group    label="Grupo II"  parent_label=null        order=2
  ← Title + all document texts + image references in question field
  open_extended  label="1."        parent_label="Grupo II"  order=1
  fill_blank     label="2."        parent_label="Grupo II"  order=2
```

KEY for Documents: Multiple documents within a section are NOT separate \
context_groups — they are part of the section's shared context. Include all \
document text and image references in the section's `question` field.

═══════════════════════════════════════════════════════════════════════════════
SECTION 7 — HIERARCHY DECISION RULES
═══════════════════════════════════════════════════════════════════════════════

When to create a context_group:
1. Section headings (GRUPO, PARTE, Secção, etc.) → ALWAYS context_group
2. Text/Document blocks → context_group when they introduce shared context \
for 2+ questions
3. Numbered items with sub-questions (e.g. "2." with 2.1, 2.2, 2.3) → \
context_group when the item text is introductory context (not a directly \
answerable question)
4. Single question with no children and no shared text → regular question \
type, NOT context_group

Single-child rule: If a text block precedes ONLY ONE question, do NOT \
create a context_group. Fold the text into that child's `question` field or \
`image_url`.

Label rules:
- `label`: EXACT display label from document — "1.", "1.1.", "2.2.1.", \
"a)", etc.
- For section context_groups: use descriptive labels like "Grupo I", \
"Parte A", "Texto 1"
- `parent_label`: immediate parent's label, null if top-level
- `order_in_parent`: 1-indexed position among siblings with same parent_label
- Labels may repeat across sections (GRUPO I has "1.", GRUPO II also has \
"1.") — parent_label disambiguates

context_group content rules:
- `solution` → ALWAYS null
- `criteria` → ALWAYS null
- `original_grade` → ALWAYS null
- `ai_generated_fields` → ALWAYS []

═══════════════════════════════════════════════════════════════════════════════
SECTION 8 — TYPE SPECIFICATIONS
═══════════════════════════════════════════════════════════════════════════════

### 8.1 multiple_choice — Single correct option

Extra content fields: `options` (array of option objects), `solution` \
(string — label of correct option)

Example:
{{
  "type": "multiple_choice",
  "label": "1.",
  "parent_label": "Texto 1",
  "order_in_parent": 1,
  "content": {{
    "question": "De acordo com a informação do Texto 1, a Falha da Nazaré \
é uma falha",
    "image_url": null,
    "options": [
      {{"label": "A", "text": "intraplaca, associada à deformação dúctil \
das rochas.", "image_url": null}},
      {{"label": "B", "text": "que evidencia a existência de um regime \
compressivo.", "image_url": null}},
      {{"label": "C", "text": "interplaca, com deslocamento vertical.", \
"image_url": null}},
      {{"label": "D", "text": "que evidencia a subida do teto.", \
"image_url": null}}
    ],
    "solution": "B",
    "criteria": "A resposta correta é a opção (B).",
    "original_grade": 12,
    "ai_generated_fields": []
  }}
}}

Edge cases:
- Labels can be A/B/C/D, 1/2/3/4, a)/b)/c), or other schemes — extract \
exactly as in document
- If the document marks the correct answer inline (asterisk, bold), extract \
it into solution and remove marking from option text
- If only 2 options exist, it is still multiple_choice, NOT true_false
- Checkbox format (A ☐) — normalize label to just "A", "B", etc.

### 8.2 multiple_response — Multiple correct options

Extra content fields: `options` (array), `solution` (array of label \
strings — ALWAYS an array, even if only 1 correct)

Signal words: "seleciona todas", "indica quais", "identifique as três \
afirmações corretas", "assinala com X as afirmações verdadeiras"

Example:
{{
  "type": "multiple_response",
  "label": "3.",
  "parent_label": "Texto 1",
  "order_in_parent": 3,
  "content": {{
    "question": "Identifique as três afirmações corretas.",
    "image_url": null,
    "options": [
      {{"label": "I", "text": "Afirmação 1.", "image_url": null}},
      {{"label": "II", "text": "Afirmação 2.", "image_url": null}},
      {{"label": "III", "text": "Afirmação 3.", "image_url": null}},
      {{"label": "IV", "text": "Afirmação 4.", "image_url": null}},
      {{"label": "V", "text": "Afirmação 5.", "image_url": null}}
    ],
    "solution": ["II", "IV", "V"],
    "criteria": "As três afirmações corretas são II, IV e V.",
    "original_grade": 12,
    "ai_generated_fields": []
  }}
}}

Edge cases:
- solution MUST always be an array, even with 1 correct option: ["A"]
- Distinguish from multiple_choice by signal words or when document marks \
multiple answers correct
- Roman numeral statements (I, II, III, IV, V) should use Roman numerals \
as labels

### 8.3 true_false — ONLY for explicit Verdadeiro/Falso questions

Extra content fields: `solution` (boolean — true or false, NEVER the string)

ONLY use this type when the question explicitly asks for a \
Verdadeiro/Falso classification.
- Questions with Sim/Não → multiple_choice, NOT true_false
- Questions with Correto/Incorreto → multiple_choice, NOT true_false
- Questions with just 2 options → multiple_choice, NOT true_false

If a document presents a list of statements each requiring V/F, each \
statement is its own true_false question. If they share a common enunciado \
("Classifica as afirmações como V ou F"), create a context_group parent.

### 8.4 fill_blank — Text with blanks

Extra content fields:
- `options` (array of arrays — one inner array per blank with choices, or \
[] for free-text)
- `solution` (array of {{"answer": "...", "image_url": null}} objects, one \
per blank, in order)

In `question`, represent ALL blanks as {{{{blank}}}} regardless of how they \
appear in the document (___, [ ], ........, ☐).

Example:
{{
  "type": "fill_blank",
  "label": "1.1.",
  "parent_label": "Grupo I",
  "order_in_parent": 1,
  "content": {{
    "question": "A interação responsável pela formação de ligações \
químicas é de natureza {{{{blank}}}}. A interação gravítica {{{{blank}}}}.",
    "image_url": null,
    "options": [
      ["eletromagnética", "gravítica"],
      ["apenas pode ser atrativa", "apenas pode ser repulsiva"]
    ],
    "solution": [
      {{"answer": "eletromagnética", "image_url": null}},
      {{"answer": "apenas pode ser atrativa", "image_url": null}}
    ],
    "criteria": "Nível 2 — opções corretas: 12 pontos.",
    "original_grade": 12,
    "ai_generated_fields": []
  }}
}}

Edge cases:
- Blank order in solution and options MUST match left-to-right, \
top-to-bottom order in text
- If no options are provided in document, set options to [] (empty array = \
free-text blanks)
- Each inner array in options corresponds to the blank at the same index

### 8.5 matching — Connect left items to right items

Extra content fields:
- `left` (array of option objects)
- `right` (array of option objects)
- `solution` (array of [left_label, right_label] pairs)

Example:
{{
  "type": "matching",
  "label": "5.",
  "parent_label": "Texto 1",
  "order_in_parent": 5,
  "content": {{
    "question": "Associe cada uma das descrições da Coluna I à designação \
da Coluna II.",
    "image_url": null,
    "left": [
      {{"label": "a", "text": "Descrição 1.", "image_url": null}},
      {{"label": "b", "text": "Descrição 2.", "image_url": null}},
      {{"label": "c", "text": "Descrição 3.", "image_url": null}}
    ],
    "right": [
      {{"label": "1", "text": "Termo 1", "image_url": null}},
      {{"label": "2", "text": "Termo 2", "image_url": null}},
      {{"label": "3", "text": "Termo 3", "image_url": null}},
      {{"label": "4", "text": "Termo 4 (distractor)", "image_url": null}}
    ],
    "solution": [["a", "2"], ["b", "3"], ["c", "1"]],
    "criteria": "...",
    "original_grade": 12,
    "ai_generated_fields": []
  }}
}}

Edge cases:
- Right array can have MORE items than left (distractors)
- Right items can be reused: [["A","1"], ["B","1"], ["C","2"]]

### 8.6 ordering — Arrange items in correct sequence

Extra content fields:
- `items` (array of option objects in SCRAMBLED document order)
- `solution` (array of labels in CORRECT order)

Example:
{{
  "type": "ordering",
  "label": "6.",
  "parent_label": "Texto 1",
  "order_in_parent": 6,
  "content": {{
    "question": "Ordene as expressões de A a E, de modo a reconstituir a \
sequência.",
    "image_url": null,
    "items": [
      {{"label": "A", "text": "Passo 1.", "image_url": null}},
      {{"label": "B", "text": "Passo 2.", "image_url": null}},
      {{"label": "C", "text": "Passo 3.", "image_url": null}},
      {{"label": "D", "text": "Passo 4.", "image_url": null}},
      {{"label": "E", "text": "Passo 5.", "image_url": null}}
    ],
    "solution": ["C", "B", "A", "E", "D"],
    "criteria": "...",
    "original_grade": 12,
    "ai_generated_fields": []
  }}
}}

Edge case: items are always in document order (scrambled). Correct order is \
ONLY in solution.

### 8.7 short_answer — Brief text answer (1-3 sentences)

Extra content fields: `solution` (string — answer text)

Use for: brief answers, definitions, single computations, identification \
tasks. "Resposta restrita" or "Resposta curta" → short_answer.

### 8.8 open_extended — Essays, multi-step problems, detailed answers

Extra content fields: `solution` (string — model answer), `criteria` \
(string — marking rubric)

Use for: essays, multi-step mathematical solutions, text analysis, document \
comparison, scientific explanations.
Patterns: "Apresente todos os cálculos", "Na sua resposta, desenvolva...", \
"Resolve", "Explica...", "Resposta aberta/extensa"

Criteria rules:
- WITH original_grade: criteria MUST break down points per topic/step
- WITHOUT original_grade: criteria lists required concepts without points
- If criteria has multiple solution processes → include ALL
- If criteria has performance level tables (Nível 5/4/3/2/1) → include \
full table
- If criteria has dual rubrics (Conteúdos + Comunicação) → include both

### 8.9 context_group — Shared context, NOT a question

Extra content fields: only `question` (the context text) and `image_url`

- `solution` → ALWAYS null
- `criteria` → ALWAYS null
- `original_grade` → ALWAYS null
- `ai_generated_fields` → ALWAYS []

When to create:
- Section headings with shared context for 2+ questions
- Text passages, document excerpts preceding 2+ questions
- Numbered items that provide introductory text for sub-questions

When NOT to create:
- Single-child rule: if text precedes ONLY ONE question, fold it into that \
child's question/image_url
- Never create empty context_groups with no meaningful shared text

═══════════════════════════════════════════════════════════════════════════════
SECTION 9 — SOLUTION & CRITERIA GENERATION
═══════════════════════════════════════════════════════════════════════════════

Rules for solutions and criteria:

1. If the document includes a marking scheme or solutions section (e.g., \
CRITÉRIOS DE CLASSIFICAÇÃO, SOLUÇÕES, RESPOSTAS), cross-reference it to \
extract solutions and criteria per question.

2. Solution extraction/generation by type:
   - multiple_choice: solution = label string of correct option
   - multiple_response: solution = array of correct labels
   - true_false: solution = boolean true/false
   - fill_blank: solution = array of {{"answer": "...", "image_url": null}} \
objects, one per blank
   - matching: solution = array of [left, right] pairs
   - ordering: solution = array of labels in correct order
   - short_answer: solution = answer text
   - open_extended: solution = model answer text

3. If solution is NOT in the document → GENERATE it → add "solution" to \
ai_generated_fields
4. If criteria is NOT in the document → GENERATE it → add "criteria" to \
ai_generated_fields
5. original_grade: extract from document ONLY. NEVER generate. NEVER add \
to ai_generated_fields.
6. context_group: solution/criteria/original_grade ALWAYS null, ai_generated_fields ALWAYS []

When GENERATING solutions (ai_generated_fields includes "solution"):
- For objective types: determine the correct answer based on the question \
content and your knowledge
- For open types: write a complete, accurate model answer in Portuguese
- For math: show the full resolution with steps

When GENERATING criteria (ai_generated_fields includes "criteria"):
- For objective types: briefly state the correct answer
- For short_answer: list the key points expected in the answer
- For open_extended: create a detailed rubric listing required concepts, \
expected answer structure, and (if original_grade exists) point allocation

═══════════════════════════════════════════════════════════════════════════════
SECTION 10 — SUBJECT-SPECIFIC CONVENTIONS
═══════════════════════════════════════════════════════════════════════════════

- Matemática: LaTeX formulas ($...$), step-by-step solutions, process \
alternatives. Formulário sections → SKIP.
- Física e Química (FQA): Fill-blank tables with column options, SI units, \
chemical equations. Periodic table → SKIP.
- Português / Literatura: Literary passages as context_group, PARTE \
structure, writing quality rubrics separate from content rubrics.
- História / HCA: Document analysis, content+form dual rubrics.
- Biologia e Geologia: Texto blocks with Figuras, Coluna I/II matching, \
ordering sequences, tiered rubrics.
- Geografia / Economia: Map/chart/graph analysis, statistical data.
- 9° ano: Checkbox format (A ☐ → normalize to "A"), flat structure, \
simpler hierarchy.

═══════════════════════════════════════════════════════════════════════════════
SECTION 11 — EDGE CASES & DISAMBIGUATION
═══════════════════════════════════════════════════════════════════════════════

- MC + justify: if a question asks to choose an option AND justify, split \
into the MC question + justification as a sibling short_answer or \
open_extended
- ★ mandatory markers → do NOT include in label, still extract the question
- Labels can be: "1.", "1.1.", "2.2.1.", "a)", "A)", "I.", or any scheme
- Roman numeral statements in multiple_response → use as option labels
- When question numbering resets across sections, parent_label disambiguates
- Versioned documents (Versão 1/2): extract whatever version is present
- If document has no clear structure, extract questions as flat top-level \
items

═══════════════════════════════════════════════════════════════════════════════
SECTION 12 — fill_blank RULES
═══════════════════════════════════════════════════════════════════════════════

- Represent ALL blanks as {{{{blank}}}} in the "question" field
- If the document uses ___, [ ], ........, or any placeholder, normalize to \
{{{{blank}}}}
- The order in solution and options corresponds to the order \
left→right, top→bottom in text
- If no options are provided, options is [] — free-text blanks

═══════════════════════════════════════════════════════════════════════════════
SECTION 13 — OUTPUT RULES
═══════════════════════════════════════════════════════════════════════════════

- Return ONLY the JSON object {{"questions": [...]}}
- No markdown fences, no explanation, no comments
- All question text and solutions must remain in Portuguese
- Ensure valid JSON: escape quotes properly, handle LaTeX backslashes
- Every non-context_group question MUST have non-null solution and criteria \
(generate if absent, mark in ai_generated_fields)\
"""


async def extract_questions(
    db: Client,
    artifact_id: str,
    org_id: str,
    user_id: str,
    markdown: str,
    *,
    categorization: dict | None = None,
) -> tuple[str, list[str]]:
    """
    Extract questions from document markdown.

    Returns:
        (modified_markdown_with_markers, list_of_question_ids)
    """
    categorization = categorization or {}

    # Fetch artifact for curriculum metadata
    artifact_meta = _get_artifact_curriculum(db, artifact_id)

    # Merge categorization results with artifact metadata
    subject_id = artifact_meta.get("subject_id")
    year_level = artifact_meta.get("year_level")
    subject_component = (
        categorization.get("subject_component")
        or artifact_meta.get("subject_component")
    )
    curriculum_codes = categorization.get("curriculum_codes") or []

    all_question_ids: list[str] = []

    logger.info("Extracting questions from artifact %s (%d chars)", artifact_id, len(markdown))

    # Resolve artifact-image:// URLs to multimodal content blocks
    multimodal_content = await resolve_images_for_llm(db, markdown)

    # Single LLM call for the full document
    result = await chat_completion(
        system_prompt=SYSTEM_PROMPT,
        user_prompt=multimodal_content,
        response_format={"type": "json_object"},
        temperature=0.1,
        max_tokens=65536,
    )

    raw_questions = result.get("questions", [])
    if not isinstance(raw_questions, list):
        logger.warning("LLM returned non-list questions for artifact %s", artifact_id)
        raw_questions = []

    logger.info("LLM returned %d items for artifact %s", len(raw_questions), artifact_id)

    # Convert flat parent_label format to nested tree
    tree_roots = _flat_to_forest(raw_questions)

    logger.info("Rebuilt %d top-level question trees for artifact %s", len(tree_roots), artifact_id)

    for node in tree_roots:
        try:
            ids = _insert_tree_recursive(
                db,
                node,
                parent_id=None,
                org_id=org_id,
                user_id=user_id,
                artifact_id=artifact_id,
                subject_id=subject_id,
                year_level=year_level,
                subject_component=subject_component,
                curriculum_codes=curriculum_codes,
            )
            all_question_ids.extend(ids)

        except Exception as exc:
            logger.warning(
                "Failed to insert question tree (label=%s): %s",
                node.get("label", "?"),
                exc,
            )
            continue

    logger.info(
        "Extracted %d questions from artifact %s",
        len(all_question_ids),
        artifact_id,
    )

    return markdown, all_question_ids


# ── Flat → Tree conversion ────────────────────────────────


def _flat_to_forest(flat_items: list[dict]) -> list[dict]:
    """
    Convert a flat array with parent_label references into a list of
    root-level tree nodes, each with nested `children`.

    Handles arbitrary nesting depth (Grupo → Texto → 2. → 2.1).
    Falls back gracefully: items whose parent_label doesn't match any
    sibling are promoted to root level.
    """
    # Index items by label. When labels repeat (e.g. "1." in different
    # GRUPOs), we rely on document order — the parent_label reference
    # always means the nearest preceding item with that label that
    # hasn't been claimed yet.
    items_by_label: dict[str, list[dict]] = defaultdict(list)
    for item in flat_items:
        label = item.get("label")
        if label:
            items_by_label[label].append(item)
        # Ensure children list exists on each item
        item.setdefault("children", [])

    roots: list[dict] = []
    claimed: set[int] = set()  # indices of items that became children

    for idx, item in enumerate(flat_items):
        parent_label = item.get("parent_label")
        if not parent_label:
            # Top-level item
            continue

        # Find the parent: look for the most recent item with that label
        # that appears before this item in the flat list
        parent_found = False
        candidates = items_by_label.get(parent_label, [])
        for candidate in reversed(candidates):
            # The candidate must appear before this item in the original list
            candidate_idx = flat_items.index(candidate)
            if candidate_idx < idx:
                candidate["children"].append(item)
                claimed.add(idx)
                parent_found = True
                break

        if not parent_found:
            # Fallback: look forward too (parent might be declared after children
            # in some edge cases)
            for candidate in candidates:
                candidate_idx = flat_items.index(candidate)
                if candidate_idx != idx:
                    candidate["children"].append(item)
                    claimed.add(idx)
                    parent_found = True
                    break

        if not parent_found:
            logger.warning(
                "Could not find parent_label=%r for item label=%r, promoting to root",
                parent_label,
                item.get("label"),
            )

    # Collect roots: items that were not claimed as children
    for idx, item in enumerate(flat_items):
        if idx not in claimed:
            roots.append(item)

    # Sort children by order_in_parent
    def _sort_children(node: dict) -> None:
        children = node.get("children", [])
        children.sort(key=lambda c: c.get("order_in_parent", 0))
        for child in children:
            _sort_children(child)

    for root in roots:
        _sort_children(root)

    return roots


# ── Recursive insertion ───────────────────────────────────


def _insert_tree_recursive(
    db: Client,
    node: dict,
    *,
    parent_id: str | None,
    org_id: str,
    user_id: str,
    artifact_id: str,
    subject_id: str | None,
    year_level: str | None,
    subject_component: str | None,
    curriculum_codes: list[str],
) -> list[str]:
    """
    Recursively insert a question node and all its children.

    Returns list of all inserted question IDs.
    """
    q_type = validate_type(node.get("type"))
    content = node.get("content", {})
    if not isinstance(content, dict):
        content = {"question": str(content)}

    # Ensure content has at minimum a "question" key
    if "question" not in content and q_type != "context_group":
        content["question"] = node.get("label", "")

    # Normalize content to new schema
    content = normalize_content(content)

    # Build insert data
    data = {
        "organization_id": org_id,
        "created_by": user_id,
        "source_type": "ai_created",
        "artifact_id": artifact_id,
        "type": q_type,
        "content": content,
        "is_public": False,
    }

    if parent_id:
        data["parent_id"] = parent_id
        order = node.get("order_in_parent", 0)
        # Convert 1-indexed from LLM to 0-indexed for DB
        data["order_in_parent"] = max(0, order - 1) if isinstance(order, int) else 0

    if node.get("label"):
        data["label"] = str(node["label"])
    if subject_id:
        data["subject_id"] = subject_id
    if year_level:
        data["year_level"] = year_level
    if subject_component:
        data["subject_component"] = subject_component
    if curriculum_codes:
        data["curriculum_codes"] = curriculum_codes

    now = datetime.now(timezone.utc).isoformat()
    data["created_at"] = now
    data["updated_at"] = now

    response = supabase_execute(
        db.table("questions").insert(data),
        entity="question",
    )
    row = response.data[0] if response.data else {}
    node_id = row["id"]

    all_ids = [node_id]

    # Recursively insert children
    for child in node.get("children", []):
        try:
            child_ids = _insert_tree_recursive(
                db,
                child,
                parent_id=node_id,
                org_id=org_id,
                user_id=user_id,
                artifact_id=artifact_id,
                subject_id=subject_id,
                year_level=year_level,
                subject_component=subject_component,
                curriculum_codes=curriculum_codes,
            )
            all_ids.extend(child_ids)
        except Exception as exc:
            logger.warning(
                "Failed to insert child question (label=%s) under parent %s: %s",
                child.get("label", "?"),
                node_id,
                exc,
            )
            continue

    return all_ids


def insert_question_tree(
    db: Client,
    raw_q: dict,
    *,
    org_id: str,
    user_id: str,
    artifact_id: str,
    subject_id: str | None,
    year_level: str | None,
    subject_component: str | None,
    curriculum_codes: list[str],
) -> tuple[str, list[str]]:
    """
    Insert a question and its children into the DB.

    Public wrapper around ``_insert_tree_recursive`` that returns
    ``(parent_id, child_ids)`` for callers that need them separated.
    """
    all_ids = _insert_tree_recursive(
        db,
        raw_q,
        parent_id=None,
        org_id=org_id,
        user_id=user_id,
        artifact_id=artifact_id,
        subject_id=subject_id,
        year_level=year_level,
        subject_component=subject_component,
        curriculum_codes=curriculum_codes,
    )
    parent_id = all_ids[0]
    child_ids = all_ids[1:]
    return parent_id, child_ids


# ── Marker replacement ──────────────────────────────────────


def _apply_markers(
    markdown: str,
    replacements: list[tuple[str, str]],
) -> str:
    """
    Replace original_text spans in markdown with question markers.

    Processes from longest to shortest original_text to avoid
    substring overlap issues.

    Fallback strategy:
    1. Exact match
    2. Normalized whitespace match
    3. Anchor match (first ~100 chars)
    4. Append at end (question is still in DB, just not inline)
    """
    # Sort by length descending to avoid substring issues
    sorted_replacements = sorted(replacements, key=lambda r: len(r[0]), reverse=True)

    for original_text, marker in sorted_replacements:
        if not original_text.strip():
            continue

        # Strategy 1: Exact match
        if original_text in markdown:
            markdown = markdown.replace(original_text, marker, 1)
            continue

        # Strategy 2: Normalized whitespace match
        normalized_original = _normalize_whitespace(original_text)
        normalized_md = _normalize_whitespace(markdown)

        idx = normalized_md.find(normalized_original)
        if idx != -1:
            start = _find_normalized_position(markdown, idx)
            end = _find_normalized_position(
                markdown, idx + len(normalized_original)
            )
            if start is not None and end is not None:
                markdown = markdown[:start] + marker + markdown[end:]
                continue

        # Strategy 3: Anchor match using first ~100 chars
        anchor = original_text.strip()[:100].strip()
        if len(anchor) > 20 and anchor in markdown:
            anchor_idx = markdown.index(anchor)
            approx_end = min(
                anchor_idx + len(original_text) + 50, len(markdown)
            )
            next_break = markdown.find("\n\n", anchor_idx + len(original_text) - 50)
            if next_break != -1 and next_break < approx_end:
                end_idx = next_break
            else:
                end_idx = anchor_idx + len(original_text)
                end_idx = min(end_idx, len(markdown))

            markdown = markdown[:anchor_idx] + marker + markdown[end_idx:]
            continue

        # Strategy 4: Append fallback
        logger.warning(
            "Could not find original_text in markdown for marker %s, appending",
            marker,
        )
        markdown = markdown + f"\n\n{marker}"

    return markdown


def _normalize_whitespace(text: str) -> str:
    """Collapse all whitespace to single spaces and strip."""
    return re.sub(r"\s+", " ", text).strip()


def _find_normalized_position(text: str, normalized_idx: int) -> int | None:
    """
    Map a position in normalized text back to original text position.

    Walks through the original text counting non-whitespace-collapsed chars.
    """
    norm_pos = 0
    i = 0
    in_whitespace = False

    while i < len(text) and norm_pos < normalized_idx:
        if text[i] in (" ", "\t", "\n", "\r"):
            if not in_whitespace:
                norm_pos += 1
                in_whitespace = True
        else:
            norm_pos += 1
            in_whitespace = False
        i += 1

    return i if norm_pos == normalized_idx else None


# ── Utilities ────────────────────────────────────────────────


def normalize_content(content: dict) -> dict:
    """
    Normalize question content to the new schema.

    Removes deprecated fields (correct_answer, correct_answers, correct_pairs,
    correct_order, blanks, tip, is_correct on options) and ensures new fields
    exist (solution, criteria, original_grade, ai_generated_fields).
    """
    # Remove deprecated fields
    for deprecated in ("correct_answer", "correct_answers", "correct_pairs",
                       "correct_order", "blanks", "tip"):
        content.pop(deprecated, None)

    # Normalize options: remove is_correct, ensure label-based format
    if "options" in content and isinstance(content["options"], list):
        for opt in content["options"]:
            if isinstance(opt, dict):
                opt.pop("is_correct", None)
                opt.setdefault("image_url", None)

    # Ensure new schema fields exist with defaults
    content.setdefault("solution", None)
    content.setdefault("criteria", None)
    content.setdefault("original_grade", None)
    content.setdefault("ai_generated_fields", [])

    return content


def validate_type(raw_type: str | None) -> str:
    """Validate and normalize question type, defaulting to open_extended."""
    if raw_type and raw_type in VALID_QUESTION_TYPES:
        return raw_type
    return "open_extended"


def _get_artifact_curriculum(db: Client, artifact_id: str) -> dict:
    """Fetch curriculum metadata from the artifact."""
    response = supabase_execute(
        db.table("artifacts")
        .select("subject_id,year_level,subject_component,curriculum_codes")
        .eq("id", artifact_id)
        .limit(1),
        entity="artifact",
    )
    rows = response.data or []
    return rows[0] if rows else {}

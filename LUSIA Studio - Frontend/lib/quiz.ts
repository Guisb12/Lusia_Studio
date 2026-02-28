import { Artifact } from "@/lib/artifacts";
import type { QuizStreamQuestion } from "@/lib/quiz-generation";

export type QuizQuestionType =
    | "multiple_choice"
    | "true_false"
    | "fill_blank"
    | "matching"
    | "short_answer"
    | "multiple_response"
    | "ordering";

export interface QuizQuestion {
    id: string;
    organization_id: string;
    created_by: string;
    type: QuizQuestionType;
    content: Record<string, any>;
    subject_id: string | null;
    year_level: string | null;
    subject_component: string | null;
    curriculum_codes: string[] | null;
    is_public: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface QuizQuestionCreateInput {
    type: QuizQuestionType;
    content: Record<string, any>;
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes?: string[] | null;
    is_public?: boolean;
}

export interface QuizQuestionUpdateInput {
    type?: QuizQuestionType;
    content?: Record<string, any>;
    subject_id?: string | null;
    year_level?: string | null;
    subject_component?: string | null;
    curriculum_codes?: string[] | null;
    is_public?: boolean;
}

export interface QuizImageUploadResult {
    bucket: string;
    path: string;
    public_url: string;
}

export interface QuizEvaluationItem {
    question_id: string;
    type: QuizQuestionType;
    answered: boolean;
    is_correct: boolean;
}

export interface QuizEvaluationSummary {
    score: number;
    total_questions: number;
    correct_questions: number;
    answered_questions: number;
    results: QuizEvaluationItem[];
}

export const QUIZ_QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
    multiple_choice: "Escolha múltipla",
    true_false: "Verdadeiro/Falso",
    fill_blank: "Preencher lacunas",
    matching: "Associação",
    short_answer: "Resposta curta",
    multiple_response: "Múltiplas respostas",
    ordering: "Ordenação",
};

export const QUIZ_QUESTION_TYPE_OPTIONS: {
    value: QuizQuestionType;
    label: string;
}[] = Object.entries(QUIZ_QUESTION_TYPE_LABELS).map(([value, label]) => ({
    value: value as QuizQuestionType,
    label,
}));

/**
 * Generate a stable, deterministic ID for an option/item/blank.
 * Ensures the same DB row always produces the same IDs across page loads,
 * unlike crypto.randomUUID() which generates different IDs each time.
 */
function deterministicId(
    questionId: string,
    namespace: string,
    discriminator: string | number,
): string {
    return `${questionId}__${namespace}_${discriminator}`;
}

function toStringSafe(value: any): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

function toBool(value: any): boolean | null {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (["true", "1", "yes"].includes(v)) return true;
        if (["false", "0", "no"].includes(v)) return false;
    }
    return null;
}

function isNonEmptyAnswer(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
}

function normalizeIdList(
    value: any,
    preserveOrder = false,
): string[] {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        value = value.value ?? value.selected ?? value.order ?? value.answers ?? value;
    }
    if (!Array.isArray(value)) return [];
    const normalized = value
        .map((item) => toStringSafe(item))
        .filter((item): item is string => Boolean(item));
    if (preserveOrder) return normalized;
    return Array.from(new Set(normalized)).sort();
}

function normalizePairs(value: any): Set<string> {
    const pairs = new Set<string>();
    const pushPair = (left: any, right: any) => {
        const l = toStringSafe(left);
        const r = toStringSafe(right);
        if (l && r) pairs.add(`${l}::${r}`);
    };

    if (value && typeof value === "object" && !Array.isArray(value)) {
        const inner = value.pairs ?? value;
        if (inner && typeof inner === "object" && !Array.isArray(inner)) {
            Object.entries(inner).forEach(([left, right]) => pushPair(left, right));
            return pairs;
        }
    }

    if (Array.isArray(value)) {
        value.forEach((pair) => {
            if (Array.isArray(pair) && pair.length === 2) {
                pushPair(pair[0], pair[1]);
                return;
            }
            if (pair && typeof pair === "object") {
                pushPair(pair.left_id ?? pair.left, pair.right_id ?? pair.right);
            }
        });
    }

    return pairs;
}

function extractAnswerValue(answerEntry: any): any {
    if (answerEntry && typeof answerEntry === "object" && "value" in answerEntry) {
        return answerEntry.value;
    }
    return answerEntry;
}

function gradeQuestion(
    question: Pick<QuizQuestion, "type" | "content">,
    answerEntry: any,
): boolean | null {
    const type = question.type;
    const content = question.content || {};
    let value = extractAnswerValue(answerEntry);

    if (type === "multiple_choice") {
        const correct = toStringSafe(content.correct_answer);
        if (!correct) return null;
        if (value && typeof value === "object") {
            value = value.selected_option_id ?? value.option_id ?? value.id;
        }
        return toStringSafe(value) === correct;
    }

    if (type === "true_false") {
        const correct = toBool(content.correct_answer);
        if (correct === null) return null;
        return toBool(value) === correct;
    }

    if (type === "fill_blank") {
        const blanks = Array.isArray(content.blanks) ? content.blanks : [];
        const correctByBlank = new Map<string, string>();
        blanks.forEach((blank: any) => {
            const blankId = toStringSafe(blank?.id);
            const correctAnswer = toStringSafe(blank?.correct_answer);
            if (blankId && correctAnswer) correctByBlank.set(blankId, correctAnswer);
        });
        if (!correctByBlank.size) return null;

        let selectedSource: any = value;
        if (selectedSource && typeof selectedSource === "object" && !Array.isArray(selectedSource)) {
            selectedSource = selectedSource.blanks ?? selectedSource;
        }

        const selectedByBlank = new Map<string, string>();
        if (Array.isArray(selectedSource)) {
            selectedSource.forEach((item) => {
                const blankId = toStringSafe(item?.blank_id ?? item?.id);
                const selected = toStringSafe(
                    item?.selected_option_id ?? item?.answer ?? item?.value
                );
                if (blankId && selected) selectedByBlank.set(blankId, selected);
            });
        } else if (selectedSource && typeof selectedSource === "object") {
            Object.entries(selectedSource).forEach(([blankId, selected]) => {
                const key = toStringSafe(blankId);
                const val = toStringSafe(selected);
                if (key && val) selectedByBlank.set(key, val);
            });
        }

        for (const [blankId, correctAnswer] of correctByBlank.entries()) {
            if (selectedByBlank.get(blankId) !== correctAnswer) return false;
        }
        return true;
    }

    if (type === "matching") {
        const correctPairs = normalizePairs(content.correct_pairs);
        if (!correctPairs.size) return null;
        const selectedPairs = normalizePairs(value);
        if (selectedPairs.size !== correctPairs.size) return false;
        for (const pair of correctPairs) {
            if (!selectedPairs.has(pair)) return false;
        }
        return true;
    }

    if (type === "short_answer") {
        const correctAnswers = Array.isArray(content.correct_answers)
            ? content.correct_answers
            : [];
        if (!correctAnswers.length) return null;
        const caseSensitive = Boolean(content.case_sensitive);
        let selected = toStringSafe(
            value && typeof value === "object" ? value.text ?? value.answer : value
        );
        selected = (selected || "").trim();
        if (!caseSensitive) selected = selected.toLowerCase();

        const normalizedCorrect = new Set(
            correctAnswers
                .filter((item) => isNonEmptyAnswer(item))
                .map((item) =>
                    caseSensitive
                        ? String(item).trim()
                        : String(item).trim().toLowerCase()
                )
        );
        return normalizedCorrect.has(selected);
    }

    if (type === "multiple_response") {
        const correct = normalizeIdList(content.correct_answers);
        if (!correct.length) return null;
        const selected = normalizeIdList(value);
        return JSON.stringify(selected) === JSON.stringify(correct);
    }

    if (type === "ordering") {
        const correct = normalizeIdList(content.correct_order, true);
        if (!correct.length) return null;
        const selected = normalizeIdList(value, true);
        return JSON.stringify(selected) === JSON.stringify(correct);
    }

    return null;
}

export function extractQuizAnswers(payload: any): Record<string, any> {
    if (!payload || typeof payload !== "object") return {};
    if (payload.answers && typeof payload.answers === "object") return payload.answers;
    return payload;
}

/**
 * Migrate answers that reference old random UUIDs to the new deterministic IDs.
 * Works by finding options whose text/label matches between the raw DB questions
 * and the normalized questions.
 */
export function migrateAnswersToNewIds(
    normalizedQuestions: QuizQuestion[],
    answers: Record<string, any>,
    rawQuestionsById: Map<string, QuizQuestion>,
): Record<string, any> {
    const migrated = { ...answers };

    for (const question of normalizedQuestions) {
        const answer = migrated[question.id];
        if (answer === undefined || answer === null) continue;

        const raw = rawQuestionsById.get(question.id);
        if (!raw) continue;
        const rawContent = raw.content || {};
        const content = question.content;

        if (question.type === "multiple_choice") {
            if (typeof answer === "string") {
                const options = content.options || [];
                if (!options.find((o: any) => o.id === answer)) {
                    const rawOptions = rawContent.options || [];
                    const rawOpt = rawOptions.find((o: any) => o.id === answer);
                    if (rawOpt) {
                        const match = options.find(
                            (o: any) => o.text === rawOpt.text || (o.label && o.label === rawOpt.label),
                        );
                        if (match) migrated[question.id] = match.id;
                    }
                }
            }
        } else if (question.type === "multiple_response") {
            if (Array.isArray(answer)) {
                const options = content.options || [];
                const rawOptions = rawContent.options || [];
                migrated[question.id] = answer.map((aid: string) => {
                    if (options.find((o: any) => o.id === aid)) return aid;
                    const rawOpt = rawOptions.find((o: any) => o.id === aid);
                    if (rawOpt) {
                        const match = options.find(
                            (o: any) => o.text === rawOpt.text || (o.label && o.label === rawOpt.label),
                        );
                        if (match) return match.id;
                    }
                    return aid;
                });
            }
        } else if (question.type === "ordering") {
            if (Array.isArray(answer)) {
                const items = content.items || [];
                const rawItems = rawContent.items || rawContent.options || [];
                migrated[question.id] = answer.map((aid: string) => {
                    if (items.find((i: any) => i.id === aid)) return aid;
                    const rawItem = rawItems.find((i: any) => i.id === aid);
                    if (rawItem) {
                        const match = items.find(
                            (i: any) => i.text === rawItem.text || (i.label && i.label === rawItem.label),
                        );
                        if (match) return match.id;
                    }
                    return aid;
                });
            }
        } else if (question.type === "matching") {
            if (answer && typeof answer === "object" && !Array.isArray(answer)) {
                const leftItems = content.left_items || [];
                const rightItems = content.right_items || [];
                const rawLeft = rawContent.left_items || [];
                const rawRight = rawContent.right_items || [];
                const remapped: Record<string, string> = {};
                for (const [leftId, rightId] of Object.entries(answer)) {
                    const newLeftId = remapId(leftId, leftItems, rawLeft);
                    const newRightId = remapId(rightId as string, rightItems, rawRight);
                    remapped[newLeftId] = newRightId;
                }
                migrated[question.id] = remapped;
            }
        } else if (question.type === "fill_blank") {
            if (answer && typeof answer === "object" && !Array.isArray(answer)) {
                const blanks = content.blanks || [];
                const options = content.options || [];
                const rawBlanks = rawContent.blanks || [];
                const rawOptions = rawContent.options || [];
                const remapped: Record<string, string> = {};
                for (const [blankId, optId] of Object.entries(answer)) {
                    const newBlankId = remapId(blankId, blanks, rawBlanks);
                    const newOptId = remapId(optId as string, options, rawOptions);
                    remapped[newBlankId] = newOptId;
                }
                migrated[question.id] = remapped;
            }
        }
    }

    return migrated;
}

function remapId(oldId: string, newItems: any[], rawItems: any[]): string {
    if (newItems.find((i: any) => i.id === oldId)) return oldId;
    const rawItem = rawItems.find((i: any) => i.id === oldId);
    if (rawItem) {
        const match = newItems.find(
            (i: any) => i.text === rawItem.text || (i.label && i.label === rawItem.label),
        );
        if (match) return match.id;
    }
    return oldId;
}

export function evaluateQuizAttempt(
    questions: QuizQuestion[],
    attemptPayload: any,
): QuizEvaluationSummary | null {
    const answers = extractQuizAnswers(attemptPayload);
    if (!questions.length) return null;

    let totalQuestions = 0;
    let correctQuestions = 0;
    let answeredQuestions = 0;
    const results: QuizEvaluationItem[] = [];

    questions.forEach((question) => {
        const answer = answers[question.id];
        if (isNonEmptyAnswer(answer)) answeredQuestions += 1;

        const isCorrect = gradeQuestion(question, answer);
        if (isCorrect === null) return;

        totalQuestions += 1;
        if (isCorrect) correctQuestions += 1;

        results.push({
            question_id: question.id,
            type: question.type,
            answered: isNonEmptyAnswer(answer),
            is_correct: isCorrect,
        });
    });

    if (!totalQuestions) return null;

    const score = Math.round((correctQuestions / totalQuestions) * 10000) / 100;
    return {
        score,
        total_questions: totalQuestions,
        correct_questions: correctQuestions,
        answered_questions: answeredQuestions,
        results,
    };
}

export function extractQuizQuestionIds(content: Record<string, any> | null | undefined): string[] {
    if (!content || typeof content !== "object") return [];
    const ids: string[] = [];
    const seen = new Set<string>();

    const push = (rawId: any) => {
        const id = toStringSafe(rawId);
        if (!id || seen.has(id)) return;
        seen.add(id);
        ids.push(id);
    };

    [content.question_ids, content.quiz_question_ids].forEach((rawList) => {
        if (Array.isArray(rawList)) rawList.forEach(push);
    });

    if (content.quiz && typeof content.quiz === "object") {
        const nested = content.quiz;
        [nested.question_ids, nested.quiz_question_ids].forEach((rawList: any) => {
            if (Array.isArray(rawList)) rawList.forEach(push);
        });
    }

    if (Array.isArray(content.questions)) {
        content.questions.forEach((q: any) => {
            push(q?.id ?? q?.question_id);
        });
    }

    return ids;
}

export function withQuizQuestionIds(
    artifactContent: Record<string, any> | undefined,
    questionIds: string[],
): Record<string, any> {
    return {
        ...(artifactContent || {}),
        question_ids: questionIds,
    };
}

export function getQuizAttemptPayloadFromStudentAssignment(
    row: { progress?: Record<string, any> | null; submission?: Record<string, any> | null },
): Record<string, any> {
    return (row.submission as Record<string, any>) || (row.progress as Record<string, any>) || { answers: {} };
}

export function getQuizArtifactSubjectContext(artifact: Artifact | null | undefined) {
    const content = artifact?.content || {};
    const curriculum = Array.isArray(content.curriculum_items) ? content.curriculum_items : [];
    return {
        subject_id: artifact?.subject_ids?.[0] || null,
        year_level: content.year_level || null,
        subject_component: content.subject_component || null,
        curriculum_codes: curriculum
            .map((item: any) => item?.code)
            .filter((code: any): code is string => Boolean(code)),
    };
}

/**
 * Normalize a question loaded from the DB into the editor schema.
 *
 * The backend pipeline stores questions with a label-based schema:
 *   options: [{ label: "A", text: "...", image_url: null }, ...]
 *   solution: "B"  (label of the correct option)
 *
 * The frontend editor expects a UUID-based schema:
 *   options: [{ id: "<uuid>", text: "...", image_url: null }, ...]
 *   correct_answer: "<uuid>"  (id of the correct option)
 *
 * This function converts the former to the latter, in-memory at load time.
 * The normalized version is persisted to the DB when the user saves.
 */
export function normalizeQuestionForEditor(question: QuizQuestion): QuizQuestion {
    const content = { ...question.content };

    if (question.type === "multiple_choice" || question.type === "multiple_response") {
        const rawOptions = Array.isArray(content.options) ? content.options : [];
        const options = rawOptions.map((opt: any, index: number) => ({
            ...opt,
            id: opt.id || deterministicId(question.id, "opt", opt.label ?? index),
        }));
        content.options = options;

        if (question.type === "multiple_choice") {
            if (!content.correct_answer && content.solution != null) {
                const solutionLabel = String(content.solution);
                const match = options.find((opt: any) => opt.label === solutionLabel);
                if (match) content.correct_answer = match.id;
            }
        } else {
            if (!Array.isArray(content.correct_answers) || !content.correct_answers.length) {
                const solutionLabels: string[] = Array.isArray(content.solution)
                    ? content.solution.map(String)
                    : [];
                if (solutionLabels.length) {
                    content.correct_answers = options
                        .filter((opt: any) => solutionLabels.includes(String(opt.label)))
                        .map((opt: any) => opt.id);
                }
            }
        }

        return { ...question, content };
    }

    if (question.type === "ordering") {
        const rawItems = Array.isArray(content.items) ? content.items
            : Array.isArray(content.options) ? content.options
            : [];
        const items = rawItems.map((item: any, index: number) => ({
            ...item,
            id: item.id || deterministicId(question.id, "item", item.label ?? index),
        }));
        content.items = items;

        if (!Array.isArray(content.correct_order) || !content.correct_order.length) {
            const solutionLabels: string[] = Array.isArray(content.solution)
                ? content.solution.map(String)
                : [];
            if (solutionLabels.length) {
                content.correct_order = solutionLabels
                    .map((label) => items.find((item: any) => String(item.label) === label)?.id)
                    .filter(Boolean);
            }
        }

        return { ...question, content };
    }

    if (question.type === "matching") {
        let rawLeft = Array.isArray(content.left_items) ? content.left_items : [];
        let rawRight = Array.isArray(content.right_items) ? content.right_items : [];

        // Backend sends all items in flat `options` array — split by label convention
        // (numeric label = right side, alphabetic label = left side)
        if (!rawLeft.length && !rawRight.length && Array.isArray(content.options)) {
            for (const opt of content.options) {
                if (/^\d+$/.test(String(opt.label ?? ""))) rawRight.push(opt);
                else rawLeft.push(opt);
            }
        }
        const leftItems = rawLeft.map((item: any, index: number) => ({ ...item, id: item.id || deterministicId(question.id, "left", item.label ?? index) }));
        const rightItems = rawRight.map((item: any, index: number) => ({ ...item, id: item.id || deterministicId(question.id, "right", item.label ?? index) }));
        content.left_items = leftItems;
        content.right_items = rightItems;

        if (!Array.isArray(content.correct_pairs) || !content.correct_pairs.length) {
            const solution: any[] = Array.isArray(content.solution) ? content.solution : [];
            if (solution.length) {
                content.correct_pairs = solution
                    .map((pair: any) => {
                        const leftLabel = String(pair.left ?? pair[0] ?? "");
                        const rightLabel = String(pair.right ?? pair[1] ?? "");
                        const left = leftItems.find((i: any) => String(i.label) === leftLabel);
                        const right = rightItems.find((i: any) => String(i.label) === rightLabel);
                        return left && right ? [left.id, right.id] : null;
                    })
                    .filter(Boolean);
            }
        }

        return { ...question, content };
    }

    if (question.type === "fill_blank") {
        // Normalise blank markers: DB may use ___ or longer underscores, [ ], ........
        if (typeof content.question === "string") {
            content.question = content.question.replace(/_{3,}|\.{4,}|\[\s*\]/g, "{{blank}}");
        }

        const solution: any[] = Array.isArray(content.solution) ? content.solution : [];
        const rawOptions = Array.isArray(content.options) ? content.options : [];

        // Already normalised (flat array of {id, text} objects) — keep as-is
        const alreadyFlat = rawOptions.length > 0 && rawOptions[0] && typeof rawOptions[0] === "object" && rawOptions[0].id;

        if (alreadyFlat) {
            // Frontend schema already — options is [{id, text}, ...], blanks is [{id, correct_answer}, ...]
            content.options = rawOptions.map((opt: any, index: number) => ({
                ...opt,
                id: opt.id || deterministicId(question.id, "fopt", opt.text || opt.label || index),
                text: opt.text || opt.label || "",
            }));
            const rawBlanks = Array.isArray(content.blanks) ? content.blanks : [];
            content.blanks = rawBlanks.map((blank: any, index: number) => ({
                ...blank,
                id: blank.id || deterministicId(question.id, "blank", index),
            }));
        } else {
            // DB schema — options is array-of-arrays (per-blank choices) or empty, solution has answers
            // Flatten all option strings into unique {id, text} objects
            const optMap = new Map<string, string>(); // text → id
            const flatOptions: { id: string; text: string }[] = [];
            const addOpt = (text: string) => {
                if (!text) return;
                if (!optMap.has(text)) {
                    const id = deterministicId(question.id, "fopt", text);
                    optMap.set(text, id);
                    flatOptions.push({ id, text });
                }
            };

            // Add solution answers as options first
            for (const sol of solution) {
                addOpt(String(sol?.answer ?? sol ?? ""));
            }
            // Add per-blank choice options (array of arrays)
            if (rawOptions.length > 0 && Array.isArray(rawOptions[0])) {
                for (const perBlankOpts of rawOptions as string[][]) {
                    if (Array.isArray(perBlankOpts)) {
                        for (const optText of perBlankOpts) {
                            addOpt(String(optText));
                        }
                    }
                }
            }

            content.options = flatOptions;

            // Build blanks from solution, matching correct_answer to option id
            content.blanks = solution.map((sol: any, solIndex: number) => {
                const answerText = String(sol?.answer ?? sol ?? "");
                const matchId = optMap.get(answerText) || "";
                return { id: deterministicId(question.id, "blank", solIndex), correct_answer: matchId };
            });
        }

        return { ...question, content };
    }

    if (question.type === "short_answer") {
        if (!Array.isArray(content.correct_answers) || !content.correct_answers.length) {
            const solution = content.solution;
            if (solution != null) {
                content.correct_answers = [String(solution)];
            }
        }
        return { ...question, content };
    }

    if (question.type === "true_false") {
        if (content.correct_answer === undefined && content.solution != null) {
            content.correct_answer = content.solution === true || content.solution === "true" || content.solution === "V";
        }
        return { ...question, content };
    }

    return question;
}

/**
 * Smart conversion between question types.
 * Preserves question text, options, and answer data wherever possible.
 * Returns null if no smart conversion is available (falls back to template).
 */
export function convertQuestionContent(
    fromType: QuizQuestionType,
    toType: QuizQuestionType,
    content: Record<string, any>,
): Record<string, any> | null {
    const question = content.question || "Nova pergunta";
    const imageUrl = content.image_url || null;
    const tip = content.tip || null;

    // ── Helpers ──
    // Extract a flat list of { id, text } options from any source
    const getOptions = (): { id: string; text: string }[] => {
        if (Array.isArray(content.options) && content.options.length > 0) {
            // MC / MR / fill_blank options
            return content.options.map((o: any) =>
                typeof o === "string"
                    ? { id: crypto.randomUUID(), text: o }
                    : { id: o.id || crypto.randomUUID(), text: o.text || o.label || String(o) },
            );
        }
        if (Array.isArray(content.left_items)) {
            // matching → use left items as options
            return content.left_items.map((it: any) => ({
                id: it.id || crypto.randomUUID(),
                text: it.text || String(it),
            }));
        }
        if (Array.isArray(content.items)) {
            // ordering → items as options
            return content.items.map((it: any) => ({
                id: it.id || crypto.randomUUID(),
                text: it.text || String(it),
            }));
        }
        if (Array.isArray(content.correct_answers) && content.correct_answers.length > 0) {
            // short_answer → answers as options
            return content.correct_answers
                .filter((a: any) => a && String(a).trim())
                .map((a: any) => ({ id: crypto.randomUUID(), text: String(a) }));
        }
        return [];
    };

    const opts = getOptions();

    // ── MC ↔ MR (existing logic, enhanced) ──
    if (fromType === "multiple_choice" && toType === "multiple_response") {
        const sol = content.solution || content.correct_answer || null;
        const ca = content.correct_answer || content.solution || null;
        return {
            ...content,
            solution: sol ? [sol] : [],
            correct_answers: ca ? [ca] : [],
            correct_answer: null,
        };
    }
    if (fromType === "multiple_response" && toType === "multiple_choice") {
        const solArr = Array.isArray(content.solution) ? content.solution : [];
        const caArr = Array.isArray(content.correct_answers) ? content.correct_answers : [];
        return {
            ...content,
            solution: solArr[0] ?? null,
            correct_answer: caArr[0] ?? solArr[0] ?? null,
            correct_answers: null,
        };
    }

    // ── To multiple_choice ──
    if (toType === "multiple_choice") {
        const newOpts =
            opts.length >= 2
                ? opts.map((o) => ({ id: o.id, text: o.text, image_url: null }))
                : [
                      { id: crypto.randomUUID(), text: "Opção A", image_url: null },
                      { id: crypto.randomUUID(), text: "Opção B", image_url: null },
                  ];
        return {
            question,
            image_url: imageUrl,
            options: newOpts,
            correct_answer: null,
            tip,
        };
    }

    // ── To multiple_response ──
    if (toType === "multiple_response") {
        const newOpts =
            opts.length >= 2
                ? opts.map((o) => ({ id: o.id, text: o.text }))
                : [
                      { id: crypto.randomUUID(), text: "Opção A" },
                      { id: crypto.randomUUID(), text: "Opção B" },
                      { id: crypto.randomUUID(), text: "Opção C" },
                  ];
        return {
            question,
            image_url: imageUrl,
            options: newOpts,
            correct_answers: [],
            tip,
        };
    }

    // ── To true_false ──
    if (toType === "true_false") {
        return {
            question,
            image_url: imageUrl,
            correct_answer: true,
            tip,
        };
    }

    // ── To short_answer ──
    if (toType === "short_answer") {
        // Use first option text or correct answer as seed
        const seed =
            opts.length > 0
                ? opts.map((o) => o.text)
                : content.correct_answer
                    ? [String(content.correct_answer)]
                    : [""];
        return {
            question,
            image_url: imageUrl,
            correct_answers: seed.slice(0, 3),
            case_sensitive: false,
            tip,
        };
    }

    // ── To ordering ──
    if (toType === "ordering") {
        const items =
            opts.length >= 2
                ? opts.map((o) => ({ id: o.id, text: o.text }))
                : [
                      { id: crypto.randomUUID(), text: "Item 1" },
                      { id: crypto.randomUUID(), text: "Item 2" },
                      { id: crypto.randomUUID(), text: "Item 3" },
                  ];
        return {
            question: question.replace(/\{\{blank\}\}/g, "______"),
            image_url: imageUrl,
            items,
            correct_order: [],
            tip,
        };
    }

    // ── To matching ──
    if (toType === "matching") {
        // Try to use pairs of options as left/right
        const leftItems =
            opts.length >= 2
                ? opts.slice(0, Math.ceil(opts.length / 2)).map((o) => ({
                      id: crypto.randomUUID(),
                      text: o.text,
                  }))
                : [
                      { id: crypto.randomUUID(), text: "Item A" },
                      { id: crypto.randomUUID(), text: "Item B" },
                  ];
        const rightItems =
            opts.length >= 4
                ? opts.slice(Math.ceil(opts.length / 2)).map((o) => ({
                      id: crypto.randomUUID(),
                      text: o.text,
                  }))
                : [
                      { id: crypto.randomUUID(), text: "Correspondência A" },
                      { id: crypto.randomUUID(), text: "Correspondência B" },
                  ];
        // If source was matching, preserve original items
        if (fromType === "matching" && content.left_items && content.right_items) {
            return {
                question,
                image_url: imageUrl,
                left_items: content.left_items,
                right_items: content.right_items,
                correct_pairs: content.correct_pairs || [],
                tip,
            };
        }
        return {
            question: question.replace(/\{\{blank\}\}/g, "______"),
            image_url: imageUrl,
            left_items: leftItems,
            right_items: rightItems,
            correct_pairs: [],
            tip,
        };
    }

    // ── To fill_blank ──
    if (toType === "fill_blank") {
        // If question already has blank markers, preserve them
        const hasBlank = /\{\{blank\}\}/.test(question);
        let fbQuestion = question;
        const fbOptions: { id: string; text: string }[] = [];
        const fbBlanks: { id: string; correct_answer: string }[] = [];

        if (hasBlank) {
            // Already has blanks, use existing options
            fbOptions.push(...opts);
            const blankCount = (fbQuestion.match(/\{\{blank\}\}/g) || []).length;
            for (let i = 0; i < blankCount; i++) {
                fbBlanks.push({ id: crypto.randomUUID(), correct_answer: opts[i]?.id || "" });
            }
        } else if (opts.length > 0) {
            // No blanks yet — create a blank from the first option text if it appears in the question
            const firstOpt = opts[0];
            if (question.includes(firstOpt.text)) {
                fbQuestion = question.replace(firstOpt.text, "{{blank}}");
                const optId = crypto.randomUUID();
                fbOptions.push({ id: optId, text: firstOpt.text });
                opts.slice(1).forEach((o) => fbOptions.push({ id: crypto.randomUUID(), text: o.text }));
                fbBlanks.push({ id: crypto.randomUUID(), correct_answer: optId });
            } else {
                // Can't auto-create blank from options, just provide the options
                fbQuestion = question + " {{blank}}";
                opts.forEach((o) => fbOptions.push({ id: crypto.randomUUID(), text: o.text }));
                fbBlanks.push({ id: crypto.randomUUID(), correct_answer: "" });
            }
        } else {
            // No options at all — create a placeholder blank
            fbQuestion = question + " {{blank}}";
            fbOptions.push(
                { id: crypto.randomUUID(), text: "Opção 1" },
                { id: crypto.randomUUID(), text: "Opção 2" },
            );
            fbBlanks.push({ id: crypto.randomUUID(), correct_answer: "" });
        }

        return {
            question: fbQuestion,
            image_url: imageUrl,
            options: fbOptions,
            blanks: fbBlanks,
            tip,
        };
    }

    // No smart conversion found
    return null;
}

export function createQuestionTemplate(type: QuizQuestionType): Record<string, any> {
    if (type === "multiple_choice") {
        return {
            question: "Nova pergunta",
            image_url: null,
            options: [
                { id: crypto.randomUUID(), text: "Opção A", image_url: null },
                { id: crypto.randomUUID(), text: "Opção B", image_url: null },
            ],
            correct_answer: null,
            tip: null,
        };
    }
    if (type === "true_false") {
        return {
            question: "Nova pergunta",
            image_url: null,
            correct_answer: true,
            tip: null,
        };
    }
    if (type === "fill_blank") {
        const optId = crypto.randomUUID();
        const blankId = crypto.randomUUID();
        return {
            question: "A {{blank}} é a capital de Portugal.",
            image_url: null,
            options: [
                { id: optId, text: "Lisboa" },
                { id: crypto.randomUUID(), text: "Porto" },
            ],
            blanks: [{ id: blankId, correct_answer: optId }],
            tip: null,
        };
    }
    if (type === "matching") {
        return {
            question: "Liga os elementos:",
            image_url: null,
            left_items: [
                { id: crypto.randomUUID(), text: "Item A" },
                { id: crypto.randomUUID(), text: "Item B" },
            ],
            right_items: [
                { id: crypto.randomUUID(), text: "Correspondência A" },
                { id: crypto.randomUUID(), text: "Correspondência B" },
            ],
            correct_pairs: [],
            tip: null,
        };
    }
    if (type === "short_answer") {
        return {
            question: "Resposta curta",
            image_url: null,
            correct_answers: [""],
            case_sensitive: false,
            tip: null,
        };
    }
    if (type === "multiple_response") {
        return {
            question: "Seleciona todas as corretas:",
            image_url: null,
            options: [
                { id: crypto.randomUUID(), text: "Opção A" },
                { id: crypto.randomUUID(), text: "Opção B" },
                { id: crypto.randomUUID(), text: "Opção C" },
            ],
            correct_answers: [],
            tip: null,
        };
    }
    return {
        question: "Ordena os itens:",
        image_url: null,
        items: [
            { id: crypto.randomUUID(), text: "Item 1" },
            { id: crypto.randomUUID(), text: "Item 2" },
            { id: crypto.randomUUID(), text: "Item 3" },
        ],
        correct_order: [],
        tip: null,
    };
}

/**
 * Convert a streaming question (label-based schema from SSE) into a
 * QuizQuestion shape suitable for `normalizeQuestionForEditor()`.
 */
export function streamQuestionToQuizQuestion(sq: QuizStreamQuestion): QuizQuestion {
    return {
        id: sq.id,
        organization_id: "",
        created_by: "",
        type: sq.type as QuizQuestionType,
        content: sq.content,
        subject_id: null,
        year_level: null,
        subject_component: null,
        curriculum_codes: null,
        is_public: false,
        created_at: null,
        updated_at: null,
    };
}

export async function fetchQuizQuestions(filters?: {
    ids?: string[];
    type?: QuizQuestionType;
    subject_id?: string;
    year_level?: string;
    subject_component?: string;
    curriculum_code?: string;
}): Promise<QuizQuestion[]> {
    const params = new URLSearchParams();
    if (filters?.ids?.length) params.set("ids", filters.ids.join(","));
    if (filters?.type) params.set("type", filters.type);
    if (filters?.subject_id) params.set("subject_id", filters.subject_id);
    if (filters?.year_level) params.set("year_level", filters.year_level);
    if (filters?.subject_component) params.set("subject_component", filters.subject_component);
    if (filters?.curriculum_code) params.set("curriculum_code", filters.curriculum_code);

    const res = await fetch(`/api/quiz-questions?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch quiz questions: ${res.status}`);
    return res.json();
}

export async function fetchQuizQuestion(id: string): Promise<QuizQuestion> {
    const res = await fetch(`/api/quiz-questions/${id}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch quiz question: ${res.status}`);
    return res.json();
}

export async function createQuizQuestion(
    payload: QuizQuestionCreateInput,
): Promise<QuizQuestion> {
    const res = await fetch("/api/quiz-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to create quiz question: ${res.status}`);
    return res.json();
}

export async function updateQuizQuestion(
    questionId: string,
    payload: QuizQuestionUpdateInput,
): Promise<QuizQuestion> {
    const res = await fetch(`/api/quiz-questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to update quiz question: ${res.status}`);
    return res.json();
}

export async function deleteQuizQuestion(questionId: string): Promise<QuizQuestion> {
    const res = await fetch(`/api/quiz-questions/${questionId}`, {
        method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete quiz question: ${res.status}`);
    return res.json();
}

export async function uploadQuizImage(file: File): Promise<QuizImageUploadResult> {
    const formData = new FormData();
    formData.append("file", file, file.name);

    const res = await fetch("/api/quiz-images/upload", {
        method: "POST",
        body: formData,
    });
    if (!res.ok) throw new Error(`Failed to upload quiz image: ${res.status}`);
    return res.json();
}


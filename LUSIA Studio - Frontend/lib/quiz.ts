import { Artifact } from "@/lib/artifacts";

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
        const opt1 = crypto.randomUUID();
        const opt2 = crypto.randomUUID();
        const blank1 = crypto.randomUUID();
        return {
            question: "Completa: {{blank}}",
            image_url: null,
            options: [
                { id: opt1, text: "Resposta 1" },
                { id: opt2, text: "Resposta 2" },
            ],
            blanks: [{ id: blank1, correct_answer: opt1 }],
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


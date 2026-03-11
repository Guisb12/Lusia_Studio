/**
 * Session Types (Tipos de Sessao) — shared TypeScript contracts
 */

/* ═══════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════ */

export interface SessionType {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    student_price_per_hour: number;
    teacher_cost_per_hour: number;
    color: string | null;
    icon: string | null;
    is_default: boolean;
    active: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface SessionTypeCreatePayload {
    name: string;
    description?: string;
    student_price_per_hour: number;
    teacher_cost_per_hour: number;
    color?: string;
    icon?: string;
    is_default?: boolean;
}

export interface SessionTypeUpdatePayload {
    name?: string;
    description?: string | null;
    student_price_per_hour?: number;
    teacher_cost_per_hour?: number;
    color?: string | null;
    icon?: string | null;
    is_default?: boolean;
    active?: boolean;
}

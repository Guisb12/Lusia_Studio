/**
 * Recurrence utilities — mirrors the backend generate_recurrence_dates logic.
 * Used for preview count in the form and optimistic UI in CalendarShell.
 */

import {
    addDays,
    addMonths,
    addWeeks,
    addYears,
    format,
    getDaysInMonth,
    getDay,
    setDate,
    startOfMonth,
} from "date-fns";
import { pt } from "date-fns/locale";

export type RecurrenceFreq =
    | "daily"
    | "weekdays"
    | "weekly"
    | "biweekly"
    | "monthly_date"
    | "monthly_weekday"
    | "yearly"
    | "custom";

export interface RecurrenceRule {
    freq: RecurrenceFreq;
    interval?: number;
    days_of_week?: number[]; // 0=Mon..6=Sun
    month_day?: number;
    month_nth?: number;
    month_weekday?: number;
    end_date: string; // "YYYY-MM-DD"
}

export interface RecurrenceInfo {
    rule: RecurrenceRule;
}

const MAX_SESSIONS = 365;

/** Default end date: 3 months from the given anchor date. */
export function defaultEndDate(anchorDate: Date): Date {
    return addMonths(anchorDate, 3);
}

/** Format a date as "YYYY-MM-DD" for rule storage. */
export function toISODateString(d: Date): string {
    return format(d, "yyyy-MM-dd");
}

/**
 * Return { nth, weekday } (0=Mon..6=Sun) describing d's position in its month.
 * E.g. the 2nd Thursday → { nth: 2, weekday: 3 }
 */
export function nthWeekdayInMonth(d: Date): { nth: number; weekday: number } {
    // date-fns getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
    const dayOfWeek = (getDay(d) + 6) % 7;
    const nth = Math.floor((d.getDate() - 1) / 7) + 1;
    return { nth, weekday: dayOfWeek };
}

/**
 * Get the Nth occurrence of a weekday in a given year/month.
 * Returns null if the Nth doesn't exist (e.g. 5th Monday in a month with only 4).
 * weekday: 0=Mon..6=Sun
 */
function getNthWeekdayInMonth(year: number, month: number, nth: number, weekday: number): Date | null {
    // Collect all occurrences of this weekday in the month
    const first = new Date(year, month, 1);
    const daysInMonth = getDaysInMonth(first);
    const occurrences: Date[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
        const candidate = new Date(year, month, d);
        const dow = (getDay(candidate) + 6) % 7; // 0=Mon..6=Sun
        if (dow === weekday) {
            occurrences.push(candidate);
        }
    }
    if (nth > occurrences.length) return null;
    return occurrences[nth - 1];
}

/**
 * Generate all occurrence dates for a recurrence rule, starting from firstDate.
 * Hard cap: MAX_SESSIONS dates.
 */
export function generateRecurrenceDates(rule: RecurrenceRule, firstDate: Date): Date[] {
    const endDate = new Date(rule.end_date + "T00:00:00");
    if (isNaN(endDate.getTime()) || endDate < firstDate) return [];

    const freq = rule.freq;
    const interval = Math.max(1, rule.interval ?? 1);
    const dates: Date[] = [];

    // Helper to normalise a Date to midnight local time
    const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const firstMidnight = midnight(firstDate);
    const endMidnight = midnight(endDate);

    if (freq === "daily") {
        let cursor = firstMidnight;
        while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
            dates.push(new Date(cursor));
            cursor = addDays(cursor, 1);
        }
    } else if (freq === "weekdays") {
        let cursor = firstMidnight;
        while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
            const dow = (getDay(cursor) + 6) % 7; // 0=Mon..6=Sun
            if (dow < 5) dates.push(new Date(cursor)); // Mon–Fri
            cursor = addDays(cursor, 1);
        }
    } else if (freq === "weekly") {
        let cursor = firstMidnight;
        while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
            dates.push(new Date(cursor));
            cursor = addWeeks(cursor, 1);
        }
    } else if (freq === "biweekly") {
        let cursor = firstMidnight;
        while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
            dates.push(new Date(cursor));
            cursor = addWeeks(cursor, 2);
        }
    } else if (freq === "monthly_date") {
        const targetDay = rule.month_day ?? firstMidnight.getDate();
        let year = firstMidnight.getFullYear();
        let month = firstMidnight.getMonth();
        while (dates.length < MAX_SESSIONS) {
            const daysInMonth = getDaysInMonth(new Date(year, month, 1));
            const day = Math.min(targetDay, daysInMonth);
            const candidate = new Date(year, month, day);
            if (candidate < firstMidnight) {
                // Advance month
                month++;
                if (month > 11) { month = 0; year++; }
                continue;
            }
            if (candidate > endMidnight) break;
            dates.push(candidate);
            month++;
            if (month > 11) { month = 0; year++; }
        }
    } else if (freq === "monthly_weekday") {
        const { nth: defaultNth, weekday: defaultWeekday } = nthWeekdayInMonth(firstMidnight);
        const nth = rule.month_nth ?? defaultNth;
        const weekday = rule.month_weekday ?? defaultWeekday;
        let year = firstMidnight.getFullYear();
        let month = firstMidnight.getMonth();
        while (dates.length < MAX_SESSIONS) {
            const candidate = getNthWeekdayInMonth(year, month, nth, weekday);
            if (!candidate || candidate < firstMidnight) {
                month++;
                if (month > 11) { month = 0; year++; }
                continue;
            }
            if (candidate > endMidnight) break;
            dates.push(candidate);
            month++;
            if (month > 11) { month = 0; year++; }
        }
    } else if (freq === "yearly") {
        let cursor = firstMidnight;
        while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
            dates.push(new Date(cursor));
            // Advance by 1 year; handle Feb 29 by trying subsequent years
            const origMonth = cursor.getMonth();
            const origDay = cursor.getDate();
            let nextYear = cursor.getFullYear() + 1;
            let next: Date | null = null;
            for (let attempts = 0; attempts < 10; attempts++) {
                const candidate = new Date(nextYear, origMonth, origDay);
                if (candidate.getMonth() === origMonth && candidate.getDate() === origDay) {
                    next = candidate;
                    break;
                }
                nextYear++;
            }
            if (!next) break;
            cursor = next;
        }
    } else if (freq === "custom") {
        const days_of_week = rule.days_of_week;
        if (days_of_week && days_of_week.length > 0) {
            // Every `interval` weeks on the specified days
            const weekStart = new Date(
                firstMidnight.getFullYear(),
                firstMidnight.getMonth(),
                firstMidnight.getDate() - ((getDay(firstMidnight) + 6) % 7)
            );
            let cursor = firstMidnight;
            while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
                const weeksSinceStart = Math.floor(
                    (cursor.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
                );
                const dow = (getDay(cursor) + 6) % 7;
                if (weeksSinceStart % interval === 0 && days_of_week.includes(dow)) {
                    dates.push(new Date(cursor));
                }
                cursor = addDays(cursor, 1);
            }
        } else {
            // Every `interval` days
            let cursor = firstMidnight;
            while (cursor <= endMidnight && dates.length < MAX_SESSIONS) {
                dates.push(new Date(cursor));
                cursor = addDays(cursor, interval);
            }
        }
    }

    return dates;
}

// ── Human-readable labels ─────────────────────────────────────────────────────

const PT_WEEKDAY_NAMES = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];
const PT_WEEKDAY_NAMES_ABBR = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const PT_NTH_LABELS = ["primeira", "segunda", "terceira", "quarta", "quinta"];

/**
 * Return a short human-readable label for the recurrence rule trigger button.
 * E.g. "Toda semana às terça", "Todo mês no dia 15"
 */
export function formatRecurrenceLabel(rule: RecurrenceRule, firstDate: Date): string {
    const dow = (getDay(firstDate) + 6) % 7;
    const dayName = PT_WEEKDAY_NAMES[dow];
    const dayNum = firstDate.getDate();
    const { nth, weekday } = nthWeekdayInMonth(firstDate);
    const nthLabel = PT_NTH_LABELS[nth - 1] ?? `${nth}ª`;
    const weekdayName = PT_WEEKDAY_NAMES[weekday];

    switch (rule.freq) {
        case "daily":
            return "Todo dia";
        case "weekdays":
            return "Dias úteis (seg–sex)";
        case "weekly":
            return `Toda semana às ${dayName}`;
        case "biweekly":
            return `A cada 2 semanas às ${dayName}`;
        case "monthly_date":
            return `Todo mês no dia ${dayNum}`;
        case "monthly_weekday":
            return `Todo mês na ${nthLabel} ${weekdayName}`;
        case "yearly":
            return `Todo ano em ${format(firstDate, "d 'de' MMM", { locale: pt })}`;
        case "custom": {
            const i = rule.interval ?? 1;
            if (rule.days_of_week && rule.days_of_week.length > 0) {
                const dayAbbrs = rule.days_of_week.map((d) => PT_WEEKDAY_NAMES_ABBR[d]).join(", ");
                return i === 1 ? `Toda semana: ${dayAbbrs}` : `A cada ${i} semanas: ${dayAbbrs}`;
            }
            return `A cada ${i} dia${i > 1 ? "s" : ""}`;
        }
        default:
            return "Personalizado";
    }
}

/**
 * Return the preset label shown inline in the popover list item.
 * This is the secondary text shown after the main label (e.g. "às qui").
 */
export function formatRecurrencePresetHint(rule: RecurrenceRule, firstDate: Date): string {
    const dow = (getDay(firstDate) + 6) % 7;
    const dayAbbr = PT_WEEKDAY_NAMES_ABBR[dow];
    const dayNum = firstDate.getDate();
    const { nth, weekday } = nthWeekdayInMonth(firstDate);
    const nthLabel = PT_NTH_LABELS[nth - 1] ?? `${nth}ª`;
    const weekdayAbbr = PT_WEEKDAY_NAMES_ABBR[weekday];

    switch (rule.freq) {
        case "weekdays":
            return "seg – sex";
        case "weekly":
            return `às ${dayAbbr}`;
        case "biweekly":
            return `às ${dayAbbr}`;
        case "monthly_date":
            return `no dia ${dayNum}`;
        case "monthly_weekday":
            return `na ${nthLabel} ${weekdayAbbr}`;
        case "yearly":
            return `em ${format(firstDate, "d 'de' MMM", { locale: pt })}`;
        default:
            return "";
    }
}

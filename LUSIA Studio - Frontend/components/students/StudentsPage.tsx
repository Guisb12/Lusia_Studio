"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, ChevronRight, Users, ListFilter, CircleX, ChevronDown, UserPlus, UserMinus, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import {
    fetchMembers,
    fetchMember,
    type Member,
    type PaginatedMembers,
} from "@/lib/members";
import {
    addClassMembers,
    removeClassMembers,
    fetchClasses,
    fetchClassMembers,
    hydrateTeacherNames,
    type Classroom,
    type ClassMember,
    type PaginatedClassrooms,
} from "@/lib/classes";
import { StudentDetailCard } from "./StudentDetailCard";
import { TeacherDetailCard } from "./TeacherDetailCard";
import { ClassesGallery } from "./ClassesGallery";
import { AdminClassesView } from "./AdminClassesView";
import { ManageClassDialog } from "./ManageClassDialog";
import { CreateClassDialog } from "@/components/classes/CreateClassDialog";
import type { StudentInfo } from "@/components/calendar/StudentHoverCard";
import dynamic from "next/dynamic";

const ClassesOnboarding = dynamic(
    () => import("@/components/classes/ClassesOnboarding").then((m) => ({ default: m.ClassesOnboarding })),
    { ssr: false },
);
import { useUser } from "@/components/providers/UserProvider";
import { usePrimaryClass } from "@/lib/hooks/usePrimaryClass";
import { useSubjects } from "@/lib/hooks/useSubjects";
import { cachedFetch, cacheGet, cacheInvalidate } from "@/lib/cache";
import { toast } from "sonner";

type AdminMode = "centro" | "eu" | "turmas";

interface StudentsPageProps {
    initialMembers?: PaginatedMembers;
    initialClasses?: PaginatedClassrooms;
    memberRole?: "student" | "teacher";
}

function getInitials(name: string | null): string {
    if (!name) return "?";
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

function extractGrade(gradeLevel: string | null): string | null {
    if (!gradeLevel) return null;
    const match = gradeLevel.match(/(\d+)/);
    return match ? match[1] : null;
}

// ─── Pills ──────────────────────────────────────────────────

const COURSE_COLORS: Record<string, string> = {
    "Ciências e Tecnologias": "#2563eb",
    "Ciencias e Tecnologias": "#2563eb",
    "Ciências Socioeconómicas": "#ea580c",
    "Ciencias Socioeconomicas": "#ea580c",
    "Línguas e Humanidades": "#059669",
    "Linguas e Humanidades": "#059669",
    "Artes Visuais": "#7c3aed",
};

function CoursePill({ course }: { course: string }) {
    const c = COURSE_COLORS[course] ?? "#6B7280";
    return (
        <span
            style={{ color: c, backgroundColor: c + "18", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-[140px]"
        >
            <span className="truncate">{course}</span>
        </span>
    );
}

function GradePill({ grade }: { grade: string }) {
    return (
        <span
            style={{ color: "#4B5563", backgroundColor: "#F3F4F6", border: "1.5px solid #9CA3AF", borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none tabular-nums select-none"
        >
            {grade}º
        </span>
    );
}

function SubjectPill({ name }: { name: string }) {
    const c = "#0d2f7f";
    return (
        <span
            style={{ color: c, backgroundColor: c + "12", border: `1.5px solid ${c}`, borderBottomWidth: "3px" }}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none max-w-[120px]"
        >
            <span className="truncate">{name}</span>
        </span>
    );
}

// ──────────────────────────────────────────────────────────────────────────────

export function StudentsPage({
    initialMembers,
    initialClasses,
    memberRole = "student",
}: StudentsPageProps) {
    const { user } = useUser();
    const { primaryClass, primaryClassId, loading: primaryClassLoading, refetch: refetchPrimaryClass } = usePrimaryClass();
    const { subjects } = useSubjects({ includeCustom: true });
    const isAdmin = user?.role === "admin";

    const hasInitialData = initialMembers !== undefined;
    const [allStudents, setAllStudents] = useState<Member[]>(initialMembers?.data ?? []);
    const [allStudentsTotal, setAllStudentsTotal] = useState(initialMembers?.total ?? 0);
    const [loading, setLoading] = useState(!hasInitialData);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Admin 3-mode toggle
    const [adminMode, setAdminMode] = useState<AdminMode>("centro");

    // Classes state
    const [classes, setClasses] = useState<Classroom[]>(initialClasses?.data ?? []);
    const [classesLoading, setClassesLoading] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [teacherNames, setTeacherNames] = useState<Record<string, string>>({});
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
    const [classMembersCache, setClassMembersCache] = useState<Record<string, ClassMember[]>>({});
    const [createClassOpen, setCreateClassOpen] = useState(false);

    // "Ver todos" expansion
    const [orgStudents, setOrgStudents] = useState<Member[]>([]);
    const [showAllExpanded, setShowAllExpanded] = useState(false);
    const [loadingAll, setLoadingAll] = useState(false);

    // "Add to my students" dialog
    const [addDialogMember, setAddDialogMember] = useState<Member | null>(null);
    const [addingMember, setAddingMember] = useState(false);

    // Manage class dialog
    const [manageClassOpen, setManageClassOpen] = useState(false);
    const [manageClassId, setManageClassId] = useState<string | null>(null);

    // Removing student from class (tracks member id being removed for loading state)
    const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

    const isTeacherPage = memberRole === "teacher";
    const isStudentPage = memberRole === "student";
    const pageTitle = isTeacherPage ? "Professores" : "Alunos";
    const EmptyIcon = isTeacherPage ? Users : GraduationCap;

    const pageSubtitle = isTeacherPage
        ? "Gere e acompanha os professores da tua organização."
        : isAdmin
            ? adminMode === "centro"
                ? "Todos os alunos do centro."
                : adminMode === "turmas"
                    ? "Turmas de todos os professores do centro."
                    : "Os teus alunos e turmas."
            : "Os teus alunos.";

    const showGallery = isStudentPage && !isTeacherPage && (
        (!isAdmin) || (isAdmin && adminMode === "eu")
    );
    const showTurmasView = isAdmin && isStudentPage && adminMode === "turmas";

    const selectedClass = classes.find((c) => c.id === selectedClassId);
    const isNonPrimarySelected = selectedClass && !selectedClass.is_primary;

    // Whether the base view (no class selected) is scoped by primary class
    const isBaseViewPrimary = isStudentPage && !isTeacherPage && !(isAdmin && adminMode === "centro") && !showTurmasView && !!primaryClassId;

    // The class being managed in the dialog
    const managedClass = classes.find((c) => c.id === manageClassId) ?? null;

    // ── Load base students ────────────────────────────────────

    const loadBaseStudents = useCallback(async () => {
        try {
            const roleParam = isTeacherPage ? "admin,teacher" : memberRole;
            const classId = (isTeacherPage || (isAdmin && adminMode === "centro"))
                ? undefined
                : primaryClassId ?? undefined;
            const cacheKey = `members:${roleParam}:active:${classId ?? "all"}`;
            if (!cacheGet(cacheKey)) setLoading(true);
            const data = await cachedFetch(cacheKey, () => fetchMembers(roleParam, "active", 1, 100, classId), 30_000);
            setAllStudents(data.data);
            setAllStudentsTotal(data.total);
        } catch (e) {
            console.error("Failed to fetch members:", e);
        } finally {
            setLoading(false);
        }
    }, [memberRole, isTeacherPage, isAdmin, adminMode, primaryClassId]);

    const loadOrgStudents = useCallback(async () => {
        try {
            const cacheKey = "members:student:active:all";
            if (!cacheGet(cacheKey)) setLoadingAll(true);
            const data = await cachedFetch(cacheKey, () => fetchMembers("student", "active", 1, 100), 30_000);
            setOrgStudents(data.data);
            setShowAllExpanded(true);
        } catch (e) {
            console.error("Failed to fetch all members:", e);
        } finally {
            setLoadingAll(false);
        }
    }, []);

    // Refetch base students when mode changes
    const initialViewRef = useRef(true);
    useEffect(() => {
        if (showTurmasView) return;
        if (initialViewRef.current && hasInitialData) {
            initialViewRef.current = false;
            return;
        }
        initialViewRef.current = false;
        if (isStudentPage && !isAdmin && primaryClassLoading) return;
        setShowAllExpanded(false);
        // Don't clear allStudents/orgStudents — let new data replace them to avoid flash
        setSelectedClassId(null);
        loadBaseStudents();
    }, [loadBaseStudents, hasInitialData, isStudentPage, isAdmin, primaryClassLoading, showTurmasView]);

    // ── Load Classes ─────────────────────────────────────────

    const loadClasses = useCallback(async () => {
        if (isTeacherPage) return;
        const classesKey = (isAdmin && adminMode === "turmas") ? "classes:all" : "classes:own:active";
        if (!cacheGet(classesKey)) setClassesLoading(true);
        try {
            const data = await cachedFetch(classesKey, () =>
                (isAdmin && adminMode === "turmas")
                    ? fetchClasses(undefined, 1, 100)
                    : fetchClasses(true, 1, 50, true),
                60_000,
            );
            setClasses(data.data);

            if (data.data.length > 0) {
                try {
                    const names = await hydrateTeacherNames(data.data);
                    setTeacherNames(names);
                } catch { /* best-effort */ }
            }

            // Load members per class (full ClassMember[] for dialog + filtering)
            const counts: Record<string, number> = {};
            const membersMap: Record<string, ClassMember[]> = {};
            await Promise.all(
                data.data.map(async (c) => {
                    try {
                        const members = await cachedFetch(
                            `class-members:${c.id}`,
                            () => fetchClassMembers(c.id),
                            60_000,
                        );
                        counts[c.id] = members.length;
                        membersMap[c.id] = members;
                    } catch {
                        counts[c.id] = 0;
                        membersMap[c.id] = [];
                    }
                }),
            );
            setMemberCounts(counts);
            setClassMembersCache(membersMap);
        } catch (e) {
            console.error("Failed to fetch classes:", e);
        } finally {
            setClassesLoading(false);
        }
    }, [isTeacherPage, isAdmin, adminMode]);

    useEffect(() => {
        if (!isStudentPage) return;
        if (isAdmin && adminMode === "centro") return;
        if (!isAdmin && primaryClassLoading) return;
        loadClasses();
    }, [isStudentPage, isAdmin, adminMode, primaryClassLoading, loadClasses]);

    // ── Client-side filtering ─────────────────────────────────

    const filteredMembers = useMemo(() => {
        let list = allStudents;

        if (isNonPrimarySelected && selectedClassId && classMembersCache[selectedClassId]) {
            const classStudentIds = new Set(classMembersCache[selectedClassId].map((m) => m.id));
            list = list.filter((m) => classStudentIds.has(m.id));
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            list = list.filter(
                (m) =>
                    m.full_name?.toLowerCase().includes(q) ||
                    m.display_name?.toLowerCase().includes(q) ||
                    m.email?.toLowerCase().includes(q),
            );
        }
        return list;
    }, [allStudents, searchQuery, isNonPrimarySelected, selectedClassId, classMembersCache]);

    const total = isNonPrimarySelected && selectedClassId && classMembersCache[selectedClassId]
        ? classMembersCache[selectedClassId].length
        : allStudentsTotal;

    // Extra students from org (not in primary class)
    const primaryIds = useMemo(() => new Set(allStudents.map((m) => m.id)), [allStudents]);
    const extraMembers = useMemo(() => {
        if (!showAllExpanded) return [];
        let extras = orgStudents.filter((m) => !primaryIds.has(m.id));
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            extras = extras.filter(
                (m) =>
                    m.full_name?.toLowerCase().includes(q) ||
                    m.display_name?.toLowerCase().includes(q) ||
                    m.email?.toLowerCase().includes(q),
            );
        }
        return extras;
    }, [showAllExpanded, orgStudents, primaryIds, searchQuery]);

    const searchNoLocalResults = searchQuery.trim() && filteredMembers.length === 0 && isBaseViewPrimary && !isNonPrimarySelected;

    const selectedMember = [...allStudents, ...orgStudents].find((m) => m.id === selectedId);

    // ── Mode change ──────────────────────────────────────────

    const handleAdminModeChange = (mode: AdminMode) => {
        setAdminMode(mode);
        setSelectedClassId(null);
        setSelectedId(null);
        setSearchQuery("");
        setShowAllExpanded(false);
        // Don't clear allStudents, orgStudents, classes, classMembersCache
        // Let the new fetch replace them — avoids flash during transition
    };

    // ── Class Click ──────────────────────────────────────────

    const handleClassClick = useCallback((classroom: Classroom) => {
        if (showTurmasView) {
            setAdminMode("eu");
            setSelectedClassId(classroom.id);
            setSelectedId(null);
            return;
        }
        setSelectedClassId((prev) => prev === classroom.id ? null : classroom.id);
        setSelectedId(null);
    }, [showTurmasView]);

    // ── Student Click ────────────────────────────────────────

    const handleStudentClick = (member: Member, isExtra: boolean) => {
        if (isExtra && primaryClassId) {
            setAddDialogMember(member);
        } else {
            setSelectedId(selectedId === member.id ? null : member.id);
        }
    };

    // ── Add to primary class (from "ver todos" expansion) ──

    const handleAddToMyStudents = async () => {
        if (!addDialogMember || !primaryClassId) return;
        setAddingMember(true);
        try {
            await addClassMembers(primaryClassId, [addDialogMember.id]);
            setAllStudents((prev) => [...prev, addDialogMember]);
            setAllStudentsTotal((prev) => prev + 1);
            setClassMembersCache((prev) => {
                const next = { ...prev };
                if (next[primaryClassId]) {
                    const existing = next[primaryClassId];
                    if (!existing.some((m) => m.id === addDialogMember.id)) {
                        next[primaryClassId] = [...existing, {
                            id: addDialogMember.id,
                            full_name: addDialogMember.full_name,
                            display_name: addDialogMember.display_name,
                            avatar_url: addDialogMember.avatar_url,
                            grade_level: addDialogMember.grade_level,
                            course: addDialogMember.course,
                            subject_ids: addDialogMember.subject_ids,
                        }];
                    }
                }
                return next;
            });
            setMemberCounts((prev) => ({
                ...prev,
                [primaryClassId]: (prev[primaryClassId] ?? 0) + 1,
            }));
            cacheInvalidate(`class-members:${primaryClassId}`);
            cacheInvalidate("members:");
            toast.success(`${addDialogMember.display_name || addDialogMember.full_name} adicionado aos teus alunos.`);
            setAddDialogMember(null);
            setSelectedId(addDialogMember.id);
        } catch {
            toast.error("Não foi possível adicionar o aluno.");
        } finally {
            setAddingMember(false);
        }
    };

    // ── Class Created ────────────────────────────────────────

    const handleClassCreated = useCallback(() => {
        setCreateClassOpen(false);
        cacheInvalidate("classes:");
        loadClasses();
        refetchPrimaryClass();
    }, [loadClasses, refetchPrimaryClass]);

    // ── Manage class dialog: derive members from existing data ──

    const managedClassMembers = useMemo((): Member[] => {
        if (!manageClassId || !classMembersCache[manageClassId]) return [];
        const classMembers = classMembersCache[manageClassId];
        const knownMap = new Map([...allStudents, ...orgStudents].map((m) => [m.id, m]));
        return classMembers.map((cm) => {
            // Prefer full Member if available, otherwise upcast ClassMember
            const full = knownMap.get(cm.id);
            if (full) return full;
            return {
                id: cm.id, full_name: cm.full_name, display_name: cm.display_name,
                avatar_url: cm.avatar_url, grade_level: cm.grade_level, course: cm.course,
                subject_ids: cm.subject_ids, email: null, role: "student" as const,
                status: "active" as const, school_name: null, phone: null,
                subjects_taught: null, class_ids: null, parent_name: null,
                parent_email: null, parent_phone: null, hourly_rate: null,
                onboarding_completed: false, created_at: null,
            };
        });
    }, [manageClassId, classMembersCache, allStudents, orgStudents]);

    const managedClassMemberIds = useMemo(() => {
        if (!manageClassId || !classMembersCache[manageClassId]) return new Set<string>();
        return new Set(classMembersCache[manageClassId].map((m) => m.id));
    }, [manageClassId, classMembersCache]);

    // ── Manage class dialog callbacks (optimistic) ───────────

    const handleManageAddMembers = useCallback((classId: string, students: StudentInfo[]) => {
        // Optimistic: update cache + counts
        setClassMembersCache((prev) => {
            const next = { ...prev };
            const existing = next[classId] ?? [];
            const existingIds = new Set(existing.map((m) => m.id));
            const newMembers: ClassMember[] = students
                .filter((s) => !existingIds.has(s.id))
                .map((s) => ({
                    id: s.id,
                    full_name: s.full_name ?? null,
                    display_name: s.display_name ?? null,
                    avatar_url: s.avatar_url ?? null,
                    grade_level: s.grade_level ?? null,
                    course: s.course ?? null,
                    subject_ids: s.subject_ids ?? null,
                }));
            next[classId] = [...existing, ...newMembers];
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: (prev[classId] ?? 0) + students.length,
        }));
        // If adding to primary class, also add to allStudents
        if (classId === primaryClassId) {
            setAllStudents((prev) => {
                const existingIds = new Set(prev.map((m) => m.id));
                const toAdd = students
                    .filter((s) => !existingIds.has(s.id))
                    .map((s): Member => ({
                        id: s.id,
                        full_name: s.full_name ?? null,
                        display_name: s.display_name ?? null,
                        avatar_url: s.avatar_url ?? null,
                        grade_level: s.grade_level ?? null,
                        course: s.course ?? null,
                        email: null, role: "student", status: "active",
                        school_name: null, phone: null, subjects_taught: null,
                        subject_ids: s.subject_ids ?? null, class_ids: null,
                        parent_name: null, parent_email: null, parent_phone: null,
                        hourly_rate: null, onboarding_completed: false, created_at: null,
                    }));
                return toAdd.length > 0 ? [...prev, ...toAdd] : prev;
            });
            setAllStudentsTotal((prev) => prev + students.length);
            // Background: hydrate full Member objects for StudentDetailCard
            Promise.all(
                students.map((s) => fetchMember(s.id).catch(() => null)),
            ).then((results) => {
                const valid = results.filter(Boolean) as Member[];
                if (valid.length === 0) return;
                const map = new Map(valid.map((m) => [m.id, m]));
                setAllStudents((prev) => prev.map((m) => map.get(m.id) ?? m));
            });
        }
    }, [primaryClassId]);

    const handleManageRemoveMember = useCallback((classId: string, memberId: string) => {
        // Optimistic: remove from cache + update count
        setClassMembersCache((prev) => {
            const next = { ...prev };
            if (next[classId]) {
                next[classId] = next[classId].filter((m) => m.id !== memberId);
            }
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: Math.max(0, (prev[classId] ?? 0) - 1),
        }));
    }, []);

    const handleManageClassRenamed = useCallback((classId: string, updated: Classroom) => {
        setClasses((prev) => prev.map((c) => c.id === classId ? updated : c));
    }, []);

    const handleManageClassDeleted = useCallback((classId: string) => {
        if (selectedClassId === classId) {
            setSelectedClassId(null);
            setSelectedId(null);
        }
        setClasses((prev) => prev.filter((c) => c.id !== classId));
        setClassMembersCache((prev) => {
            const next = { ...prev };
            delete next[classId];
            return next;
        });
        setMemberCounts((prev) => {
            const next = { ...prev };
            delete next[classId];
            return next;
        });
        cacheInvalidate("classes:");
        cacheInvalidate(`class-members:${classId}`);
    }, [selectedClassId]);

    // ── Rollback handlers for ManageClassDialog ─────────────

    const handleManageAddMembersRollback = useCallback((classId: string, studentIds: string[]) => {
        const idsToRemove = new Set(studentIds);
        setClassMembersCache((prev) => {
            const next = { ...prev };
            if (next[classId]) {
                next[classId] = next[classId].filter((m) => !idsToRemove.has(m.id));
            }
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: Math.max(0, (prev[classId] ?? 0) - studentIds.length),
        }));
        if (classId === primaryClassId) {
            setAllStudents((prev) => prev.filter((m) => !idsToRemove.has(m.id)));
            setAllStudentsTotal((prev) => Math.max(0, prev - studentIds.length));
        }
    }, [primaryClassId]);

    const handleManageRemoveMemberRollback = useCallback((classId: string, member: ClassMember) => {
        setClassMembersCache((prev) => {
            const next = { ...prev };
            const existing = next[classId] ?? [];
            if (!existing.some((m) => m.id === member.id)) {
                next[classId] = [...existing, member];
            }
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: (prev[classId] ?? 0) + 1,
        }));
    }, []);

    const handleManageSwitchClass = useCallback((classId: string) => {
        setManageClassId(classId);
    }, []);

    const openManageDialog = useCallback((classId: string) => {
        setManageClassId(classId);
        setManageClassOpen(true);
    }, []);

    // ── Student click from AdminClassesView (turmas mode) ────
    const handleTurmasStudentClick = useCallback(async (memberId: string) => {
        setSelectedId(memberId);
        // If member already known, nothing to do
        const known = [...allStudents, ...orgStudents].find((m) => m.id === memberId);
        if (known) return;
        // Fetch full member info so StudentDetailCard can render
        try {
            const member = await fetchMember(memberId);
            setOrgStudents((prev) => [...prev, member]);
        } catch {
            // Silently fail — detail card just won't show
        }
    }, [allStudents, orgStudents]);

    // ── Remove student from selected class ───────────────────

    const handleRemoveFromClass = async (memberId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!selectedClassId || !isNonPrimarySelected) return;
        setRemovingMemberId(memberId);
        // Save member for rollback
        const removedMember = classMembersCache[selectedClassId]?.find((m) => m.id === memberId);
        // Optimistic: update cache immediately
        setClassMembersCache((prev) => {
            const next = { ...prev };
            if (next[selectedClassId]) {
                next[selectedClassId] = next[selectedClassId].filter((m) => m.id !== memberId);
            }
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [selectedClassId]: Math.max(0, (prev[selectedClassId] ?? 0) - 1),
        }));
        const member = allStudents.find((m) => m.id === memberId);
        try {
            await removeClassMembers(selectedClassId, [memberId]);
            cacheInvalidate(`class-members:${selectedClassId}`);
            toast.success(`${member?.full_name ?? "Aluno"} removido de ${selectedClass!.name}`);
        } catch {
            // Rollback on failure
            setClassMembersCache((prev) => {
                const next = { ...prev };
                const existing = next[selectedClassId] ?? [];
                if (removedMember && !existing.some((m) => m.id === memberId)) {
                    next[selectedClassId] = [...existing, removedMember];
                }
                return next;
            });
            setMemberCounts((prev) => ({
                ...prev,
                [selectedClassId]: (prev[selectedClassId] ?? 0) + 1,
            }));
            toast.error("Erro ao remover aluno da turma");
        } finally {
            setRemovingMemberId(null);
        }
    };


    // ── Render Member Row ────────────────────────────────────

    function renderMemberRow(member: Member, i: number, isExtra: boolean) {
        const grade = extractGrade(member.grade_level);
        const isSelected = selectedId === member.id;
        const isRemoving = removingMemberId === member.id;

        return (
            <motion.div
                key={member.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: isRemoving ? 0.5 : 1, y: 0 }}
                transition={{ delay: i * 0.015 }}
                onClick={() => handleStudentClick(member, isExtra)}
                className={cn(
                    "group/row flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors",
                    isSelected ? "bg-brand-primary/5" : "hover:bg-brand-primary/[0.02]",
                )}
            >
                <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={member.avatar_url || undefined} />
                    <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-xs font-medium">
                        {getInitials(member.full_name)}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-brand-primary truncate">
                        {member.full_name || member.display_name || "Sem nome"}
                    </p>
                    {member.email && (
                        <p className="text-[11px] text-brand-primary/35 truncate mt-0.5">{member.email}</p>
                    )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {grade && <GradePill grade={grade} />}
                    {member.course && <CoursePill course={member.course} />}
                    {isTeacherPage && member.subjects_taught?.slice(0, 2).map((s) => (
                        <SubjectPill key={s} name={s} />
                    ))}
                    {isTeacherPage && (member.subjects_taught?.length ?? 0) > 2 && (
                        <span
                            style={{ color: "#0d2f7f", backgroundColor: "#0d2f7f12", border: "1.5px solid #0d2f7f", borderBottomWidth: "3px" }}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none select-none"
                        >
                            +{(member.subjects_taught?.length ?? 0) - 2}
                        </span>
                    )}
                    {isExtra && <UserPlus className="h-3.5 w-3.5 text-brand-primary/30" />}
                </div>

                {/* Remove from class button (hover) */}
                {isNonPrimarySelected && !isExtra && (
                    <button
                        onClick={(e) => handleRemoveFromClass(member.id, e)}
                        disabled={isRemoving}
                        title={`Remover de ${selectedClass!.name}`}
                        className="opacity-0 group-hover/row:opacity-100 p-1 rounded-md text-brand-primary/30 hover:text-red-500 hover:bg-red-50 transition-all shrink-0"
                    >
                        <UserMinus className="h-3.5 w-3.5" />
                    </button>
                )}

                {!isNonPrimarySelected && (
                    <ChevronRight className="h-4 w-4 text-brand-primary/15 group-hover/row:text-brand-primary/30 transition-colors shrink-0" />
                )}
            </motion.div>
        );
    }

    // ── Onboarding: teacher/admin with no primary class ─────
    const needsOnboarding = isStudentPage && !primaryClassLoading && !primaryClassId && (!isAdmin || adminMode === "eu");

    const handleOnboardingComplete = useCallback(() => {
        refetchPrimaryClass();
        loadClasses();
        loadBaseStudents();
    }, [refetchPrimaryClass, loadClasses, loadBaseStudents]);

    if (needsOnboarding) {
        return (
            <div className="h-full flex flex-col">
                <ClassesOnboarding
                    onComplete={handleOnboardingComplete}
                    subjects={subjects}
                />
            </div>
        );
    }

    return (
        <div className="max-w-full mx-auto w-full h-full flex gap-0 @container">
            {/* Left column */}
            <div
                className={cn(
                    "min-w-0 transition-all duration-300 flex flex-col h-full",
                    selectedId ? "w-[60%] pr-4" : "w-full",
                )}
            >
                {/* Header */}
                <header className="mb-4 shrink-0 animate-fade-in-up">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-normal font-instrument text-brand-primary">{pageTitle}</h1>
                            <p className="text-brand-primary/70 mt-1">{pageSubtitle}</p>
                        </div>

                        {isAdmin && isStudentPage && (
                            <div className="flex rounded-xl border border-brand-primary/10 p-0.5 bg-white">
                                {(["centro", "eu", "turmas"] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => handleAdminModeChange(mode)}
                                        className={cn(
                                            "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all",
                                            adminMode === mode
                                                ? "bg-brand-accent/10 text-brand-accent"
                                                : "text-brand-primary/50 hover:text-brand-primary/70"
                                        )}
                                    >
                                        {mode === "centro" ? "Centro" : mode === "eu" ? "Eu" : "Turmas"}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </header>

                {/* Classes Gallery */}
                {showGallery && (
                    <ClassesGallery
                        classes={classes.filter((c) => !c.is_primary)}
                        subjects={subjects}
                        teacherNames={teacherNames}
                        memberCounts={memberCounts}
                        loading={classesLoading}
                        activeClassId={selectedClassId}
                        onClassClick={handleClassClick}
                        onAddClassClick={() => setCreateClassOpen(true)}
                        compact={!!selectedId}
                    />
                )}

                {/* Admin Turmas View */}
                {showTurmasView ? (
                    <AdminClassesView
                        classes={classes}
                        subjects={subjects}
                        teacherNames={teacherNames}
                        memberCounts={memberCounts}
                        classMembersData={classMembersCache}
                        loading={classesLoading}
                        onAddClassClick={() => setCreateClassOpen(true)}
                        onManageClass={openManageDialog}
                        onStudentClick={handleTurmasStudentClick}
                        selectedStudentId={selectedId}
                    />
                ) : (
                    <>
                        {/* Toolbar */}
                        <div className="flex items-center gap-2 mb-3 shrink-0 min-w-0">
                            <div className="relative min-w-0 flex-1 @[500px]:flex-none">
                                <Input
                                    ref={inputRef}
                                    className={cn("h-8 text-sm ps-8 w-full @[500px]:w-52", searchQuery && "pe-8")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Pesquisar..."
                                    type="text"
                                    aria-label={`Pesquisar ${isTeacherPage ? "professores" : "alunos"}`}
                                />
                                <div className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-2.5 text-muted-foreground/70">
                                    <ListFilter size={14} strokeWidth={2} aria-hidden="true" />
                                </div>
                                {searchQuery && (
                                    <button
                                        className="absolute inset-y-0 end-0 flex h-full w-8 items-center justify-center rounded-e-lg text-muted-foreground/70 hover:text-foreground transition-colors"
                                        aria-label="Limpar pesquisa"
                                        onClick={() => { setSearchQuery(""); inputRef.current?.focus(); }}
                                    >
                                        <CircleX size={14} strokeWidth={2} aria-hidden="true" />
                                    </button>
                                )}
                            </div>

                            {/* Active class filter pill */}
                            {isNonPrimarySelected && selectedClass && (() => {
                                const subjectId = selectedClass.subject_ids?.[0] ?? null;
                                const subject = subjects.find((s) => s.id === subjectId);
                                const c = subject?.color ?? "#6366F1";
                                const SubjectIcon = getSubjectIcon(subject?.icon ?? "users");
                                return (
                                    <button
                                        onClick={() => { setSelectedClassId(null); setSelectedId(null); }}
                                        title="Remover filtro de turma"
                                        className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium shrink-0 transition-opacity hover:opacity-80 focus:outline-none"
                                        style={{
                                            color: "#fff",
                                            backgroundColor: c,
                                            border: `1.5px solid ${c}`,
                                            borderBottomWidth: "3px",
                                        }}
                                    >
                                        <SubjectIcon size={13} strokeWidth={2} className="shrink-0 opacity-80" />
                                        {selectedClass.name}
                                        <CircleX size={13} strokeWidth={2} className="shrink-0 opacity-70" />
                                    </button>
                                );
                            })()}

                            {/* Manage class button (when a non-primary class is selected) */}
                            {isNonPrimarySelected && selectedClassId && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => openManageDialog(selectedClassId)}
                                    className="gap-1.5 h-8 shrink-0"
                                >
                                    <Settings2 className="h-3.5 w-3.5" />
                                    <span className="hidden @[580px]:inline">Gerir</span>
                                </Button>
                            )}

                            <span className="text-xs text-muted-foreground/60 shrink-0 tabular-nums ml-auto">
                                {filteredMembers.length !== total ? `${filteredMembers.length} de ${total}` : total}{" "}
                                {isTeacherPage ? "professores" : "alunos"}
                            </span>
                        </div>

                        {/* List */}
                        <div className="flex-1 min-h-0 rounded-xl border border-brand-primary/8 bg-white overflow-auto">
                            {loading ? (
                                <div className="flex items-center justify-center py-20">
                                    <div className="h-6 w-6 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                                </div>
                            ) : filteredMembers.length === 0 && !showAllExpanded ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in-up">
                                    <div className="h-16 w-16 rounded-2xl bg-brand-primary/5 flex items-center justify-center mb-4">
                                        <EmptyIcon className="h-8 w-8 text-brand-primary/30" />
                                    </div>
                                    <h3 className="text-lg font-medium text-brand-primary/80 mb-1">
                                        {searchQuery ? "Nenhum resultado encontrado" : `Sem ${isTeacherPage ? "professores" : "alunos"}`}
                                    </h3>
                                    <p className="text-sm text-brand-primary/50 max-w-sm">
                                        {searchQuery
                                            ? "Tenta pesquisar com outros termos."
                                            : `Os ${isTeacherPage ? "professores" : "alunos"} aparecerão aqui quando se inscreverem.`}
                                    </p>
                                    {searchNoLocalResults && !showAllExpanded && (
                                        <button
                                            onClick={loadOrgStudents}
                                            disabled={loadingAll}
                                            className="mt-4 text-sm text-brand-accent hover:text-brand-accent/80 font-medium transition-colors"
                                        >
                                            {loadingAll ? "A carregar..." : "Procurar em todos os alunos do centro"}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-brand-primary/5">
                                    {filteredMembers.map((member, i) => renderMemberRow(member, i, false))}

                                    {/* "Ver todos" expansion */}
                                    {isBaseViewPrimary && !isNonPrimarySelected && !showAllExpanded && filteredMembers.length > 0 && (
                                        <div className="px-4 py-3">
                                            <button
                                                onClick={loadOrgStudents}
                                                disabled={loadingAll}
                                                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-dashed border-brand-primary/15 text-sm text-brand-primary/50 hover:text-brand-primary/70 hover:border-brand-primary/25 transition-colors"
                                            >
                                                {loadingAll ? (
                                                    <div className="h-3.5 w-3.5 border-2 border-brand-primary/20 border-t-brand-primary rounded-full animate-spin" />
                                                ) : (
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                )}
                                                Ver todos os alunos do centro
                                            </button>
                                        </div>
                                    )}

                                    {showAllExpanded && extraMembers.length > 0 && (
                                        <>
                                            <div className="px-4 py-2 bg-brand-primary/[0.02]">
                                                <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider">
                                                    Outros alunos do centro ({extraMembers.length})
                                                </p>
                                            </div>
                                            {extraMembers.map((member, i) => renderMemberRow(member, i, true))}
                                        </>
                                    )}

                                    {showAllExpanded && searchQuery.trim() && extraMembers.length === 0 && filteredMembers.length === 0 && (
                                        <div className="px-4 py-8 text-center text-sm text-brand-primary/40">
                                            Nenhum aluno encontrado no centro.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Right column: Student/Teacher Detail */}
            <AnimatePresence>
                {selectedId && selectedMember && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, width: 0 }}
                        animate={{ opacity: 1, x: 0, width: "40%" }}
                        exit={{ opacity: 0, x: 20, width: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="shrink-0 border-l border-brand-primary/5 pl-4 overflow-hidden h-full"
                    >
                        {isTeacherPage ? (
                            <TeacherDetailCard
                                teacher={selectedMember}
                                onClose={() => setSelectedId(null)}
                                onTeacherUpdated={(updated) => {
                                    setAllStudents((prev) => prev.map((m) => m.id === updated.id ? updated : m));
                                }}
                            />
                        ) : (
                            <StudentDetailCard
                                student={selectedMember}
                                onClose={() => setSelectedId(null)}
                            />
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Add-to-my-students dialog (from "ver todos" extras) */}
            {addDialogMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 animate-fade-in">
                    <div className="bg-white rounded-2xl border border-brand-primary/10 shadow-xl p-6 w-full max-w-sm mx-4 animate-fade-in-up">
                        <div className="flex items-center gap-3 mb-4">
                            <Avatar className="h-10 w-10">
                                <AvatarImage src={addDialogMember.avatar_url || undefined} />
                                <AvatarFallback className="bg-brand-primary/10 text-brand-primary text-sm font-medium">
                                    {getInitials(addDialogMember.full_name)}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="text-sm font-medium text-brand-primary">
                                    {addDialogMember.display_name || addDialogMember.full_name}
                                </p>
                                <p className="text-xs text-brand-primary/50">
                                    {addDialogMember.grade_level ? `${extractGrade(addDialogMember.grade_level)}º ano` : ""}
                                    {addDialogMember.grade_level && addDialogMember.course ? " · " : ""}
                                    {addDialogMember.course || ""}
                                </p>
                            </div>
                        </div>
                        <p className="text-sm text-brand-primary/70 mb-5">
                            Este aluno não faz parte dos teus alunos. Queres adicioná-lo?
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setAddDialogMember(null)}
                                disabled={addingMember}
                                className="px-4 py-2 rounded-xl text-sm font-medium text-brand-primary/60 hover:text-brand-primary hover:bg-brand-primary/5 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleAddToMyStudents}
                                disabled={addingMember}
                                className="px-4 py-2 rounded-xl text-sm font-medium bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {addingMember ? (
                                    <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <UserPlus className="h-3.5 w-3.5" />
                                )}
                                Adicionar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Manage class dialog */}
            <ManageClassDialog
                open={manageClassOpen}
                onOpenChange={setManageClassOpen}
                classroom={managedClass}
                classes={classes}
                primaryClassId={primaryClassId}
                members={managedClassMembers}
                memberIds={managedClassMemberIds}
                onAddMembers={handleManageAddMembers}
                onRemoveMember={handleManageRemoveMember}
                onAddMembersRollback={handleManageAddMembersRollback}
                onRemoveMemberRollback={handleManageRemoveMemberRollback}
                onRenamed={handleManageClassRenamed}
                onDeleted={handleManageClassDeleted}
                onSwitchClass={handleManageSwitchClass}
            />

            {/* Create class dialog */}
            {createClassOpen && (
                <CreateClassDialog
                    open={createClassOpen}
                    onOpenChange={setCreateClassOpen}
                    onCreated={handleClassCreated}
                    primaryClassId={primaryClassId}
                    isAdmin={isAdmin}
                />
            )}
        </div>
    );
}

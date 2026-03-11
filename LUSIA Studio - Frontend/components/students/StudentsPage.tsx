"use client";

import React, { startTransition, useDeferredValue, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GraduationCap, ChevronRight, Users, ListFilter, CircleX, ChevronDown, UserPlus, UserMinus, Settings2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getSubjectIcon } from "@/lib/icons";
import {
    type Member,
    type PaginatedMembers,
} from "@/lib/members";
import {
    addClassMembers,
    removeClassMembers,
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
import { toast } from "sonner";
import {
    buildMembersQueryKey,
    prefetchMembersQuery,
    prefetchMemberQuery,
    updateMemberDetailCache,
    updateMembersQueryData,
    useMemberQuery,
    useMembersQuery,
} from "@/lib/queries/members";
import {
    addStudentsToClassMembersCache,
    invalidateClassesQueries,
    prefetchAllClassesQuery,
    prefetchClassMembersQuery,
    removeStudentsFromClassMembersCache,
    removeStudentsFromPrimaryStudentViews,
    removeClassFromQueries,
    syncStudentsIntoPrimaryStudentViews,
    updateClassMembersCache,
    updateClassesQueries,
    useAllClassesQuery,
    useOwnClassesQuery,
} from "@/lib/queries/classes";
import { useTeachersQuery } from "@/lib/queries/teachers";

type AdminMode = "centro" | "eu" | "turmas";
type StudentListFilterState = {
    years: string[];
    courses: string[];
};

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

function getMemberDisplayName(member: Member): string {
    return member.full_name || member.display_name || member.email || "Sem nome";
}

function sortMembersForList(members: Member[], isTeacherPage: boolean): Member[] {
    return [...members].sort((a, b) => {
        if (!isTeacherPage) {
            const gradeA = Number(extractGrade(a.grade_level) ?? "999");
            const gradeB = Number(extractGrade(b.grade_level) ?? "999");
            if (gradeA !== gradeB) {
                return gradeB - gradeA;
            }

            const courseCompare = (a.course ?? "").localeCompare(b.course ?? "", "pt", { sensitivity: "base" });
            if (courseCompare !== 0) {
                return courseCompare;
            }
        }

        return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b), "pt", { sensitivity: "base" });
    });
}

function groupMembersForList(members: Member[], isTeacherPage: boolean) {
    if (isTeacherPage) {
        return [{ key: "all", label: "Professores", members }];
    }

    const groups = new Map<string, Member[]>();

    members.forEach((member) => {
        const grade = extractGrade(member.grade_level);
        const key = grade ?? "other";
        const current = groups.get(key) ?? [];
        current.push(member);
        groups.set(key, current);
    });

    return [...groups.entries()]
        .sort(([a], [b]) => {
            if (a === "other") return 1;
            if (b === "other") return -1;
            return Number(b) - Number(a);
        })
        .map(([key, items]) => ({
            key,
            label: key === "other" ? "Sem ano definido" : `${key}º ano`,
            members: items,
        }));
}

function studentInfoToMember(student: StudentInfo): Member {
    return {
        id: student.id,
        full_name: student.full_name ?? null,
        display_name: student.display_name ?? null,
        avatar_url: student.avatar_url ?? null,
        grade_level: student.grade_level ?? null,
        course: student.course ?? null,
        email: null,
        role: "student",
        status: "active",
        school_name: null,
        phone: null,
        subjects_taught: null,
        subject_ids: student.subject_ids ?? null,
        class_ids: null,
        parent_name: null,
        parent_email: null,
        parent_phone: null,
        hourly_rate: null,
        onboarding_completed: false,
        created_at: null,
    };
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
    const { primaryClassId, loading: primaryClassLoading, refetch: refetchPrimaryClass } = usePrimaryClass();
    const { subjects } = useSubjects({ includeCustom: true });
    const isAdmin = user?.role === "admin";
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const [listFilters, setListFilters] = useState<StudentListFilterState>({ years: [], courses: [] });
    const inputRef = useRef<HTMLInputElement>(null);

    // Admin 3-mode toggle
    const [adminMode, setAdminMode] = useState<AdminMode>("centro");

    // Classes state
    const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
    const [classMembersCache, setClassMembersCache] = useState<Record<string, ClassMember[]>>({});
    const [createClassOpen, setCreateClassOpen] = useState(false);

    // "Ver todos" expansion
    const [showAllExpanded, setShowAllExpanded] = useState(false);
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

    const baseMembersRole = isTeacherPage ? "admin,teacher" : memberRole;
    const baseMembersClassId = (isTeacherPage || (isAdmin && adminMode === "centro"))
        ? null
        : primaryClassId;
    const shouldUseInitialMembers =
        initialMembers !== undefined &&
        !showTurmasView &&
        (
            isTeacherPage ||
            (isStudentPage && (
                (isAdmin && adminMode === "centro") ||
                (!isAdmin && !primaryClassLoading)
            ))
        );
    const baseMembersKey = buildMembersQueryKey({
        role: baseMembersRole,
        status: "active",
        page: 1,
        perPage: 100,
        classId: baseMembersClassId,
    });

    const {
        data: baseMembersResponse,
        isLoading: loading,
    } = useMembersQuery({
        role: baseMembersRole,
        status: "active",
        page: 1,
        perPage: 100,
        classId: baseMembersClassId,
        enabled: !showTurmasView && !(isStudentPage && !isAdmin && primaryClassLoading),
        initialData: shouldUseInitialMembers ? initialMembers : undefined,
    });

    const {
        data: orgStudentsResponse,
        isLoading: loadingAll,
    } = useMembersQuery({
        role: "student",
        status: "active",
        page: 1,
        perPage: 100,
        enabled: showAllExpanded,
    });

    const shouldLoadOwnClasses = isStudentPage && !primaryClassLoading;
    const {
        data: ownClassesResponse,
        isLoading: ownClassesLoading,
    } = useOwnClassesQuery(
        shouldLoadOwnClasses && !primaryClassLoading,
        shouldLoadOwnClasses ? initialClasses : undefined,
    );
    const {
        data: allClassesResponse,
        isLoading: allClassesLoading,
    } = useAllClassesQuery(isStudentPage && isAdmin);
    const {
        data: teachers = [],
    } = useTeachersQuery(isStudentPage && isAdmin);

    const allStudents = useMemo(() => baseMembersResponse?.data ?? [], [baseMembersResponse]);
    const allStudentsTotal = baseMembersResponse?.total ?? 0;
    const orgStudents = useMemo(() => orgStudentsResponse?.data ?? [], [orgStudentsResponse]);
    const classes = useMemo<Classroom[]>(
        () => (
            (isAdmin && adminMode === "turmas"
                ? allClassesResponse?.data
                : ownClassesResponse?.data) ?? []
        ),
        [adminMode, allClassesResponse, isAdmin, ownClassesResponse],
    );
    const classesLoading = showTurmasView ? allClassesLoading : ownClassesLoading;
    const teacherNames = useMemo<Record<string, string>>(() => {
        const names = Object.fromEntries(
            teachers.map((teacher) => [teacher.id, teacher.name]),
        );
        if (user?.id) {
            names[user.id] = user.display_name || user.full_name || names[user.id] || "Professor";
        }
        return names;
    }, [teachers, user]);

    const selectedClass = classes.find((c) => c.id === selectedClassId);
    const isNonPrimarySelected = selectedClass && !selectedClass.is_primary;

    // Whether the base view (no class selected) is scoped by primary class
    const isBaseViewPrimary = isStudentPage && !isTeacherPage && !(isAdmin && adminMode === "centro") && !showTurmasView && !!primaryClassId;

    // The class being managed in the dialog
    const managedClass = classes.find((c) => c.id === manageClassId) ?? null;

    useEffect(() => {
        if (showTurmasView || (isStudentPage && !isAdmin && primaryClassLoading)) {
            return;
        }
        setShowAllExpanded(false);
        setSelectedClassId(null);
    }, [adminMode, isAdmin, isStudentPage, primaryClassLoading, showTurmasView]);

    useEffect(() => {
        if (!isStudentPage || primaryClassLoading) {
            return;
        }

        const classesToWarm = [
            ...(ownClassesResponse?.data ?? []),
            ...(allClassesResponse?.data ?? []),
        ];

        if (classesToWarm.length === 0) {
            return;
        }

        let cancelled = false;

        const uniqueClasses = Array.from(
            new Map(classesToWarm.map((classroom) => [classroom.id, classroom])).values(),
        );

        void Promise.all(
            uniqueClasses.map(async (classroom) => {
                try {
                    const members = await prefetchClassMembersQuery(classroom.id);
                    return [classroom.id, members] as const;
                } catch {
                    return [classroom.id, []] as const;
                }
            }),
        ).then((results) => {
            if (cancelled) {
                return;
            }

            const counts: Record<string, number> = {};
            const membersMap: Record<string, ClassMember[]> = {};

            results.forEach(([classId, members]) => {
                counts[classId] = members.length;
                membersMap[classId] = members.map((member) => ({
                    id: member.id,
                    full_name: member.full_name ?? null,
                    display_name: member.display_name ?? null,
                    avatar_url: member.avatar_url ?? null,
                    grade_level: member.grade_level ?? null,
                    course: member.course ?? null,
                    subject_ids: member.subject_ids ?? null,
                }));
            });

            setMemberCounts(counts);
            setClassMembersCache(membersMap);
        });

        return () => {
            cancelled = true;
        };
    }, [allClassesResponse?.data, isStudentPage, ownClassesResponse?.data, primaryClassLoading]);

    useEffect(() => {
        if (loading || isTeacherPage) {
            return;
        }

        if (isAdmin) {
            if (primaryClassId) {
                void prefetchMembersQuery({
                    role: "student",
                    status: "active",
                    page: 1,
                    perPage: 100,
                    classId: primaryClassId,
                });
            }
            void prefetchMembersQuery({
                role: "student",
                status: "active",
                page: 1,
                perPage: 100,
            });
            void prefetchAllClassesQuery();
            return;
        }

        void prefetchMembersQuery({
            role: "student",
            status: "active",
            page: 1,
            perPage: 100,
        });
    }, [isAdmin, isTeacherPage, loading, primaryClassId]);

    // ── Client-side filtering ─────────────────────────────────

    const filteredMembers = useMemo(() => {
        let list = sortMembersForList(allStudents, isTeacherPage);

        if (isNonPrimarySelected && selectedClassId && classMembersCache[selectedClassId]) {
            const classStudentIds = new Set(classMembersCache[selectedClassId].map((m) => m.id));
            list = list.filter((m) => classStudentIds.has(m.id));
        }

        if (!isTeacherPage && listFilters.years.length > 0) {
            const allowedYears = new Set(listFilters.years);
            list = list.filter((member) => {
                const grade = extractGrade(member.grade_level);
                return grade ? allowedYears.has(grade) : false;
            });
        }

        if (!isTeacherPage && listFilters.courses.length > 0) {
            const allowedCourses = new Set(listFilters.courses);
            list = list.filter((member) => member.course && allowedCourses.has(member.course));
        }

        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase();
            list = list.filter(
                (m) =>
                    m.full_name?.toLowerCase().includes(q) ||
                    m.display_name?.toLowerCase().includes(q) ||
                    m.email?.toLowerCase().includes(q),
            );
        }
        return list;
    }, [allStudents, classMembersCache, deferredSearchQuery, isNonPrimarySelected, isTeacherPage, listFilters.courses, listFilters.years, selectedClassId]);

    const total = isNonPrimarySelected && selectedClassId && classMembersCache[selectedClassId]
        ? classMembersCache[selectedClassId].length
        : allStudentsTotal;

    // Extra students from org (not in primary class)
    const primaryIds = useMemo(() => new Set(allStudents.map((m) => m.id)), [allStudents]);
    const extraMembers = useMemo(() => {
        if (!showAllExpanded) return [];
        let extras = sortMembersForList(orgStudents.filter((m) => !primaryIds.has(m.id)), isTeacherPage);
        if (!isTeacherPage && listFilters.years.length > 0) {
            const allowedYears = new Set(listFilters.years);
            extras = extras.filter((member) => {
                const grade = extractGrade(member.grade_level);
                return grade ? allowedYears.has(grade) : false;
            });
        }
        if (!isTeacherPage && listFilters.courses.length > 0) {
            const allowedCourses = new Set(listFilters.courses);
            extras = extras.filter((member) => member.course && allowedCourses.has(member.course));
        }
        if (deferredSearchQuery.trim()) {
            const q = deferredSearchQuery.toLowerCase();
            extras = extras.filter(
                (m) =>
                    m.full_name?.toLowerCase().includes(q) ||
                    m.display_name?.toLowerCase().includes(q) ||
                    m.email?.toLowerCase().includes(q),
            );
        }
        return extras;
    }, [deferredSearchQuery, isTeacherPage, listFilters.courses, listFilters.years, orgStudents, primaryIds, showAllExpanded]);

    const groupedFilteredMembers = useMemo(
        () => groupMembersForList(filteredMembers, isTeacherPage),
        [filteredMembers, isTeacherPage],
    );
    const groupedExtraMembers = useMemo(
        () => groupMembersForList(extraMembers, isTeacherPage),
        [extraMembers, isTeacherPage],
    );

    const availableYearFilters = useMemo(() => {
        if (isTeacherPage) {
            return [];
        }

        const years = new Set<string>();
        [...allStudents, ...orgStudents].forEach((member) => {
            const grade = extractGrade(member.grade_level);
            if (grade) {
                years.add(grade);
            }
        });

        return [...years].sort((a, b) => Number(a) - Number(b));
    }, [allStudents, isTeacherPage, orgStudents]);

    const availableCourseFilters = useMemo(() => {
        if (isTeacherPage) {
            return [];
        }

        const courses = new Set<string>();
        [...allStudents, ...orgStudents].forEach((member) => {
            if (member.course) {
                courses.add(member.course);
            }
        });

        return [...courses].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));
    }, [allStudents, isTeacherPage, orgStudents]);

    const activeFilterCount = listFilters.years.length + listFilters.courses.length;

    const searchNoLocalResults = deferredSearchQuery.trim() && filteredMembers.length === 0 && isBaseViewPrimary && !isNonPrimarySelected;

    const selectedMemberSeed = [...allStudents, ...orgStudents].find((m) => m.id === selectedId);
    const { data: selectedMemberQueryData } = useMemberQuery(
        selectedId,
        Boolean(selectedId) && !selectedMemberSeed?.email,
    );
    const selectedMember = selectedMemberQueryData ?? selectedMemberSeed;

    // ── Mode change ──────────────────────────────────────────

    const handleAdminModeChange = (mode: AdminMode) => {
        startTransition(() => {
            setAdminMode(mode);
            setSelectedClassId(null);
            setSelectedId(null);
            setSearchQuery("");
            setListFilters({ years: [], courses: [] });
            setShowAllExpanded(false);
        });
        // Don't clear allStudents, orgStudents, classes, classMembersCache
        // Let the new fetch replace them — avoids flash during transition
    };

    // ── Class Click ──────────────────────────────────────────

    const handleClassClick = useCallback((classroom: Classroom) => {
        if (showTurmasView) {
            startTransition(() => {
                setAdminMode("eu");
                setSelectedClassId(classroom.id);
                setSelectedId(null);
            });
            return;
        }
        startTransition(() => {
            setSelectedClassId((prev) => prev === classroom.id ? null : classroom.id);
            setSelectedId(null);
        });
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
            updateMembersQueryData(baseMembersKey, (current) => {
                if (!current || current.data.some((member) => member.id === addDialogMember.id)) {
                    return current;
                }

                return {
                    ...current,
                    data: [...current.data, addDialogMember],
                    total: current.total + 1,
                };
            });
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
            updateClassMembersCache(primaryClassId, (current) => [
                ...current,
                {
                    id: addDialogMember.id,
                    full_name: addDialogMember.full_name,
                    display_name: addDialogMember.display_name,
                    avatar_url: addDialogMember.avatar_url,
                    grade_level: addDialogMember.grade_level,
                    course: addDialogMember.course,
                    subject_ids: addDialogMember.subject_ids,
                },
            ]);
            updateMemberDetailCache(addDialogMember);
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
        invalidateClassesQueries();
        refetchPrimaryClass();
    }, [refetchPrimaryClass]);

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
        const newMembers: ClassMember[] = students.map((student) => ({
            id: student.id,
            full_name: student.full_name ?? null,
            display_name: student.display_name ?? null,
            avatar_url: student.avatar_url ?? null,
            grade_level: student.grade_level ?? null,
            course: student.course ?? null,
            subject_ids: student.subject_ids ?? null,
        }));
        setClassMembersCache((prev) => {
            const next = { ...prev };
            const existing = next[classId] ?? [];
            const existingIds = new Set(existing.map((m) => m.id));
            next[classId] = [...existing, ...newMembers.filter((member) => !existingIds.has(member.id))];
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: (prev[classId] ?? 0) + students.length,
        }));
        addStudentsToClassMembersCache(classId, students);
        const shouldSyncPrimaryClassCache = Boolean(primaryClassId && primaryClassId !== classId);
        const shouldSyncPrimaryList = Boolean(primaryClassId);
        if (shouldSyncPrimaryList) {
            if (shouldSyncPrimaryClassCache && primaryClassId) {
                setClassMembersCache((prev) => {
                    const next = { ...prev };
                    const existing = next[primaryClassId] ?? [];
                    const existingIds = new Set(existing.map((member) => member.id));
                    next[primaryClassId] = [...existing, ...newMembers.filter((member) => !existingIds.has(member.id))];
                    return next;
                });
                setMemberCounts((prev) => ({
                    ...prev,
                    [primaryClassId]: (prev[primaryClassId] ?? 0) + newMembers.filter((member) =>
                        !(classMembersCache[primaryClassId] ?? []).some((existing) => existing.id === member.id),
                    ).length,
                }));
                addStudentsToClassMembersCache(primaryClassId, students);
            }
            syncStudentsIntoPrimaryStudentViews(students, primaryClassId);
            // Background: hydrate full Member objects for StudentDetailCard
            Promise.all(
                students.map((s) => prefetchMemberQuery(s.id).catch(() => null)),
            ).then((results) => {
                const valid = results.filter(Boolean) as Member[];
                if (valid.length === 0) return;
                valid.forEach((member) => updateMemberDetailCache(member));
                updateMembersQueryData(baseMembersKey, (current) => {
                    if (!current) {
                        return current;
                    }
                    const map = new Map(valid.map((member) => [member.id, member]));
                    return {
                        ...current,
                        data: current.data.map((member) => map.get(member.id) ?? member),
                    };
                });
            });
        }
    }, [baseMembersKey, classMembersCache, primaryClassId]);

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
        removeStudentsFromClassMembersCache(classId, [memberId]);
    }, []);

    const handleManageClassRenamed = useCallback((classId: string, updated: Classroom) => {
        updateClassesQueries((currentClasses) =>
            currentClasses.map((classroom) => classroom.id === classId ? updated : classroom),
        );
    }, []);

    const handleManageClassDeleted = useCallback((classId: string) => {
        if (selectedClassId === classId) {
            setSelectedClassId(null);
            setSelectedId(null);
        }
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
        removeClassFromQueries(classId);
        invalidateClassesQueries();
    }, [selectedClassId]);

    // ── Rollback handlers for ManageClassDialog ─────────────

    const handleManageAddMembersRollback = useCallback((classId: string, studentIds: string[]) => {
        const idsToRemove = new Set(studentIds);
        setClassMembersCache((prev) => {
            const next = { ...prev };
            if (next[classId]) {
                next[classId] = next[classId].filter((m) => !idsToRemove.has(m.id));
            }
            if (primaryClassId && primaryClassId !== classId && next[primaryClassId]) {
                next[primaryClassId] = next[primaryClassId].filter((m) => !idsToRemove.has(m.id));
            }
            return next;
        });
        setMemberCounts((prev) => ({
            ...prev,
            [classId]: Math.max(0, (prev[classId] ?? 0) - studentIds.length),
            ...(primaryClassId && primaryClassId !== classId ? {
                [primaryClassId]: Math.max(0, (prev[primaryClassId] ?? 0) - studentIds.length),
            } : {}),
        }));
        removeStudentsFromClassMembersCache(classId, studentIds);
        if (primaryClassId && primaryClassId !== classId) {
            removeStudentsFromClassMembersCache(primaryClassId, studentIds);
        }
        if (primaryClassId) {
            removeStudentsFromPrimaryStudentViews(studentIds, primaryClassId);
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
        updateClassMembersCache(classId, (current) =>
            current.some((existing) => existing.id === member.id)
                ? current
                : [...current, member],
        );
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
    }, []);

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

    function renderMemberGroups(
        groups: Array<{ key: string; label: string; members: Member[] }>,
        isExtra: boolean,
        offset = 0,
    ) {
        let runningIndex = offset;

        return groups.map((group) => {
            const section = (
                <React.Fragment key={`${isExtra ? "extra" : "base"}-${group.key}`}>
                    {!isTeacherPage && (
                        <div className="px-4 py-2 bg-brand-primary/[0.02]">
                            <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider">
                                {group.label} ({group.members.length})
                            </p>
                        </div>
                    )}
                    {group.members.map((member, index) => renderMemberRow(member, runningIndex + index, isExtra))}
                </React.Fragment>
            );
            runningIndex += group.members.length;
            return section;
        });
    }

    // ── Onboarding: teacher/admin with no primary class ─────
    const needsOnboarding = isStudentPage && !primaryClassLoading && !primaryClassId && (!isAdmin || adminMode === "eu");

    const handleOnboardingComplete = useCallback(() => {
        refetchPrimaryClass();
        invalidateClassesQueries();
    }, [refetchPrimaryClass]);

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

                            {!isTeacherPage && (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button variant="outline" size="sm" className="h-8 text-xs shrink-0 gap-1.5">
                                            <ListFilter className="opacity-60 shrink-0" size={14} strokeWidth={2} aria-hidden="true" />
                                            <span className="hidden @[420px]:inline">Filtrar</span>
                                            {activeFilterCount > 0 && (
                                                <span className="inline-flex h-4 items-center rounded border border-border bg-background px-1 font-[inherit] text-[0.6rem] font-medium text-muted-foreground/70">
                                                    {activeFilterCount}
                                                </span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-3 space-y-4" align="start">
                                        {availableYearFilters.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Ano</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {availableYearFilters.map((year) => {
                                                        const active = listFilters.years.includes(year);
                                                        return (
                                                            <button
                                                                key={year}
                                                                onClick={() => setListFilters((current) => ({
                                                                    ...current,
                                                                    years: active
                                                                        ? current.years.filter((value) => value !== year)
                                                                        : [...current.years, year].sort((a, b) => Number(b) - Number(a)),
                                                                }))}
                                                                className={cn(
                                                                    "rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                                                                    active
                                                                        ? "bg-brand-accent/10 text-brand-accent"
                                                                        : "bg-brand-primary/[0.04] text-brand-primary/60 hover:bg-brand-primary/[0.08]",
                                                                )}
                                                            >
                                                                {year}º
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {availableCourseFilters.length > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Curso</p>
                                                <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                                                    {availableCourseFilters.map((course) => {
                                                        const active = listFilters.courses.includes(course);
                                                        return (
                                                            <button
                                                                key={course}
                                                                onClick={() => setListFilters((current) => ({
                                                                    ...current,
                                                                    courses: active
                                                                        ? current.courses.filter((value) => value !== course)
                                                                        : [...current.courses, course].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" })),
                                                                }))}
                                                                className={cn(
                                                                    "rounded-full px-2 py-1 text-[11px] font-medium transition-colors",
                                                                    active
                                                                        ? "bg-brand-accent/10 text-brand-accent"
                                                                        : "bg-brand-primary/[0.04] text-brand-primary/60 hover:bg-brand-primary/[0.08]",
                                                                )}
                                                            >
                                                                {course}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {activeFilterCount > 0 && (
                                            <button
                                                onClick={() => setListFilters({ years: [], courses: [] })}
                                                className="w-full text-[10px] text-muted-foreground hover:text-foreground transition-colors text-center pt-1 border-t border-border"
                                            >
                                                Limpar filtros
                                            </button>
                                        )}
                                    </PopoverContent>
                                </Popover>
                            )}

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
                                            onClick={() => setShowAllExpanded(true)}
                                            disabled={loadingAll}
                                            className="mt-4 text-sm text-brand-accent hover:text-brand-accent/80 font-medium transition-colors"
                                        >
                                            {loadingAll ? "A carregar..." : "Procurar em todos os alunos do centro"}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-brand-primary/5">
                                    {renderMemberGroups(groupedFilteredMembers, false)}

                                    {/* "Ver todos" expansion */}
                                    {isBaseViewPrimary && !isNonPrimarySelected && !showAllExpanded && filteredMembers.length > 0 && (
                                        <div className="px-4 py-3">
                                            <button
                                                onClick={() => setShowAllExpanded(true)}
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
                                            {renderMemberGroups(groupedExtraMembers, true, filteredMembers.length)}
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
                                    updateMemberDetailCache(updated);
                                    updateMembersQueryData(baseMembersKey, (current) => {
                                        if (!current) {
                                            return current;
                                        }
                                        return {
                                            ...current,
                                            data: current.data.map((member) =>
                                                member.id === updated.id ? updated : member,
                                            ),
                                        };
                                    });
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

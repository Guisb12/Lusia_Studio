"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Building2, Calendar, Check, ChevronDown, Copy, GraduationCap,
    Hash, Loader2, LogOut, Mail, MapPin, Phone, RefreshCw, User, Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { RoleBadge } from "@/components/ui/role-badge";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { AppScrollArea } from "@/components/ui/app-scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PickerScrollBody } from "@/components/ui/picker-scroll-body";
import {
    ProfileCard, ProfileSection, InlineEditRow, InfoRow,
    DisplayNameEditor,
} from "@/components/profile/ProfilePrimitives";
import { ProfileSubjectsPicker } from "@/components/profile/ProfileSubjectsPicker";
import { ChangePasswordButton } from "@/components/profile/ChangePasswordSection";
import { type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PT_DISTRICTS } from "@/lib/curriculum";
import { patchMyProfileQuery, useMyProfileQuery } from "@/lib/queries/profile";
import {
    patchEnrollmentInfoQuery,
    patchOrganizationQuery,
    useOrganizationQuery,
} from "@/lib/queries/organizations";
import { useDeferredQueryEnabled } from "@/lib/hooks/use-deferred-query-enabled";

/* ── Patch helpers ──────────────────────────────────────────────── */

async function patchMe(body: Record<string, unknown>) {
    const res = await fetch("/api/members/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    return res.ok;
}

async function patchOrg(orgId: string, body: Record<string, unknown>) {
    const res = await fetch(`/api/organizations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return res.json();
}

/* ── Main component ─────────────────────────────────────────────── */

interface TeacherProfilePageProps {
    initialOrgData?: Record<string, any> | null;
    initialProfile?: Member | null;
}

export function TeacherProfilePage({
    initialOrgData,
    initialProfile,
}: TeacherProfilePageProps) {
    const { user } = useUser();
    const router = useRouter();
    const isAdmin = user?.role === "admin";
    const deferredOrgEnabled = useDeferredQueryEnabled(Boolean(isAdmin && user?.organization_id));
    const profileQuery = useMyProfileQuery(initialProfile ?? undefined, Boolean(user?.id));
    const organizationQuery = useOrganizationQuery(
        user?.organization_id,
        Boolean(isAdmin && user?.organization_id) && deferredOrgEnabled,
        initialOrgData ?? undefined,
    );

    const [member, setMember] = useState<Member | null>(initialProfile ?? null);
    const [subjectIds, setSubjectIds] = useState<string[]>(initialProfile?.subjects_taught ?? []);
    const [orgData, setOrgData] = useState<Record<string, any> | null>(initialOrgData ?? null);
    const [rotatingStudent, setRotatingStudent] = useState(false);
    const [rotatingTeacher, setRotatingTeacher] = useState(false);
    const [copiedCode, setCopiedCode] = useState<"student" | "teacher" | null>(null);

    /* ── Sync from queries ── */
    useEffect(() => {
        const data = profileQuery.data;
        if (!data) return;
        setMember(data);
        setSubjectIds(data.subjects_taught ?? []);
    }, [profileQuery.data]);

    useEffect(() => {
        const data = organizationQuery.data;
        if (data) setOrgData(data);
    }, [organizationQuery.data]);

    /* ── Inline save helpers (each field saves independently) ── */
    const saveField = useCallback(async (field: string, value: string) => {
        const body: Record<string, unknown> = { [field]: value || null };
        const ok = await patchMe(body);
        if (ok) {
            patchMyProfileQuery((c) => c ? { ...c, ...body } : c);
            setMember(p => p ? { ...p, ...body } as Member : p);
        }
    }, []);

    const saveOrgField = useCallback(async (field: string, value: string) => {
        if (!user?.organization_id) return;
        const body = { [field]: value || null };
        const d = await patchOrg(user.organization_id, body);
        if (d) {
            patchOrganizationQuery(user.organization_id, (c) => ({ ...(c ?? {}), ...d }));
            setOrgData(p => ({ ...p, ...d }));
        }
    }, [user?.organization_id]);

    const handleSaveSubjects = useCallback(async (ids: string[]) => {
        await patchMe({ subjects_taught: ids });
        patchMyProfileQuery((c) => c ? { ...c, subjects_taught: ids } : c);
        setMember(p => p ? { ...p, subjects_taught: ids } : p);
    }, []);

    const handleSaveDisplayName = useCallback(async (name: string) => {
        const ok = await patchMe({ display_name: name });
        if (ok) {
            patchMyProfileQuery((c) => c ? { ...c, display_name: name } : c);
            setMember(p => p ? { ...p, display_name: name } : p);
        }
    }, []);

    const handleAvatarUploaded = useCallback(async (url: string) => {
        patchMyProfileQuery((c) => c ? { ...c, avatar_url: url } : c);
        setMember(p => p ? { ...p, avatar_url: url } : p);
        await patchMe({ avatar_url: url });
    }, []);

    const handleOrgLogoUploaded = useCallback(async (url: string) => {
        if (!user?.organization_id) return;
        patchOrganizationQuery(user.organization_id, (c) => c ? { ...c, logo_url: url } : c);
        setOrgData(p => p ? { ...p, logo_url: url } : p);
        await patchOrg(user.organization_id, { logo_url: url });
    }, [user?.organization_id]);

    const handleRotateCode = useCallback(async (type: "student" | "teacher") => {
        if (!user?.organization_id) return;
        type === "student" ? setRotatingStudent(true) : setRotatingTeacher(true);
        try {
            const res = await fetch(`/api/organizations/${user.organization_id}/codes/rotate-${type}`, { method: "POST" });
            if (res.ok) {
                const d = await res.json();
                patchEnrollmentInfoQuery(user.organization_id, (c) => ({ ...(c ?? {}), ...d }));
                patchOrganizationQuery(user.organization_id, (c) => ({ ...(c ?? {}), ...d }));
                setOrgData(p => p ? { ...p, ...d } : p);
            }
        } finally { type === "student" ? setRotatingStudent(false) : setRotatingTeacher(false); }
    }, [user?.organization_id]);

    const handleCopy = (code: string, type: "student" | "teacher") => {
        navigator.clipboard.writeText(code).catch(() => {});
        setCopiedCode(type);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    const joinedDate = member?.created_at
        ? new Date(member.created_at).toLocaleDateString("pt-PT", { day: "numeric", month: "long", year: "numeric" })
        : null;

    const displayName = member?.display_name || member?.full_name || user?.display_name || user?.full_name || "";

    return (
        <div className="w-full lg:h-full lg:overflow-hidden">
            <div className="lg:h-full lg:flex lg:flex-col">
                {/* ── Header (fixed on desktop) ── */}
                <header className="shrink-0 mb-5">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">O meu Perfil</h1>
                    <p className="text-brand-primary/50 mt-0.5 text-sm">As tuas informações e configurações.</p>
                </header>

                <div className="flex flex-col lg:flex-row gap-5 items-start lg:flex-1 lg:min-h-0">

                    {/* ═══════════ LEFT SIDEBAR (fixed on desktop) ═══════════ */}
                    <div className="w-full lg:w-64 lg:shrink-0 space-y-3">
                        <ProfileCard>
                            <div className="p-5 flex flex-col items-center text-center">
                                <div className="mb-4">
                                    <AvatarUpload
                                        value={member?.avatar_url ?? user?.avatar_url ?? null}
                                        onUploadComplete={handleAvatarUploaded}
                                        size="lg" shape="circle" bucket="avatars" pathPrefix="profiles/"
                                    />
                                </div>
                                <DisplayNameEditor
                                    displayName={displayName}
                                    fallback={user?.full_name || ""}
                                    onSave={handleSaveDisplayName}
                                />
                                <p className="text-[11px] text-brand-primary/35 mb-3 truncate max-w-full px-2">{user?.email}</p>
                                <RoleBadge role={user?.role} />
                                {joinedDate && (
                                    <div className="mt-4 pt-4 border-t border-brand-primary/[0.04] w-full flex items-center justify-center gap-1.5 text-[10px] text-brand-primary/30">
                                        <Calendar className="h-3 w-3 shrink-0" /> Membro desde {joinedDate}
                                    </div>
                                )}
                            </div>
                        </ProfileCard>

                        <ChangePasswordButton />

                        <button
                            onClick={async () => { const s = createClient(); await s.auth.signOut(); router.replace("/login"); }}
                            className="w-full bg-brand-primary/[0.04] rounded-lg p-0.5"
                        >
                            <span className="w-full flex items-center justify-center gap-2 bg-white rounded-md shadow-sm py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors">
                                <LogOut className="h-3.5 w-3.5" /> Terminar sessão
                            </span>
                        </button>
                    </div>

                    {/* ═══════════ RIGHT: SCROLLABLE CONTENT ═══════════ */}
                    <AppScrollArea
                        className="flex-1 min-w-0 lg:h-full"
                        viewportClassName="pb-12"
                        showFadeMasks
                        desktopScrollbarOnly
                        interactiveScrollbar
                    >
                        <div className="space-y-5">
                            {/* ── Contacto ── */}
                            <ProfileSection title="Contacto">
                                <InlineEditRow icon={User} label="Nome completo"
                                    value={member?.full_name || user?.full_name || ""}
                                    onSave={v => saveField("full_name", v)} />
                                <InlineEditRow icon={Mail} label="Email" value={user?.email} readOnly muted />
                                <InlineEditRow icon={Phone} label="Telefone"
                                    value={member?.phone || ""}
                                    onSave={v => saveField("phone", v)}
                                    type="tel" placeholder="+351 900 000 000" />
                            </ProfileSection>

                            {/* ── Disciplinas ── */}
                            <ProfileSubjectsPicker
                                selectedIds={subjectIds}
                                onChange={setSubjectIds}
                                role={isAdmin ? "admin" : "teacher"}
                                onSave={handleSaveSubjects}
                            />

                            {/* ── Centro de Estudos (admin) ── */}
                            {isAdmin && orgData && (
                                <>
                                    <ProfileSection title="Centro de Estudos">
                                        {/* Logo row */}
                                        <div className="flex items-center gap-3 py-2.5">
                                            <AvatarUpload value={orgData.logo_url || null} onUploadComplete={handleOrgLogoUploaded}
                                                size="sm" shape="rounded" bucket="avatars" pathPrefix="org-logos/" />
                                            <div>
                                                <p className="text-[13px] font-medium text-brand-primary">{orgData.name || "—"}</p>
                                                <p className="text-[10px] text-brand-primary/30">Logotipo do centro</p>
                                            </div>
                                        </div>
                                        <InlineEditRow icon={Building2} label="Nome"
                                            value={orgData.name || ""}
                                            onSave={v => saveOrgField("name", v)} />
                                        <InlineEditRow icon={Mail} label="Email"
                                            value={orgData.email || ""}
                                            onSave={v => saveOrgField("email", v)} type="email" />
                                        <InlineEditRow icon={Phone} label="Telefone"
                                            value={orgData.phone || ""}
                                            onSave={v => saveOrgField("phone", v)} type="tel" />
                                        <DistrictPicker
                                            value={orgData.district || null}
                                            onChange={(d) => void saveOrgField("district", d)}
                                        />
                                        <InlineEditRow icon={MapPin} label="Cidade"
                                            value={orgData.city || ""}
                                            onSave={v => saveOrgField("city", v)} />
                                        <InlineEditRow icon={MapPin} label="Morada"
                                            value={orgData.address || ""}
                                            onSave={v => saveOrgField("address", v)} />
                                        <InlineEditRow icon={Hash} label="Código Postal"
                                            value={orgData.postal_code || ""}
                                            onSave={v => saveOrgField("postal_code", v)} />
                                    </ProfileSection>

                                    {/* Enrollment codes */}
                                    <ProfileSection title="Códigos de Inscrição">
                                        {([
                                            { type: "student" as const, label: "Alunos", icon: GraduationCap, code: orgData.student_enrollment_code, rotating: rotatingStudent },
                                            { type: "teacher" as const, label: "Professores", icon: Users, code: orgData.teacher_enrollment_code, rotating: rotatingTeacher },
                                        ] as const).map(({ type, label, icon: Icon, code, rotating }) => (
                                            <div key={type} className="flex items-center gap-2.5 py-2.5">
                                                <Icon className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
                                                <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">Código {label}</span>
                                                <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                                    <code className="flex-1 bg-brand-primary/[0.03] border border-brand-primary/[0.06] px-2.5 py-1.5 rounded-lg text-xs font-mono text-brand-primary truncate">
                                                        {code || "—"}
                                                    </code>
                                                    <button onClick={() => handleCopy(code, type)}
                                                        className="h-7 w-7 rounded-lg bg-brand-primary/[0.03] border border-brand-primary/[0.06] flex items-center justify-center text-brand-primary/30 hover:bg-brand-primary/[0.06] hover:text-brand-primary transition-all shrink-0">
                                                        {copiedCode === type ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                                    </button>
                                                    <button onClick={() => void handleRotateCode(type)} disabled={rotating}
                                                        className="h-7 w-7 rounded-lg bg-brand-primary/[0.03] border border-brand-primary/[0.06] flex items-center justify-center text-brand-primary/30 hover:bg-brand-primary/[0.06] hover:text-brand-primary transition-all shrink-0 disabled:opacity-40">
                                                        {rotating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </ProfileSection>
                                </>
                            )}
                        </div>
                    </AppScrollArea>
                </div>
            </div>
        </div>
    );
}

/* ── District Picker (Popover + PickerScrollBody) ──────────────── */

function DistrictPicker({ value, onChange }: { value: string | null; onChange: (d: string) => void }) {
    const [open, setOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    return (
        <div ref={containerRef} className="flex items-center gap-2.5 py-2 min-h-[36px]">
            <MapPin className="h-3.5 w-3.5 text-brand-primary/25 shrink-0" />
            <span className="text-[10px] text-brand-primary/35 w-24 shrink-0">Distrito</span>
            <div className="flex-1 min-w-0">
                <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            className="w-full flex items-center justify-between gap-2 text-[13px] text-brand-primary hover:text-brand-accent transition-colors"
                        >
                            <span className={cn(!value && "text-brand-primary/25 italic")}>
                                {value || "Selecionar distrito"}
                            </span>
                            <ChevronDown className={cn("h-3.5 w-3.5 text-brand-primary/20 shrink-0 transition-transform", open && "rotate-180")} />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        container={containerRef.current}
                        className="w-[var(--radix-popover-trigger-width)] min-w-[200px] p-0 rounded-xl border-brand-primary/10 shadow-lg"
                        align="start"
                    >
                        <PickerScrollBody maxHeight={240}>
                            {PT_DISTRICTS.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    className={cn(
                                        "w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left text-sm",
                                        d === value
                                            ? "bg-brand-primary/5 text-brand-primary"
                                            : "hover:bg-brand-primary/[0.03] text-brand-primary/70"
                                    )}
                                    onClick={() => { onChange(d); setOpen(false); }}
                                >
                                    <span className="flex-1 truncate">{d}</span>
                                    {d === value && <Check className="h-3.5 w-3.5 text-brand-primary shrink-0" />}
                                </button>
                            ))}
                        </PickerScrollBody>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}

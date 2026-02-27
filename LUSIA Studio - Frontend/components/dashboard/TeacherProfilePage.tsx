"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    Calendar, Check, Copy, GraduationCap,
    Loader2, LogOut, RefreshCw, Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/providers/UserProvider";
import { RoleBadge } from "@/components/ui/role-badge";
import { AvatarUpload } from "@/components/ui/avatar-upload";
import { ProfileFieldSelect } from "@/components/profile/ProfileFieldSelect";
import {
    SectionCard, SectionHeader, SectionTitle,
    Field, ReadOnlyField, DisplayNameEditor,
} from "@/components/profile/ProfilePrimitives";
import { ProfileSubjectsPicker } from "@/components/profile/ProfileSubjectsPicker";
import { fetchMyProfile, type Member } from "@/lib/members";
import { createClient } from "@/lib/supabase/client";
import { PT_DISTRICTS } from "@/lib/curriculum";

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

export function TeacherProfilePage() {
    const { user } = useUser();
    const router = useRouter();
    const isAdmin = user?.role === "admin";

    const [member, setMember] = useState<Member | null>(null);
    // Extended fields not in StudioUser — loaded async
    const [extendedLoading, setExtendedLoading] = useState(true);

    // display name — seeded from user immediately
    const [editingName, setEditingName] = useState(false);
    const [displayName, setDisplayName] = useState(user?.display_name || user?.full_name || "");
    const [savingName, setSavingName] = useState(false);

    // personal section — seeded from user immediately
    const [editingPersonal, setEditingPersonal] = useState(false);
    const [savingPersonal, setSavingPersonal] = useState(false);
    const [personal, setPersonal] = useState({ full_name: user?.full_name || "", phone: user?.phone || "" });
    const [personalDraft, setPersonalDraft] = useState({ full_name: user?.full_name || "", phone: user?.phone || "" });

    // professional section — hourly_rate not in StudioUser, loaded async
    const [editingProf, setEditingProf] = useState(false);
    const [savingProf, setSavingProf] = useState(false);
    const [prof, setProf] = useState({ hourly_rate: "" });
    const [profDraft, setProfDraft] = useState({ hourly_rate: "" });

    // subjects — subjects_taught not in StudioUser, loaded async
    const [subjectIds, setSubjectIds] = useState<string[]>([]);

    // org section (admin)
    const [orgData, setOrgData] = useState<Record<string, any> | null>(null);
    const [editingOrg, setEditingOrg] = useState(false);
    const [savingOrg, setSavingOrg] = useState(false);
    const [orgDraft, setOrgDraft] = useState({ name: "", email: "", phone: "", address: "", district: "", city: "", postal_code: "" });
    const [rotatingStudent, setRotatingStudent] = useState(false);
    const [rotatingTeacher, setRotatingTeacher] = useState(false);
    const [copiedCode, setCopiedCode] = useState<"student" | "teacher" | null>(null);

    /* ── Fetch extended profile fields in background ── */
    useEffect(() => {
        if (!user?.id) return;
        fetchMyProfile()
            .then(data => {
                setMember(data);
                // Override with fresh backend data
                setDisplayName(data.display_name || data.full_name || user?.display_name || user?.full_name || "");
                const p = { full_name: data.full_name || "", phone: data.phone || "" };
                setPersonal(p); setPersonalDraft(p);
                const hr = data.hourly_rate != null ? String(data.hourly_rate) : "";
                setProf({ hourly_rate: hr }); setProfDraft({ hourly_rate: hr });
                setSubjectIds(data.subjects_taught ?? []);
            })
            .catch(() => {/* silent — basic fields already seeded from user */})
            .finally(() => setExtendedLoading(false));
    }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    /* ── Load org (admin) ── */
    useEffect(() => {
        if (!isAdmin || !user?.organization_id) return;
        fetch(`/api/organizations/${user.organization_id}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                setOrgData(data);
                setOrgDraft({
                    name: data.name || "", email: data.email || "", phone: data.phone || "",
                    address: data.address || "", district: data.district || "",
                    city: data.city || "", postal_code: data.postal_code || "",
                });
            })
            .catch(() => {});
    }, [isAdmin, user?.organization_id]);

    /* ── Save handlers ── */
    const handleSaveName = useCallback(async () => {
        if (!displayName.trim()) return;
        setSavingName(true);
        try {
            const ok = await patchMe({ display_name: displayName.trim() });
            if (ok) { setMember(p => p ? { ...p, display_name: displayName.trim() } : p); setEditingName(false); }
        } finally { setSavingName(false); }
    }, [displayName]);

    const handleSavePersonal = useCallback(async () => {
        setSavingPersonal(true);
        try {
            const ok = await patchMe({
                full_name: personalDraft.full_name.trim() || undefined,
                phone: personalDraft.phone.trim() || undefined,
            });
            if (ok) { setPersonal({ ...personalDraft }); setEditingPersonal(false); }
        } finally { setSavingPersonal(false); }
    }, [personalDraft]);

    const handleSaveProf = useCallback(async () => {
        setSavingProf(true);
        try {
            const rate = parseFloat(profDraft.hourly_rate);
            const ok = await patchMe({ hourly_rate: isNaN(rate) ? undefined : rate });
            if (ok) { setProf({ ...profDraft }); setEditingProf(false); }
        } finally { setSavingProf(false); }
    }, [profDraft]);

    const handleSaveSubjects = useCallback(async (ids: string[]) => {
        await patchMe({ subjects_taught: ids });
        setMember(p => p ? { ...p, subjects_taught: ids } : p);
    }, []);

    const handleSaveOrg = useCallback(async () => {
        if (!user?.organization_id) return;
        setSavingOrg(true);
        try {
            const body = Object.fromEntries(Object.entries(orgDraft).map(([k, v]) => [k, v.trim() || undefined]));
            const d = await patchOrg(user.organization_id, body);
            if (d) { setOrgData(p => ({ ...p, ...d })); setEditingOrg(false); }
        } finally { setSavingOrg(false); }
    }, [orgDraft, user?.organization_id]);

    const handleOrgLogoUploaded = useCallback(async (url: string) => {
        if (!user?.organization_id) return;
        setOrgData(p => p ? { ...p, logo_url: url } : p);
        await patchOrg(user.organization_id, { logo_url: url });
    }, [user?.organization_id]);

    const handleRotateCode = useCallback(async (type: "student" | "teacher") => {
        if (!user?.organization_id) return;
        type === "student" ? setRotatingStudent(true) : setRotatingTeacher(true);
        try {
            const res = await fetch(`/api/organizations/${user.organization_id}/codes/rotate-${type}`, { method: "POST" });
            if (res.ok) { const d = await res.json(); setOrgData(p => p ? { ...p, ...d } : p); }
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

    return (
        <div className="w-full">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
                <header className="mb-6">
                    <h1 className="text-3xl font-normal font-instrument text-brand-primary">O meu Perfil</h1>
                    <p className="text-sm text-brand-primary/60 mt-1">As tuas informações e configurações.</p>
                </header>

                <div className="flex flex-col lg:flex-row gap-5 items-start">

                    {/* ── Left sidebar ── */}
                    <div className="w-full lg:w-64 lg:shrink-0 lg:sticky lg:top-4 space-y-3">
                        <div className="rounded-2xl border border-brand-primary/[0.07] bg-white p-5 flex flex-col items-center text-center">
                            <div className="mb-4">
                                <AvatarUpload
                                    value={member?.avatar_url ?? user?.avatar_url ?? null}
                                    onUploadComplete={async (url) => {
                                        setMember(p => p ? { ...p, avatar_url: url } : p);
                                        await patchMe({ avatar_url: url });
                                    }}
                                    size="lg" shape="circle" bucket="avatars" pathPrefix="profiles/"
                                />
                            </div>

                            <DisplayNameEditor
                                displayName={displayName || user?.display_name || user?.full_name || ""}
                                fallback={user?.full_name || ""}
                                editing={editingName}
                                saving={savingName}
                                onEdit={() => setEditingName(true)}
                                onChange={setDisplayName}
                                onSave={() => void handleSaveName()}
                                onCancel={() => {
                                    setEditingName(false);
                                    setDisplayName(member?.display_name || member?.full_name || user?.display_name || user?.full_name || "");
                                }}
                            />

                            <p className="text-xs text-brand-primary/40 mb-3 truncate max-w-full px-2">{user?.email}</p>
                            <RoleBadge role={user?.role} />

                            {joinedDate && (
                                <div className="mt-4 pt-4 border-t border-brand-primary/5 w-full flex items-center justify-center gap-1.5 text-[11px] text-brand-primary/35">
                                    <Calendar className="h-3 w-3 shrink-0" /> Membro desde {joinedDate}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={async () => { const s = createClient(); await s.auth.signOut(); router.replace("/login"); }}
                            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-red-200/80 bg-red-50 text-red-500 py-2.5 text-sm font-medium hover:bg-red-100 transition-colors"
                        >
                            <LogOut className="h-3.5 w-3.5" /> Terminar sessão
                        </button>
                    </div>

                    {/* ── Right: sections ── */}
                    <div className="flex-1 min-w-0 space-y-4">

                        {/* Personal */}
                        <SectionCard>
                            <SectionHeader title="Informações Pessoais" editing={editingPersonal} saving={savingPersonal}
                                onEdit={() => { setPersonalDraft({ ...personal }); setEditingPersonal(true); }}
                                onSave={() => void handleSavePersonal()}
                                onCancel={() => { setPersonalDraft({ ...personal }); setEditingPersonal(false); }}
                            />
                            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Field label="Nome completo" value={editingPersonal ? personalDraft.full_name : personal.full_name}
                                    editing={editingPersonal} onChange={v => setPersonalDraft(d => ({ ...d, full_name: v }))} />
                                <ReadOnlyField label="Email" value={user?.email} />
                                <Field label="Telefone" value={editingPersonal ? personalDraft.phone : personal.phone}
                                    editing={editingPersonal} onChange={v => setPersonalDraft(d => ({ ...d, phone: v }))}
                                    type="tel" placeholder="+351 900 000 000" />
                            </div>
                        </SectionCard>

                        {/* Professional */}
                        <SectionCard>
                            <SectionHeader title="Informação Profissional" editing={editingProf} saving={savingProf}
                                onEdit={() => { setProfDraft({ ...prof }); setEditingProf(true); }}
                                onSave={() => void handleSaveProf()}
                                onCancel={() => { setProfDraft({ ...prof }); setEditingProf(false); }}
                            />
                            <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {extendedLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-brand-primary/30">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>A carregar...</span>
                                    </div>
                                ) : (
                                    <Field label="Valor hora (€)"
                                        value={editingProf ? profDraft.hourly_rate : (prof.hourly_rate ? `${parseFloat(prof.hourly_rate).toFixed(2)}` : "")}
                                        editing={editingProf} onChange={v => setProfDraft(d => ({ ...d, hourly_rate: v }))}
                                        type="number" placeholder="ex: 15.00" />
                                )}
                            </div>
                        </SectionCard>

                        {/* Subjects */}
                        <ProfileSubjectsPicker
                            selectedIds={subjectIds}
                            onChange={setSubjectIds}
                            role={isAdmin ? "admin" : "teacher"}
                            onSave={handleSaveSubjects}
                        />

                        {/* Organization (admin only) */}
                        {isAdmin && orgData && (
                            <>
                                <SectionCard>
                                    <SectionHeader title="Centro de Estudos" editing={editingOrg} saving={savingOrg}
                                        onEdit={() => {
                                            setOrgDraft({
                                                name: orgData.name || "", email: orgData.email || "",
                                                phone: orgData.phone || "", address: orgData.address || "",
                                                district: orgData.district || "", city: orgData.city || "",
                                                postal_code: orgData.postal_code || "",
                                            });
                                            setEditingOrg(true);
                                        }}
                                        onSave={() => void handleSaveOrg()}
                                        onCancel={() => setEditingOrg(false)}
                                    />
                                    <div className="px-5 py-4 space-y-4">
                                        <div className="flex items-center gap-4 pb-4 border-b border-brand-primary/5">
                                            <AvatarUpload value={orgData.logo_url || null} onUploadComplete={handleOrgLogoUploaded}
                                                size="sm" shape="rounded" bucket="avatars" pathPrefix="org-logos/" />
                                            <div>
                                                <p className="text-sm font-medium text-brand-primary">{orgData.name || "—"}</p>
                                                <p className="text-xs text-brand-primary/40">Logótipo do centro</p>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <Field label="Nome do centro" value={editingOrg ? orgDraft.name : orgData.name || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, name: v }))} />
                                            <Field label="Email" value={editingOrg ? orgDraft.email : orgData.email || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, email: v }))} type="email" />
                                            <Field label="Telefone" value={editingOrg ? orgDraft.phone : orgData.phone || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, phone: v }))} type="tel" />
                                            <div>
                                                <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider mb-1.5">Distrito</p>
                                                {editingOrg ? (
                                                    <ProfileFieldSelect value={orgDraft.district} onChange={v => setOrgDraft(d => ({ ...d, district: v }))}
                                                        options={PT_DISTRICTS.map(d => ({ value: d, label: d }))} placeholder="Selecionar distrito" />
                                                ) : (
                                                    <p className="text-sm text-brand-primary">{orgData.district || <span className="text-brand-primary/25 italic">—</span>}</p>
                                                )}
                                            </div>
                                            <Field label="Cidade" value={editingOrg ? orgDraft.city : orgData.city || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, city: v }))} />
                                            <Field label="Morada" value={editingOrg ? orgDraft.address : orgData.address || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, address: v }))} />
                                            <Field label="Código Postal" value={editingOrg ? orgDraft.postal_code : orgData.postal_code || ""}
                                                editing={editingOrg} onChange={v => setOrgDraft(d => ({ ...d, postal_code: v }))} />
                                        </div>
                                    </div>
                                </SectionCard>

                                {/* Enrollment codes */}
                                <SectionCard>
                                    <SectionTitle title="Códigos de Inscrição" />
                                    <div className="px-5 py-4 space-y-4">
                                        {([
                                            { type: "student" as const, label: "Alunos", icon: GraduationCap, code: orgData.student_enrollment_code, rotating: rotatingStudent },
                                            { type: "teacher" as const, label: "Professores", icon: Users, code: orgData.teacher_enrollment_code, rotating: rotatingTeacher },
                                        ] as const).map(({ type, label, icon: Icon, code, rotating }) => (
                                            <div key={type}>
                                                <div className="flex items-center gap-1.5 mb-2">
                                                    <Icon className="h-3.5 w-3.5 text-brand-primary/35" />
                                                    <p className="text-[11px] font-medium text-brand-primary/40 uppercase tracking-wider">Código de {label}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <code className="flex-1 bg-brand-primary/[0.04] border border-brand-primary/10 px-3 py-2 rounded-xl text-xs font-mono text-brand-primary truncate">
                                                        {code || "—"}
                                                    </code>
                                                    <button onClick={() => handleCopy(code, type)}
                                                        className="h-9 w-9 rounded-xl bg-brand-primary/[0.04] border border-brand-primary/10 flex items-center justify-center text-brand-primary/35 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0">
                                                        {copiedCode === type ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                                                    </button>
                                                    <button onClick={() => void handleRotateCode(type)} disabled={rotating}
                                                        className="h-9 w-9 rounded-xl bg-brand-primary/[0.04] border border-brand-primary/10 flex items-center justify-center text-brand-primary/35 hover:bg-brand-primary/[0.08] hover:text-brand-primary transition-all shrink-0 disabled:opacity-40">
                                                        {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                        <p className="text-[10px] text-brand-primary/30 pt-1">
                                            Partilha estes códigos para que alunos e professores se possam inscrever no teu centro.
                                        </p>
                                    </div>
                                </SectionCard>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

"use client";

import React from "react";
import { useRouter, usePathname } from "next/navigation";
import {
    X,
    LayoutDashboard,
    LogOut,
    CalendarDays,
    Building2,
    ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { RoleBadge } from "@/components/ui/role-badge";
import { createClient } from "@/lib/supabase/client";

interface StudentSidebarProps {
    open: boolean;
    onToggle: () => void;
    user?: any;
    isMobile?: boolean;
}

export function StudentSidebar({
    open,
    onToggle,
    user,
    isMobile = false,
}: StudentSidebarProps) {
    const router = useRouter();
    const pathname = usePathname();

    const navItems = [
        { label: "Painel", href: "/student", icon: LayoutDashboard },
        { label: "Sessões", href: "/student/sessions", icon: CalendarDays },
        { label: "TPC", href: "/student/assignments", icon: ClipboardList },
    ];

    const handleNavigate = (path: string) => {
        router.push(path);
        if (isMobile && open) {
            onToggle();
        }
    };

    const handleSignOut = async () => {
        try {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.replace("/login");
            router.refresh();
        } catch (error) {
            console.error("Failed to sign out", error);
        }
    };

    return (
        <>
            {/* Backdrop for mobile */}
            {isMobile && open && (
                <div
                    className="fixed inset-0 bg-black/50 z-30"
                    onClick={onToggle}
                />
            )}

            <aside
                className={cn(
                    "fixed left-0 top-0 h-full z-40 overflow-hidden transition-[width] duration-200 ease-in-out bg-[#0d2f7f]",
                    isMobile && !open ? "pointer-events-none" : "",
                    open ? "w-48" : "w-16",
                    isMobile && open && "w-full"
                )}
                style={{ fontFamily: "var(--font-satoshi)" }}
            >
                <div className="flex flex-col h-full min-h-0 text-[#f6f3ef]">
                    {/* Organization Header */}
                    <div className="h-auto py-5 flex items-start px-4 shrink-0">
                        <div className="flex items-start gap-3 overflow-hidden">
                            <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center shrink-0 text-white/80 mt-1 overflow-hidden">
                                {user?.organization_logo_url ? (
                                    <Image
                                        src={user.organization_logo_url}
                                        alt={user?.organization_name || "Org"}
                                        width={32}
                                        height={32}
                                        className="object-cover h-full w-full"
                                    />
                                ) : (
                                    <Building2 className="h-5 w-5" />
                                )}
                            </div>
                            <div
                                className={cn(
                                    "flex flex-col transition-opacity duration-200 min-w-0",
                                    open ? "opacity-100" : "opacity-0 w-0 hidden"
                                )}
                            >
                                <span className="text-sm font-bold text-white truncate leading-tight mb-1">
                                    {user?.organization_name || "Minha Escola"}
                                </span>
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] text-white/60 tracking-wider">
                                        powered by
                                    </span>
                                    <div className="relative h-3 w-3">
                                        <Image
                                            src="/lusia-symbol.png"
                                            alt="Lusia"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span className="text-[10px] text-white font-lusia leading-none">
                                        LUSIA
                                    </span>
                                </div>
                            </div>
                        </div>
                        {isMobile && open && (
                            <button
                                onClick={onToggle}
                                className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto"
                                aria-label="Close menu"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        )}
                    </div>

                    {/* Navigation Items */}
                    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
                        {navItems.map((item) => {
                            const isActive =
                                item.href === "/student"
                                    ? pathname === "/student"
                                    : pathname?.startsWith(item.href);
                            return (
                                <button
                                    key={item.href}
                                    onClick={() => handleNavigate(item.href)}
                                    className={cn(
                                        "w-full flex items-center rounded-lg px-2 py-2 text-sm transition-colors duration-200 group relative",
                                        isActive
                                            ? "bg-white/10 text-white"
                                            : "text-[#bfe6ff] hover:bg-white/5 hover:text-white",
                                        !open && "justify-center px-0"
                                    )}
                                    title={!open ? item.label : undefined}
                                >
                                    <item.icon className="h-5 w-5 shrink-0" />
                                    <span
                                        className={cn(
                                            "ml-3 overflow-hidden whitespace-nowrap transition-all duration-200",
                                            open
                                                ? "opacity-100 w-auto"
                                                : "opacity-0 w-0 hidden"
                                        )}
                                    >
                                        {item.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Footer / User Profile */}
                    <div className="p-3 shrink-0">
                        <div
                            className={cn(
                                "flex items-center gap-3",
                                !open && "justify-center"
                            )}
                        >
                            <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden ring-0">
                                {user?.avatar_url ? (
                                    <Image
                                        src={user.avatar_url}
                                        alt="User"
                                        width={36}
                                        height={36}
                                        className="object-cover h-full w-full"
                                    />
                                ) : (
                                    <span className="text-sm font-bold text-white">
                                        {user?.full_name?.charAt(0) ||
                                            user?.email?.charAt(0) ||
                                            "A"}
                                    </span>
                                )}
                            </div>

                            {open && (
                                <div className="flex flex-col min-w-0 flex-1">
                                    <span className="text-sm font-medium text-white truncate leading-none mb-1">
                                        {user?.display_name ||
                                            user?.full_name ||
                                            "Aluno"}
                                    </span>
                                    <div className="flex items-center justify-between">
                                        <RoleBadge
                                            role={user?.role}
                                            className="scale-90 origin-left border-none"
                                        />
                                        <button
                                            onClick={handleSignOut}
                                            className="text-white/60 hover:text-white transition-colors"
                                            title="Sair"
                                        >
                                            <LogOut className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </aside>
        </>
    );
}

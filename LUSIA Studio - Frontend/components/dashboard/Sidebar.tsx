"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  X,
  LogOut,
  GraduationCap,
  Users,
  Building2,
  CalendarDays,
  FolderOpen,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { RoleBadge } from "@/components/ui/role-badge";
import { createClient } from "@/lib/supabase/client";

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
  user?: any;
  isMobile?: boolean;
  onHoverChange?: (hovered: boolean) => void;
}

export function Sidebar({
  open,
  onToggle,
  user,
  isMobile = false,
  onHoverChange,
}: SidebarProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Desktop: hover-to-expand
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatingRef = useRef(false);

  const isExpanded = isMobile ? open : hoverOpen;

  const toggleWithLock = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setHoverOpen((v) => {
      const next = !v;
      onHoverChange?.(next);
      return next;
    });
    setTimeout(() => { animatingRef.current = false; }, 240);
  }, [onHoverChange]);

  const handleMouseEnter = useCallback(() => {
    if (isMobile || hoverOpen) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => toggleWithLock(), 80);
  }, [isMobile, hoverOpen, toggleWithLock]);

  const handleMouseLeave = useCallback(() => {
    if (isMobile || !hoverOpen) return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => toggleWithLock(), 120);
  }, [isMobile, hoverOpen, toggleWithLock]);

  // Navigation Items
  const navItems = [
    { label: "Calendário", href: "/dashboard/calendar", icon: CalendarDays },
    { label: "Turmas", href: "/dashboard/classes", icon: Users },
    { label: "Alunos", href: "/dashboard/students", icon: GraduationCap },
    { label: "Meus Materiais", href: "/dashboard/docs", icon: FolderOpen },
    { label: "TPCs", href: "/dashboard/assignments", icon: ClipboardList },
    ...(user?.role === "admin"
      ? [{ label: "Professores", href: "/dashboard/teachers", icon: Users }]
      : []),
  ];

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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed left-0 top-0 h-full [height:100dvh] z-40 overflow-hidden bg-[#0d2f7f] flex flex-col",
          // Desktop: width transition
          !isMobile && "transition-[width] duration-200 ease-in-out",
          !isMobile && (isExpanded ? "w-48" : "w-16"),
          // Mobile: translate transition (same as StudentSidebar)
          isMobile && "transition-transform duration-300 ease-in-out w-72",
          isMobile && (open ? "translate-x-0" : "-translate-x-full"),
        )}
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        <div className="flex flex-col h-full min-h-0 text-[#f6f3ef]">

          {/* Organization Header */}
          <div className="h-auto py-5 flex items-start px-4 shrink-0">
            <div className="flex items-start gap-3 min-w-0 shrink-0">
              <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center shrink-0 text-white/80 mt-1 overflow-hidden">
                {user?.organization_logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.organization_logo_url}
                    alt={user?.organization_name || "Org"}
                    className="object-cover h-full w-full"
                  />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>
              <div
                className={cn(
                  "flex flex-col transition-opacity duration-200 min-w-0",
                  isExpanded ? "opacity-100" : "opacity-0 w-0 hidden",
                )}
              >
                <span className="text-sm font-bold text-white truncate leading-tight mb-1">
                  {user?.organization_name || "Minha Escola"}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-white/60 tracking-wider">powered by</span>
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
            {/* Close button for mobile */}
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
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={isMobile && open ? onToggle : undefined}
                  className={cn(
                    "w-full flex items-center rounded-lg px-2 py-2 text-sm transition-colors duration-200 group relative",
                    isActive ? "bg-white/10 text-white" : "text-[#bfe6ff] hover:bg-white/5 hover:text-white",
                    !isExpanded && "justify-center px-0"
                  )}
                  title={!isExpanded ? item.label : undefined}
                  prefetch={true}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={cn(
                      "ml-3 whitespace-nowrap transition-opacity duration-200",
                      isExpanded ? "opacity-100" : "opacity-0 w-0 hidden"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Footer / User Profile */}
          <div className="p-3 shrink-0">
            <div className={cn("flex items-center gap-3", !isExpanded && "justify-center")}>
              {/* Avatar → links to profile */}
              <Link
                href="/dashboard/profile"
                onClick={isMobile && open ? onToggle : undefined}
                className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden hover:ring-2 hover:ring-white/30 transition-all"
                title="Ver perfil"
              >
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="User" className="object-cover h-full w-full" />
                ) : (
                  <span className="text-sm font-bold text-white">{user?.full_name?.charAt(0) || user?.email?.charAt(0) || "P"}</span>
                )}
              </Link>

              {isExpanded && (
                <div className="flex flex-col min-w-0 flex-1">
                  <Link
                    href="/dashboard/profile"
                    onClick={isMobile && open ? onToggle : undefined}
                    className="text-sm font-medium text-white truncate leading-none mb-1 hover:text-white/80 transition-colors"
                  >
                    {user?.display_name || user?.full_name || "Professor"}
                  </Link>
                  <div className="flex items-center justify-between">
                    <RoleBadge role={user?.role} className="scale-90 origin-left border-none" />
                    <button onClick={handleSignOut} className="text-white/60 hover:text-white transition-colors" title="Sair">
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

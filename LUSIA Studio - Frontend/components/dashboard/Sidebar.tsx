"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X, Building2 } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Home03Icon,
  Calendar03Icon,
  StudentsIcon,
  GlassesIcon,
  Books02Icon,
  AssignmentsIcon,
  AnalyticsUpIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { RoleBadge } from "@/components/ui/role-badge";
import { prefetchTeacherRouteData } from "@/lib/route-prefetch";

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

  const dataPrefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNavPrefetch = useCallback(
    (href: string, immediate?: boolean) => {
      void router.prefetch(href);
      if (dataPrefetchTimerRef.current) clearTimeout(dataPrefetchTimerRef.current);
      if (immediate) {
        void prefetchTeacherRouteData(href, user);
      } else {
        dataPrefetchTimerRef.current = setTimeout(() => {
          void prefetchTeacherRouteData(href, user);
        }, 250);
      }
    },
    [router, user],
  );

  // Navigation Items
  const navItems = [
    { label: "Painel", href: "/dashboard", icon: Home03Icon },
    { label: "Calendário", href: "/dashboard/calendar", icon: Calendar03Icon },
    { label: "Alunos", href: "/dashboard/students", icon: StudentsIcon },
    ...(user?.role === "admin"
      ? [{ label: "Professores", href: "/dashboard/teachers", icon: GlassesIcon }]
      : []),
    { label: "Meus Materiais", href: "/dashboard/docs", icon: Books02Icon },
    { label: "TPCs", href: "/dashboard/assignments", icon: AssignmentsIcon },
    ...(user?.role === "admin"
      ? [{ label: "Financeiro", href: "/dashboard/analytics", icon: AnalyticsUpIcon }]
      : []),
  ];

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
          !isMobile && "transition-[width] duration-200 ease-in-out",
          !isMobile && (isExpanded ? "w-48" : "w-16"),
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
                    <Image src="/lusia-symbol.png" alt="Lusia" fill className="object-contain" />
                  </div>
                  <span className="text-[10px] text-white font-lusia leading-none">LUSIA</span>
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
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={isMobile && open ? onToggle : undefined}
                  onMouseEnter={() => handleNavPrefetch(item.href)}
                  onFocus={() => handleNavPrefetch(item.href)}
                  onTouchStart={() => handleNavPrefetch(item.href, true)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg pl-[14px] py-2 text-sm transition-colors duration-200 group relative",
                    isActive ? "bg-white/10 text-white" : "text-[#bfe6ff] hover:bg-white/5 hover:text-white",
                  )}
                  title={!isExpanded ? item.label : undefined}
                  prefetch={true}
                >
                  <HugeiconsIcon icon={item.icon} size={20} color="currentColor" strokeWidth={2} className="shrink-0" />
                  <span
                    className={cn(
                      "whitespace-nowrap transition-opacity duration-200",
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
          <div className="p-2 shrink-0 space-y-1">
            <Link
              href="/dashboard/profile"
              onClick={isMobile && open ? onToggle : undefined}
              onMouseEnter={() => handleNavPrefetch("/dashboard/profile")}
              onFocus={() => handleNavPrefetch("/dashboard/profile")}
              onTouchStart={() => handleNavPrefetch("/dashboard/profile", true)}
              className={cn(
                "flex items-center gap-3 rounded-lg pl-[14px] py-2 transition-colors duration-200",
                pathname === "/dashboard/profile"
                  ? "bg-white/10 text-white"
                  : "text-[#bfe6ff] hover:bg-white/5 hover:text-white",
              )}
              title={!isExpanded ? "Ver perfil" : undefined}
              prefetch={true}
            >
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden">
                  {user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.avatar_url} alt="User" className="object-cover h-full w-full" />
                  ) : (
                    <span className="text-sm font-bold text-white">{user?.full_name?.charAt(0) || user?.email?.charAt(0) || "P"}</span>
                  )}
                </div>
              {isExpanded && (
                <div className="flex flex-col min-w-0 flex-1 pr-2">
                  <span className="text-sm font-medium text-white truncate leading-none mb-1">
                    {user?.display_name || user?.full_name || "Professor"}
                  </span>
                  <RoleBadge role={user?.role} className="scale-90 origin-left" />
                </div>
              )}
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}

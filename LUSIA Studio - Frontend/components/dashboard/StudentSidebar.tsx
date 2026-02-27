"use client";

import React, { useMemo, useState, useRef, useCallback } from "react";
import {
  X,
  LayoutDashboard,
  LogOut,
  CalendarDays,
  Building2,
  ClipboardList,
  Calculator,
  UserCircle,
  MessageSquare,
  Plus,
  Search,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { RoleBadge } from "@/components/ui/role-badge";
import { createClient } from "@/lib/supabase/client";
import { useRouter, usePathname } from "next/navigation";
import {
  useChatSessions,
  type Conversation,
} from "@/components/providers/ChatSessionsProvider";

/* ── Date grouping ── */

type DateGroup = { label: string; conversations: Conversation[] };

function groupByDate(conversations: Conversation[]): DateGroup[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const groups = {
    hoje: [] as Conversation[],
    semana: [] as Conversation[],
    outros: [] as Conversation[],
  };

  for (const c of conversations) {
    const d = new Date(c.updated_at || c.created_at);
    if (d >= today) groups.hoje.push(c);
    else if (d >= weekAgo) groups.semana.push(c);
    else groups.outros.push(c);
  }

  const result: DateGroup[] = [];
  if (groups.hoje.length)
    result.push({ label: "Hoje", conversations: groups.hoje });
  if (groups.semana.length)
    result.push({ label: "Esta Semana", conversations: groups.semana });
  if (groups.outros.length)
    result.push({ label: "Anteriores", conversations: groups.outros });
  return result;
}

/* ── Nav items ── */

const navItems = [
  { label: "Painel", href: "/student", icon: LayoutDashboard },
  { label: "Chat IA", href: "/student/chat", icon: MessageSquare },
  { label: "Médias", href: "/student/grades", icon: Calculator },
  { label: "Sessões", href: "/student/sessions", icon: CalendarDays },
  { label: "TPC", href: "/student/assignments", icon: ClipboardList },
  { label: "Perfil", href: "/student/profile", icon: UserCircle },
];

/* ── Main Component ── */

interface StudentSidebarProps {
  user?: any;
  isMobile: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onHoverChange?: (hovered: boolean) => void;
}

export function StudentSidebar({
  user,
  isMobile,
  mobileOpen,
  onMobileClose,
  onHoverChange,
}: StudentSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const {
    conversations,
    activeId,
    setActiveId,
    createConversation,
    deleteConversation,
  } = useChatSessions();

  const [search, setSearch] = useState("");
  const [conversationsOpen, setConversationsOpen] = useState(true);

  // Desktop hover-to-open
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animatingRef = useRef(false);

  const open = isMobile ? mobileOpen : hoverOpen;

  const toggleWithLock = useCallback(() => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setHoverOpen((v) => {
      const next = !v;
      onHoverChange?.(next);
      return next;
    });
    setTimeout(() => {
      animatingRef.current = false;
    }, 240);
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

  // Filtered + grouped conversations
  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.title?.toLowerCase().includes(q) ?? false,
    );
  }, [conversations, search]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const handleSignOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
    } catch (error) {
      console.error("Failed to sign out", error);
    }
  };

  const handleNewConversation = useCallback(async () => {
    setActiveId(null);
    router.push("/student/chat");
    if (isMobile) onMobileClose();
  }, [setActiveId, router, isMobile, onMobileClose]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id);
      router.push("/student/chat");
      if (isMobile) onMobileClose();
    },
    [setActiveId, router, isMobile, onMobileClose],
  );

  const handleDeleteConversation = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      await deleteConversation(id);
    },
    [deleteConversation],
  );

  return (
    <>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30"
          onClick={onMobileClose}
        />
      )}

      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "fixed left-0 top-0 z-40 overflow-hidden bg-[#0d2f7f]",
          "h-full [height:100dvh]",
          "flex flex-col",
          // Desktop
          !isMobile && "transition-[width] duration-200 ease-in-out",
          !isMobile && (open ? "w-64" : "w-16"),
          // Mobile
          isMobile && "transition-transform duration-300 ease-in-out w-72",
          isMobile && (mobileOpen ? "translate-x-0" : "-translate-x-full"),
        )}
        style={{ fontFamily: "var(--font-satoshi)" }}
      >
        <div className="flex flex-col h-full [height:100dvh] min-h-0 text-[#f6f3ef]">
          {/* ── Header ── */}
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
                  open ? "opacity-100" : "opacity-0 w-0 hidden",
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
            {isMobile && mobileOpen && (
              <button
                onClick={onMobileClose}
                className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors ml-auto"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>

          {/* ── Navigation ── */}
          <div className="px-2 mb-1 space-y-0.5 shrink-0">
            {navItems.map((item) => {
              const isActive =
                item.href === "/student"
                  ? pathname === "/student"
                  : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={isMobile && mobileOpen ? onMobileClose : undefined}
                  className={cn(
                    "w-full flex items-center rounded-lg px-2 py-2 text-sm transition-colors duration-200",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-[#bfe6ff] hover:bg-white/5 hover:text-white",
                    !open && "justify-center px-0",
                  )}
                  title={!open ? item.label : undefined}
                  prefetch={true}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <span
                    className={cn(
                      "ml-3 whitespace-nowrap transition-opacity duration-200",
                      open ? "opacity-100" : "opacity-0 w-0 hidden",
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* ── New Conversation ── */}
          <div
            className={cn("px-2 mb-2 shrink-0", !open && "flex justify-center")}
          >
            <button
              onClick={handleNewConversation}
              className={cn(
                "flex items-center rounded-lg transition-colors",
                open
                  ? "w-full gap-2 px-2.5 py-2 bg-white/10 hover:bg-white/15 text-sm text-white"
                  : "h-9 w-9 justify-center bg-white/10 hover:bg-white/15 text-white",
              )}
              title="Nova Conversa"
            >
              <Plus className="h-4 w-4 shrink-0" />
              {open && <span>Nova Conversa</span>}
            </button>
          </div>

          {/* ── Search (only when open) ── */}
          {open && (
            <div className="px-2 mb-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Procurar..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            </div>
          )}

          {/* ── Conversations ── */}
          <div className="flex-1 overflow-y-auto px-2 pb-2 chat-sidebar-scroll min-h-0">
            {open && (
              <>
                <button
                  onClick={() => setConversationsOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-[#bfe6ff]/50 hover:text-[#bfe6ff]/70 transition-colors w-full"
                >
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 transition-transform",
                      !conversationsOpen && "-rotate-90",
                    )}
                  />
                  Conversas
                </button>

                {conversationsOpen && (
                  <div className="space-y-3">
                    {groups.length === 0 && (
                      <p className="text-xs text-white/25 text-center py-6 px-2">
                        {search
                          ? "Sem resultados"
                          : "As tuas conversas aparecerão aqui."}
                      </p>
                    )}

                    {groups.map((group) => (
                      <div key={group.label}>
                        <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-[#bfe6ff]/40">
                          {group.label}
                        </p>
                        <div className="space-y-0.5">
                          {group.conversations.map((conv) => (
                            <div
                              key={conv.id}
                              className={cn(
                                "group flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm cursor-pointer transition-colors",
                                activeId === conv.id
                                  ? "bg-white/10 text-white"
                                  : "text-white/70 hover:bg-white/5 hover:text-white",
                              )}
                              onClick={() => handleSelectConversation(conv.id)}
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-40" />
                              <span className="flex-1 truncate text-[13px]">
                                {conv.title || "Nova conversa"}
                              </span>
                              <button
                                onClick={(e) =>
                                  handleDeleteConversation(e, conv.id)
                                }
                                className="opacity-0 group-hover:opacity-100 h-6 w-6 flex items-center justify-center rounded-md hover:bg-red-500/20 hover:text-red-300 text-white/30 transition-all"
                                title="Apagar"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="p-3 shrink-0">
            <div
              className={cn(
                "flex items-center gap-3",
                !open && "justify-center",
              )}
            >
              <Link
                href="/student/profile"
                onClick={isMobile && mobileOpen ? onMobileClose : undefined}
                className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center shrink-0 overflow-hidden ring-0 hover:ring-2 hover:ring-white/30 transition-all"
                title="Ver perfil"
              >
                {user?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="User" className="object-cover h-full w-full" />
                ) : (
                  <span className="text-sm font-bold text-white">
                    {user?.full_name?.charAt(0) ||
                      user?.email?.charAt(0) ||
                      "A"}
                  </span>
                )}
              </Link>

              {open && (
                <div className="flex flex-col min-w-0 flex-1">
                  <Link
                    href="/student/profile"
                    onClick={isMobile && mobileOpen ? onMobileClose : undefined}
                    className="text-sm font-medium text-white truncate leading-none mb-1 hover:text-white/80 transition-colors"
                  >
                    {user?.display_name || user?.full_name || "Aluno"}
                  </Link>
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

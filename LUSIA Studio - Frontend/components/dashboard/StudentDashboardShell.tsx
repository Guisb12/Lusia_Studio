"use client";

import React, { useState, useEffect } from "react";
import { StudentSidebar } from "./StudentSidebar";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudentDashboardShellProps {
  children: React.ReactNode;
  user: any;
}

export function StudentDashboardShell({
  children,
  user,
}: StudentDashboardShellProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) setMobileMenuOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const sidebarExpanded = isMobile ? mobileMenuOpen : sidebarHovered;

  const frame = 8;
  const leftOffset = sidebarExpanded ? (isMobile ? "0px" : "16rem") : "4rem";
  const frameColor = "#0d2f7f";
  const borderRadius = 24;

  return (
    <div className="fixed inset-0 flex flex-col bg-[#f6f3ef] overflow-hidden font-satoshi text-[#15316b]">
      {/* Mobile Menu Button */}
      {isMobile && !mobileMenuOpen && (
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="fixed top-4 left-4 z-50 h-10 w-10 rounded-lg bg-[#0d2f7f] border border-white/10 flex items-center justify-center text-white hover:bg-[#1f3f93] transition-colors shadow-md"
          aria-label="Open menu"
        >
          <Menu className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar */}
      <StudentSidebar
        user={user}
        isMobile={isMobile}
        mobileOpen={mobileMenuOpen}
        onMobileClose={() => setMobileMenuOpen(false)}
        onHoverChange={setSidebarHovered}
      />

      {/* Frame (Desktop Only) — single div with box-shadow + clip-path */}
      {!isMobile && (
        <div
          className="fixed z-30 pointer-events-none transition-all duration-200 ease-in-out"
          style={{
            left: leftOffset,
            top: frame,
            right: frame,
            bottom: frame,
            borderRadius: `${borderRadius - frame}px`,
            boxShadow: `0 0 0 ${frame}px ${frameColor}, 0 0 0 200px ${frameColor}`,
            clipPath: `inset(-${frame}px)`,
          }}
        />
      )}

      {/* Main Content Area */}
      <main
        className={cn(
          "flex-1 flex flex-col h-full overflow-hidden transition-all duration-200 ease-in-out",
          !isMobile ? (sidebarExpanded ? "pl-64" : "pl-16") : "",
        )}
      >
        <div
          className={cn(
            "flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden relative",
            !isMobile ? "p-4" : "p-4 pt-16",
          )}
        >
          <div className={cn("h-full w-full rounded-2xl", !isMobile && "p-2")}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sidebar } from "./Sidebar";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { GlowEffect } from "@/components/ui/glow-effect";
import { useGlowEffect } from "@/components/providers/GlowEffectProvider";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
    children: React.ReactNode;
    user: any;
}

const ACCENT_GLOW_COLORS = ["#0a1bb6", "#3b5bdb", "#0a1bb6", "#5c7cfa"];
const ERROR_GLOW_COLORS = ["#dc2626", "#ef4444", "#dc2626", "#f87171"];

export function DashboardShell({ children, user }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);
    const { glowStatus } = useGlowEffect();

    // Desktop check
    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            // On desktop, sidebar starts collapsed (controlled by hover)
            if (!mobile) {
                setSidebarOpen(false);
            } else {
                setSidebarOpen(false);
            }
        };
        checkMobile(); // Initial check
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    const handleToggleSidebar = () => setSidebarOpen((prev) => !prev);

    // For desktop, use hover state; for mobile, use open state
    const sidebarExpanded = isMobile ? sidebarOpen : sidebarHovered;

    // Frame parameters
    const frame = 8;
    const leftOffset = sidebarExpanded ? (isMobile ? "0px" : "12rem") : "4rem";
    const frameColor = "#0d2f7f";
    const borderRadius = 24;

    return (
        <div className="fixed inset-0 flex flex-col bg-[#f6f3ef] overflow-hidden font-satoshi text-[#15316b]">
            {/* Mobile Menu Button */}
            {isMobile && !sidebarOpen && (
                <button
                    onClick={handleToggleSidebar}
                    className="fixed top-4 left-4 z-50 h-10 w-10 rounded-lg bg-[#0d2f7f] border border-white/10 flex items-center justify-center text-white hover:bg-[#1f3f93] transition-colors shadow-md"
                    aria-label="Open menu"
                >
                    <Menu className="h-6 w-6" />
                </button>
            )}

            {/* Sidebar */}
            <Sidebar
                open={sidebarOpen}
                onToggle={handleToggleSidebar}
                user={user}
                isMobile={isMobile}
                onHoverChange={setSidebarHovered}
            />

            {/* Frame (Desktop Only) — single div, border + spread box-shadow for edges */}
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

            {/* AI Glow — blurred duplicate of the shell border, behind the frame */}
            {/* TODO: TEMP always-on for testing — revert condition to: glowStatus !== "idle" */}
            {!isMobile && (
                <AnimatePresence>
                    {glowStatus !== "idle" && (
                        <motion.div
                            className="fixed pointer-events-none z-[29]"
                            style={{
                                left: `calc(${leftOffset} - ${frame}px)`,
                                top: 0,
                                right: 0,
                                bottom: 0,
                                borderRadius: `${borderRadius}px`,
                                boxShadow: glowStatus === "error"
                                    ? `inset 0 0 30px 10px #ef4444, inset 0 0 60px 20px #dc2626, inset 0 0 100px 40px rgba(239,68,68,0.5), 0 0 30px 10px #ef4444, 0 0 60px 20px #dc2626, 0 0 100px 40px rgba(239,68,68,0.5)`
                                    : `inset 0 0 30px 10px #3b5bdb, inset 0 0 60px 20px #5c7cfa, inset 0 0 100px 40px rgba(59,91,219,0.5), 0 0 30px 10px #3b5bdb, 0 0 60px 20px #5c7cfa, 0 0 100px 40px rgba(59,91,219,0.5)`,
                                willChange: "opacity",
                                transition: "left 200ms ease-in-out",
                            }}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                            exit={{ opacity: 0, transition: { duration: 0.5 } }}
                        />
                    )}
                </AnimatePresence>
            )}

            {/* Main Content Area */}
            <main
                className={cn(
                    "flex-1 flex flex-col h-full overflow-hidden transition-all duration-200 ease-in-out",
                    !isMobile ? (sidebarExpanded ? "pl-48" : "pl-16") : ""
                )}
            >
                <div className={cn(
                    "flex-1 min-h-0 w-full overflow-hidden relative",
                    !isMobile ? "p-4" : "p-4 pt-16"
                )}>
                    {/* AI glow effect — sits between frame and content */}
                    <div className={cn("h-full w-full rounded-2xl relative", !isMobile && "p-2")}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

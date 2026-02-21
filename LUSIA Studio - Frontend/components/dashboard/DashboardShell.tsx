"use client";

import React, { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface DashboardShellProps {
    children: React.ReactNode;
    user: any;
}

export function DashboardShell({ children, user }: DashboardShellProps) {
    const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed on mobile, open on desktop can be managed
    const [isMobile, setIsMobile] = useState(false);
    const [sidebarHovered, setSidebarHovered] = useState(false);

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

            {/* Frame Borders (Desktop Only) */}
            {!isMobile && (
                <div className="fixed inset-0 z-30 pointer-events-none transition-all duration-200 ease-in-out">
                    {/* Left Border */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute top-0 bottom-0 pointer-events-none"
                        style={{
                            left: `calc(${leftOffset} - ${frame}px)`,
                            width: `${frame}px`,
                            backgroundColor: frameColor,
                        }}
                    />
                    {/* Top Border */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute top-0 right-0 pointer-events-none"
                        style={{
                            left: leftOffset,
                            height: `${frame}px`,
                            backgroundColor: frameColor,
                        }}
                    />
                    {/* Right Border */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute right-0 top-[8px] bottom-[8px] width-[8px] pointer-events-none"
                        style={{
                            width: `${frame}px`,
                            top: frame,
                            bottom: frame,
                            backgroundColor: frameColor,
                        }}
                    />
                    {/* Bottom Border */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute bottom-0 right-0 pointer-events-none"
                        style={{
                            left: leftOffset,
                            height: `${frame}px`,
                            backgroundColor: frameColor,
                        }}
                    />

                    {/* Corner Triangles for "Inverted Radius" effect connecting sidebar to content */}
                    {/* Top-Left Connection */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute pointer-events-none z-20"
                        style={{
                            left: `calc(${leftOffset} - ${frame}px - 1px)`,
                            top: -1,
                            width: 0,
                            height: 0,
                            borderTop: `calc(${frame * 2}px + 4px) solid ${frameColor}`,
                            borderRight: `calc(${frame * 2}px + 4px) solid transparent`,
                        }}
                    />
                    {/* Bottom-Left Connection */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute pointer-events-none z-20"
                        style={{
                            left: `calc(${leftOffset} - ${frame}px - 1px)`,
                            bottom: -1,
                            width: 0,
                            height: 0,
                            borderBottom: `calc(${frame * 2}px + 4px) solid ${frameColor}`,
                            borderRight: `calc(${frame * 2}px + 4px) solid transparent`,
                        }}
                    />
                    {/* Top-Right Connection */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute pointer-events-none z-20"
                        style={{
                            right: -1,
                            top: -1,
                            width: 0,
                            height: 0,
                            borderTop: `calc(${frame * 2}px + 4px) solid ${frameColor}`,
                            borderLeft: `calc(${frame * 2}px + 4px) solid transparent`,
                        }}
                    />
                    {/* Bottom-Right Connection */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute pointer-events-none z-20"
                        style={{
                            right: -1,
                            bottom: -1,
                            width: 0,
                            height: 0,
                            borderBottom: `calc(${frame * 2}px + 4px) solid ${frameColor}`,
                            borderLeft: `calc(${frame * 2}px + 4px) solid transparent`,
                        }}
                    />

                    {/* Inner Rounded Border Overlay */}
                    <div
                        className="transition-all duration-200 ease-in-out absolute pointer-events-none z-10"
                        style={{
                            left: `calc(${leftOffset} - ${frame}px)`,
                            top: 0,
                            right: 0,
                            bottom: 0,
                        }}
                    >
                        <div
                            className="absolute inset-0 box-border"
                            style={{
                                border: `${frame}px solid ${frameColor}`,
                                borderRadius: `${borderRadius}px`,
                            }}
                        />
                    </div>
                </div>
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
                    !isMobile ? "p-4" : "p-4 pt-16" // Add padding on desktop to sit inside the frame, more on mobile for menu button
                )}>
                    {/* Inner padding for aesthetic breathing room inside the frame */}
                    <div className={cn("h-full w-full rounded-2xl", !isMobile && "p-2")}>
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}

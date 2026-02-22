"use client";

import React from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface WizardStepProps {
    role: "lusia" | "user";
    children: React.ReactNode;
    className?: string;
    userAvatar?: string | null;
    userName?: string | null;
    showAvatar?: boolean;
}

export function WizardStep({ role, children, className, userAvatar, userName, showAvatar = true }: WizardStepProps) {
    const isLusia = role === "lusia";

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={cn(
                "flex items-center gap-3 w-full",
                isLusia ? "justify-start" : "justify-end",
            )}
        >
            {isLusia && (
                showAvatar ? (
                    <div className="h-7 w-7 rounded-full shrink-0 overflow-hidden">
                        <Image
                            src="/lusia-symbol.png"
                            alt="LUSIA"
                            width={28}
                            height={28}
                            className="h-full w-full object-cover"
                        />
                    </div>
                ) : (
                    <div className="h-7 w-7 shrink-0" />
                )
            )}
            <div
                className={cn(
                    "max-w-[80%] text-sm font-satoshi leading-snug",
                    isLusia
                        ? "text-brand-primary/75"
                        : "rounded-2xl px-3.5 py-2.5 bg-brand-primary/[0.07] text-brand-primary",
                    className,
                )}
            >
                {children}
            </div>
            {!isLusia && (
                <Avatar className="h-7 w-7 shrink-0">
                    {userAvatar ? (
                        <AvatarImage src={userAvatar} alt={userName || "User"} />
                    ) : null}
                    <AvatarFallback className="text-[10px] font-medium bg-brand-primary/10 text-brand-primary/60">
                        {userName ? userName.charAt(0).toUpperCase() : "U"}
                    </AvatarFallback>
                </Avatar>
            )}
        </motion.div>
    );
}

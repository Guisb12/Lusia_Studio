import * as React from "react"
import { ShieldCheck, BookOpen, GraduationCap, User } from "lucide-react"
import { cn } from "@/lib/utils"

const ROLE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    admin: { label: "Admin", color: "#7c3aed", bg: "#f5f3ff", icon: ShieldCheck },
    teacher: { label: "Professor", color: "#1d4ed8", bg: "#eff6ff", icon: BookOpen },
    student: { label: "Aluno", color: "#059669", bg: "#ecfdf5", icon: GraduationCap },
}

const DEFAULT_CONFIG = { label: "User", color: "#6b7280", bg: "#f9fafb", icon: User }

export interface RoleBadgeProps
    extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'role'> {
    role?: string | null;
}

function RoleBadge({ className, role, style, ...props }: RoleBadgeProps) {
    const config = (role && ROLE_CONFIG[role]) || DEFAULT_CONFIG;
    const Icon = config.icon;

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold select-none",
                className,
            )}
            style={{
                color: config.color,
                backgroundColor: config.bg,
                border: `1px solid ${config.color}`,
                borderBottomWidth: "2px",
                ...style,
            }}
            {...props}
        >
            <Icon className="h-3 w-3" />
            {config.label}
        </span>
    )
}

export { RoleBadge }

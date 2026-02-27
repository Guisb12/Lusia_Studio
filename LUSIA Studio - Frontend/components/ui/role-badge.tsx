import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ring-1 ring-inset transition-colors",
    {
        variants: {
            role: {
                admin:
                    "bg-violet-50 text-violet-700 ring-violet-700/15",
                teacher:
                    "bg-blue-50 text-blue-700 ring-blue-700/10",
                student:
                    "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
                default:
                    "bg-gray-50 text-gray-600 ring-gray-500/10",
            },
        },
        defaultVariants: {
            role: "default",
        },
    }
)

const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    teacher: "Professor",
    student: "Aluno",
}

export interface RoleBadgeProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
    role?: string | null;
}

function RoleBadge({ className, role, ...props }: RoleBadgeProps) {
    const variant = (role === 'admin' || role === 'teacher' || role === 'student') ? role : 'default';
    const label = role ? (ROLE_LABELS[role] ?? role.charAt(0).toUpperCase() + role.slice(1)) : 'User';

    return (
        <div className={cn(badgeVariants({ role: variant }), className)} {...props}>
            {label}
        </div>
    )
}

export { RoleBadge, badgeVariants }

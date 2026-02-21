import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            role: {
                admin:
                    "bg-purple-50 text-purple-700 ring-purple-700/10",
                teacher:
                    "bg-blue-50 text-blue-700 ring-blue-700/10",
                student:
                    "bg-green-50 text-green-700 ring-green-600/20",
                default:
                    "bg-gray-50 text-gray-600 ring-gray-500/10",
            },
        },
        defaultVariants: {
            role: "default",
        },
    }
)

export interface RoleBadgeProps
    extends Omit<React.HTMLAttributes<HTMLDivElement>, 'role'> {
    role?: string | null;
}

function RoleBadge({ className, role, ...props }: RoleBadgeProps) {
    const variant = (role === 'admin' || role === 'teacher' || role === 'student') ? role : 'default';

    const label = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';

    return (
        <div className={cn(badgeVariants({ role: variant }), className)} {...props}>
            {label}
        </div>
    )
}

export { RoleBadge, badgeVariants }

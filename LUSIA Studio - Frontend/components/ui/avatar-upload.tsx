"use client";

import { cn } from "@/lib/utils";
import { Camera, User } from "lucide-react";
import { useRef, useState } from "react";

interface AvatarUploadProps {
    value?: string | null;
    onChange?: (file: File | null, preview: string | null) => void;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const sizeMap = {
    sm: "h-16 w-16",
    md: "h-24 w-24",
    lg: "h-32 w-32",
};

const iconSizeMap = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
};

export function AvatarUpload({
    value,
    onChange,
    size = "md",
    className,
}: AvatarUploadProps) {
    const [preview, setPreview] = useState<string | null>(value ?? null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setPreview(dataUrl);
            onChange?.(file, dataUrl);
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className={cn("relative inline-flex", className)}>
            <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                    "relative rounded-full overflow-hidden border-2 border-dashed border-brand-primary/15",
                    "bg-brand-primary/5 flex items-center justify-center cursor-pointer",
                    "hover:border-brand-accent/30 hover:bg-brand-accent/5 transition-all duration-200 group",
                    sizeMap[size],
                )}
            >
                {preview ? (
                    <img
                        src={preview}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                    />
                ) : (
                    <User className={cn("text-brand-primary/30", iconSizeMap[size])} />
                )}

                {/* Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-all duration-200 rounded-full">
                    <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
                </div>
            </button>

            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
            />
        </div>
    );
}

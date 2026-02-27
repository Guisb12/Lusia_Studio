"use client";

import { cn } from "@/lib/utils";
import { Camera, Loader2, User } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface AvatarUploadProps {
  value?: string | null;
  onUploadComplete?: (url: string) => void;
  /** Called with true when upload starts, false when it finishes (success or error). */
  onUploadingChange?: (uploading: boolean) => void;
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Storage bucket name. Defaults to "avatars". */
  bucket?: string;
  /** Path prefix inside the bucket, e.g. "org-logos/". Defaults to "profiles/". */
  pathPrefix?: string;
  /** Shape variant. Defaults to "circle". */
  shape?: "circle" | "rounded";
}

const sizeMap = {
  sm: "h-16 w-16",
  md: "h-20 w-20",
  lg: "h-28 w-28",
};

const iconSizeMap = {
  sm: "h-6 w-6",
  md: "h-7 w-7",
  lg: "h-9 w-9",
};

export function AvatarUpload({
  value,
  onUploadComplete,
  onUploadingChange,
  size = "md",
  className,
  bucket = "avatars",
  pathPrefix = "profiles/",
  shape = "circle",
}: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(value ?? null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync preview with incoming value prop (e.g. when parent loads avatar async)
  useEffect(() => {
    if (value && value !== preview) {
      setPreview(value);
    }
  }, [value]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    // Upload to Supabase Storage
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        console.error("[AvatarUpload] No authenticated session found — cannot upload.");
        return;
      }

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${pathPrefix}${user.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(path);

      onUploadComplete?.(publicUrl);
    } catch (err) {
      console.error("[AvatarUpload] upload failed:", err);
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

  return (
    <div className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "relative overflow-hidden border-2 border-dashed border-brand-primary/15",
          "bg-brand-primary/[0.04] flex items-center justify-center cursor-pointer",
          "hover:border-brand-accent/30 hover:bg-brand-accent/[0.04] transition-all duration-200 group",
          uploading && "cursor-wait",
          shapeClass,
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
          <User className={cn("text-brand-primary/25", iconSizeMap[size])} />
        )}

        {/* Overlay */}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-5 w-5 text-white animate-spin" />
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/25 transition-all duration-200">
            <Camera className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" />
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
        onChange={(e) => void handleFileChange(e)}
        className="hidden"
      />
    </div>
  );
}

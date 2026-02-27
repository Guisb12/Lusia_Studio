"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarUpload } from "@/components/ui/avatar-upload";


export default function AdminOnboardingPage() {
  const router = useRouter();

  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [fullName, setFullName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/onboarding/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName,
          display_name: displayName || null,
          phone: phone || null,
          avatar_url: avatarUrl || null,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        const detail =
          payload?.detail || payload?.error || "Erro ao guardar perfil.";
        if (
          response.status === 403 &&
          `${detail}`.toLowerCase().includes("not verified")
        ) {
          router.replace("/verify-email");
          return;
        }
        throw new Error(detail);
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col h-dvh">
      {/* ── Sticky header: logo only (single step) ── */}
      <div className="sticky top-0 z-10 bg-brand-bg flex flex-col items-center pt-5 pb-4 border-b border-brand-primary/5">
        <Image
          src="/lusia-symbol.png"
          alt="LUSIA Studio"
          width={36}
          height={36}
          className="h-9 w-9 opacity-50"
          priority
        />
      </div>

      {/* ── Scrollable content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full max-w-sm mx-auto px-6 py-6">
          <h1 className="font-instrument text-xl text-brand-primary mb-1">
            Completa o teu perfil
          </h1>
          <p className="text-xs text-brand-primary/50 mb-5">
            Últimos detalhes antes de começares.
          </p>

          {/* Avatar — centered, below title */}
          <div className="flex flex-col items-center gap-1.5 mb-6">
            <AvatarUpload
              size="lg"
              value={avatarUrl}
              onUploadComplete={(url) => setAvatarUrl(url)}
              onUploadingChange={(u) => setAvatarUploading(u)}
            />
            <span className="text-xs text-brand-primary/35">
              {avatarUrl ? "Alterar avatar" : "Adicionar avatar"}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-2.5 text-sm text-brand-error">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-3">
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nome completo"
              label="Nome completo"
              required
            />
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: Prof. Silva"
              label="Nome de exibição"
            />
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+351 912 345 678"
              label="Telefone"
            />

            <Button
              type="submit"
              loading={loading || avatarUploading}
              disabled={!fullName || avatarUploading}
              className="w-full !mt-5"
            >
              {avatarUploading ? "A carregar foto..." : "Concluir"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}

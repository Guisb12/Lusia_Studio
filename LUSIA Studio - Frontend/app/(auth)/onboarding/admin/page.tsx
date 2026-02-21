"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AvatarUpload } from "@/components/ui/avatar-upload";

export const dynamic = "force-dynamic";

export default function AdminOnboardingPage() {
  const router = useRouter();

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
        throw new Error(
          detail,
        );
      }

      router.replace("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
      setLoading(false);
    }
  };

  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-10">
          <Image
            src="/Logo Lusia Studio Alt.png"
            alt="LUSIA Studio"
            width={200}
            height={66}
            className="h-auto opacity-60"
          />
        </div>

        {/* Header */}
        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          Completa o teu perfil
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          Últimos detalhes antes de começares.
        </p>

        {/* Avatar */}
        <div className="flex justify-center mb-8">
          <AvatarUpload size="lg" />
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-brand-error/20 bg-brand-error/5 px-4 py-3 text-sm text-brand-error">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-4">
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
            tooltip="O nome que os outros utilizadores vão ver."
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
            loading={loading}
            disabled={!fullName}
            className="w-full mt-2"
          >
            Concluir
          </Button>
        </form>
      </div>
    </main>
  );
}

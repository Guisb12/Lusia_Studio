"use client";

import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
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
            className="h-auto"
            priority
          />
        </div>

        {/* Header */}
        <h1 className="font-instrument text-3xl text-brand-primary text-center mb-2">
          Completar perfil
        </h1>
        <p className="text-sm text-brand-primary/50 text-center mb-8">
          Seleciona o teu tipo de perfil para continuar.
        </p>

        {/* Role cards */}
        <div className="space-y-3">
          <Link href="/onboarding/admin" className="block">
            <div className="rounded-2xl border-2 border-brand-primary/10 bg-white p-5 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <h3 className="font-medium text-brand-primary mb-1">
                Administrador
              </h3>
              <p className="text-xs text-brand-primary/50">
                Gestor de centro de estudos ou escola.
              </p>
            </div>
          </Link>

          <Link href="/onboarding/teacher" className="block">
            <div className="rounded-2xl border-2 border-brand-primary/10 bg-white p-5 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <h3 className="font-medium text-brand-primary mb-1">
                Professor
              </h3>
              <p className="text-xs text-brand-primary/50">
                Docente ou explicador.
              </p>
            </div>
          </Link>

          <Link href="/onboarding/student" className="block">
            <div className="rounded-2xl border-2 border-brand-primary/10 bg-white p-5 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <h3 className="font-medium text-brand-primary mb-1">Aluno</h3>
              <p className="text-xs text-brand-primary/50">
                Estudante do ensino básico ou secundário.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}

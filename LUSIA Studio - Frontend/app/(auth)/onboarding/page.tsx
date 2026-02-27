"use client";

import Image from "next/image";
import Link from "next/link";
import { GraduationCap, School, Shield } from "lucide-react";


export default function OnboardingPage() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <Image
            src="/lusia-symbol.png"
            alt="LUSIA Studio"
            width={40}
            height={40}
            className="h-10 w-10 opacity-50"
            priority
          />
        </div>

        {/* Header */}
        <h1 className="font-instrument text-2xl text-brand-primary text-center mb-1">
          Que tipo de conta?
        </h1>
        <p className="text-xs text-brand-primary/50 text-center mb-6">
          Seleciona o teu perfil para continuar.
        </p>

        {/* Role cards */}
        <div className="space-y-2.5">
          <Link href="/onboarding/admin" className="block">
            <div className="flex items-center gap-4 rounded-2xl border-2 border-brand-primary/10 bg-white px-5 py-4 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/5 text-brand-primary/50 shrink-0">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-brand-primary">
                  Administrador
                </h3>
                <p className="text-xs text-brand-primary/50">
                  Gestor de centro de estudos ou escola.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/onboarding/teacher" className="block">
            <div className="flex items-center gap-4 rounded-2xl border-2 border-brand-primary/10 bg-white px-5 py-4 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/5 text-brand-primary/50 shrink-0">
                <School className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-brand-primary">
                  Professor
                </h3>
                <p className="text-xs text-brand-primary/50">
                  Docente ou explicador.
                </p>
              </div>
            </div>
          </Link>

          <Link href="/onboarding/student" className="block">
            <div className="flex items-center gap-4 rounded-2xl border-2 border-brand-primary/10 bg-white px-5 py-4 hover:border-brand-accent/30 hover:shadow-md transition-all duration-200 cursor-pointer">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/5 text-brand-primary/50 shrink-0">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-brand-primary">
                  Aluno
                </h3>
                <p className="text-xs text-brand-primary/50">
                  Estudante do ensino básico ou secundário.
                </p>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}

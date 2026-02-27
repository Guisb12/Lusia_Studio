"use client";

import Image from "next/image";
import { CheckCircle } from "lucide-react";

export default function VerifiedPage() {
  return (
    <main className="flex h-dvh w-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Image
            src="/lusia-symbol.png"
            alt="LUSIA Studio"
            width={48}
            height={48}
            className="h-12 w-12"
          />
        </div>

        {/* Success icon */}
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-success/10">
            <CheckCircle className="h-8 w-8 text-brand-success" />
          </div>
        </div>

        {/* Message */}
        <h1 className="font-instrument text-2xl text-brand-primary mb-3">
          Email confirmado
        </h1>
        <p className="text-sm text-brand-primary/60 leading-relaxed">
          Podes fechar este separador e voltar à página onde estavas.
        </p>
        <p className="text-sm text-brand-primary/40 mt-2">
          Clica em <span className="font-medium text-brand-primary/60">&quot;Já confirmei&quot;</span> para continuar.
        </p>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CFSDashboard } from "@/components/grades/CFSDashboard";
import { fetchCFSDashboard } from "@/lib/grades";
import type { CFSDashboardData } from "@/lib/grades";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function CFSPage() {
  const [data, setData] = useState<CFSDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCFSDashboard()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-primary/20 border-t-brand-accent" />
      </div>
    );
  }

  if (!data || data.cfds.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Link
          href="/student/grades"
          className="inline-flex items-center gap-1 text-sm text-brand-primary/50 hover:text-brand-primary transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar às Médias
        </Link>
        <div className="text-center py-20">
          <p className="text-sm text-brand-primary/40">
            Ainda não tens dados suficientes para calcular a Média Final. Insere
            as notas de pelo menos um ano completo.
          </p>
        </div>
      </div>
    );
  }

  return <CFSDashboard initialData={data} />;
}

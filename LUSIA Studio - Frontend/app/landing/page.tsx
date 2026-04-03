import { readFile } from "fs/promises";
import path from "path";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "LUSIA Studio",
  description: "Bem-vindo ao futuro da educação.",
};

export default async function LandingPage() {
  const asciiPath = path.join(process.cwd(), "app/landing/ASCII_ART");
  const ascii = await readFile(asciiPath, "utf-8");

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0c0f]">
      {/* Background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 50% 30%, rgba(21,49,107,0.35) 0%, rgba(9,12,15,0.92) 55%, rgba(6,8,10,0.98) 100%)",
        }}
      />

      {/* ASCII "plate" */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div
          className="relative mt-6 sm:mt-10"
          style={{
            maskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)",
            WebkitMaskImage:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 14%, rgba(0,0,0,1) 70%, rgba(0,0,0,0) 100%)",
          }}
        >
          <pre
            className="m-0 w-max max-w-[92vw] overflow-hidden font-mono leading-none tracking-normal select-none"
            style={{
              color: "rgba(239,233,221,0.20)",
              textShadow: "0 0 70px rgba(21,49,107,0.35)",
              fontSize:
                "min(calc((100vw - 2.5rem) / 400), calc((100dvh - 18rem) / 121))",
            }}
          >
            {ascii}
          </pre>

          {/* Vignette to push focus to copy */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 380px at 50% 55%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.85) 100%)",
            }}
          />
        </div>
      </div>

      {/* Grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.45'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl items-end px-6 py-10 pb-10 text-[#efe9dd] sm:px-10 sm:py-12 sm:pb-14">
        <div className="w-full">
          <div className="mb-4 flex items-center gap-3 text-[11px] tracking-[0.32em] text-[#efe9dd]/55">
            <span className="inline-block h-[1px] w-10 bg-[#efe9dd]/25" />
            <span>EST.</span>
          </div>

          <h1 className="text-[clamp(2.35rem,4.5vw,4.2rem)] font-semibold leading-[0.98] tracking-[-0.03em] text-[#efe9dd]">
            Bem-vindo ao futuro
            <br />
            da educação
          </h1>

          <p className="mt-4 max-w-xl text-[clamp(1.05rem,1.5vw,1.25rem)] leading-[1.35] text-[#efe9dd]/70">
            Aprendizagem com IA, feita para a forma como a tua mente funciona.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-2xl border border-[#efe9dd]/20 bg-transparent text-[#efe9dd] hover:bg-[#efe9dd]/10"
            >
              <Link href="/signup">Começar</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-2xl border border-[#efe9dd]/18 bg-transparent text-[#efe9dd]/90 hover:bg-[#efe9dd]/8"
            >
              <Link href="/login">Explorar</Link>
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}

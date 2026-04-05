import Link from "next/link";
import { Button } from "@/components/ui/button";
import { heroContent } from "./landing-content";
import { AsciiHeroAnimation } from "./AsciiHeroAnimation";

interface LandingHeroProps {
  ascii: string;
}

export function LandingHero({ ascii }: LandingHeroProps) {
  return (
    <section className="relative min-h-screen overflow-hidden bg-[#0a0c0f]">
      {/* Layer 0 — base gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 50% 30%, rgba(21,49,107,0.35) 0%, rgba(9,12,15,0.92) 55%, rgba(6,8,10,0.98) 100%)",
        }}
      />

      {/* Layer 1 — ASCII art as full-bleed background */}
      <AsciiHeroAnimation ascii={ascii} />

      {/* Layer 2 — grain texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)' opacity='.45'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Layer 3 — centered scrim for readability */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 50%, rgba(6,8,10,0.78) 0%, rgba(6,8,10,0.35) 60%, transparent 100%)",
        }}
      />

      {/* Layer 4 — content centered on top of the ASCII */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 py-20 text-center text-[#efe9dd] sm:px-10">
        <div className="w-full">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-brand-tertiary">
            {heroContent.eyebrow}
          </p>

          <h1 className="font-instrument text-[clamp(2.6rem,5.5vw,4.8rem)] leading-[1] tracking-[-0.03em] text-[#efe9dd]">
            {heroContent.headline.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>

          <p className="mx-auto mt-5 max-w-lg text-[clamp(1.05rem,1.5vw,1.25rem)] leading-[1.4] text-[#efe9dd]/70">
            {heroContent.subheadline}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
            <Button
              asChild
              size="lg"
              className="rounded-2xl bg-brand-accent text-white shadow-lg hover:bg-brand-accent-hover"
            >
              <Link href={heroContent.ctas[0].href}>
                {heroContent.ctas[0].label}
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="outline"
              className="rounded-2xl border-[#efe9dd]/20 bg-transparent text-[#efe9dd] hover:bg-[#efe9dd]/10"
            >
              <Link href={heroContent.ctas[1].href}>
                {heroContent.ctas[1].label}
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-[#efe9dd]/60 hover:bg-[#efe9dd]/8 hover:text-[#efe9dd]"
            >
              <Link href={heroContent.ctas[2].href}>
                {heroContent.ctas[2].label}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom fade into cream */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-brand-bg" />
    </section>
  );
}

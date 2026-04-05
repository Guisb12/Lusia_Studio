import Link from "next/link";
import { Button } from "@/components/ui/button";
import { heroContent } from "./landing-content";

export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-[#0b1a3b] text-white">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% 30%, rgba(10,27,182,0.18) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-5 pb-20 pt-24 sm:px-8 md:grid-cols-2 md:items-center md:gap-16 md:pb-28 md:pt-32 lg:px-12">
        {/* Copy column */}
        <div className="max-w-xl">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-brand-tertiary">
            {heroContent.eyebrow}
          </p>

          <h1 className="font-instrument text-[clamp(2.4rem,5vw,4.2rem)] leading-[1.05] tracking-tight text-white">
            {heroContent.headline.split("\n").map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
          </h1>

          <p className="mt-5 text-lg leading-relaxed text-white/70 sm:text-xl">
            {heroContent.subheadline}
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
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
              className="rounded-2xl border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              <Link href={heroContent.ctas[1].href}>
                {heroContent.ctas[1].label}
              </Link>
            </Button>

            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-white/60 hover:bg-white/8 hover:text-white"
            >
              <Link href={heroContent.ctas[2].href}>
                {heroContent.ctas[2].label}
              </Link>
            </Button>
          </div>
        </div>

        {/* Media column — placeholder for future product montage / demo reel */}
        <div className="relative hidden md:block">
          <div className="aspect-[4/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl backdrop-blur-sm">
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex gap-4 text-4xl">
                <span>📅</span>
                <span>🤖</span>
                <span>📊</span>
              </div>
              <p className="mt-2 text-sm text-white/40">
                Espaço reservado para demo
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom fade into cream */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-brand-bg" />
    </section>
  );
}

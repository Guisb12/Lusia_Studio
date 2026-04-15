import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { heroContent } from "./landing-content";

// Placeholder student avatars with gradients
const studentAvatars = [
  { bg: "from-blue-400 to-blue-600", initial: "A" },
  { bg: "from-emerald-400 to-emerald-600", initial: "M" },
  { bg: "from-purple-400 to-purple-600", initial: "S" },
  { bg: "from-orange-400 to-orange-600", initial: "J" },
  { bg: "from-pink-400 to-pink-600", initial: "C" },
  { bg: "from-cyan-400 to-cyan-600", initial: "R" },
];

export function LandingHero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-brand-bg">
      {/* Aurora gradient - flowing from top-right */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 100% 100% at 100% 0%, 
              rgba(79, 70, 229, 0.12) 0%, 
              rgba(59, 130, 246, 0.1) 20%, 
              rgba(99, 102, 241, 0.08) 40%, 
              rgba(139, 92, 246, 0.05) 60%, 
              transparent 80%
            )
          `,
          filter: "blur(80px)",
        }}
      />

      {/* Secondary flowing accent */}
      <div
        className="pointer-events-none absolute top-0 right-0 h-[120%] w-[80%]"
        style={{
          background: `
            linear-gradient(135deg, 
              transparent 0%, 
              transparent 30%,
              rgba(59, 130, 246, 0.06) 50%,
              rgba(99, 102, 241, 0.1) 70%,
              rgba(79, 70, 229, 0.12) 100%
            )
          `,
          filter: "blur(40px)",
        }}
      />

      {/* Soft blue glow at top-right corner */}
      <div
        className="pointer-events-none absolute -top-20 -right-20 h-[500px] w-[500px] opacity-50"
        style={{
          background: "radial-gradient(circle, rgba(96, 165, 250, 0.22) 0%, rgba(59, 130, 246, 0.12) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      {/* Left side subtle glow - balances the composition */}
      <div
        className="pointer-events-none absolute -bottom-40 -left-40 h-[600px] w-[600px] opacity-40"
        style={{
          background: "radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(99, 102, 241, 0.08) 30%, transparent 60%)",
          filter: "blur(80px)",
        }}
      />

      {/* Subtle noise texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Content - left aligned */}
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] items-center px-6 sm:px-8 lg:px-12">
        <div className="w-full max-w-2xl">
          {/* Social Proof - Left aligned */}
          <div className="mb-6 flex flex-col items-start gap-2">
            {/* Top: Dos Criadores de [LOGO] LUSIA */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-brand-primary/60">Dos Criadores de</span>
              <Image
                src="/lusia-symbol.png"
                alt="LUSIA"
                width={18}
                height={18}
                className="rounded-sm"
              />
              <span className="font-lusia text-xs text-brand-primary">LUSIA</span>
            </div>

            {/* Middle: Avatars */}
            <div className="flex -space-x-2">
              {studentAvatars.map((avatar, i) => (
                <div
                  key={i}
                  className={`relative flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br ${avatar.bg} ring-1 ring-brand-bg`}
                >
                  <span className="text-[10px] font-bold text-white">{avatar.initial}</span>
                </div>
              ))}
            </div>

            {/* Bottom: Stars + Stats */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="h-3 w-3 fill-brand-tertiary text-brand-tertiary" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <span className="text-xs font-medium text-brand-primary/75">30K+ students</span>
            </div>
          </div>

          {/* Headline with shimmer effect on second line */}
          <h1 className="font-instrument text-[clamp(3rem,6vw,5rem)] leading-[1.05] tracking-[-0.02em] text-brand-primary">
            {heroContent.headline.split("\n").map((line, i) => (
              <span 
                key={i} 
                className={i === 1 ? "font-instrument-italic shimmer-premium block" : "block"}
              >
                {line}
              </span>
            ))}
          </h1>

          {/* Subheadline */}
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-brand-primary/60">
            {heroContent.subheadline}
          </p>

          {/* CTA Buttons - old style */}
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-start sm:gap-4">
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
              variant="ghost"
              className="text-brand-primary/65 hover:bg-brand-primary/6 hover:text-brand-primary"
            >
              <Link href={heroContent.ctas[1].href}>
                {heroContent.ctas[1].label}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

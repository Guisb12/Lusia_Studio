import { whyPillars } from "./landing-content";
import { 
  Package, 
  Sparkles, 
  BrainCircuit, 
  BarChart3,
  type LucideIcon 
} from "lucide-react";

/** Icon and color mapping for each pillar */
const PILLAR_STYLES: Record<string, { icon: LucideIcon; color: string }> = {
  "Tudo num só sítio": { 
    icon: Package, 
    color: "#2563eb" // blue
  },
  "A IA trabalha consigo": { 
    icon: Sparkles, 
    color: "#7c3aed" // purple
  },
  "A IA que conhece o seu arquivo": { 
    icon: BrainCircuit, 
    color: "#059669" // green
  },
  "Números que decidem por si": { 
    icon: BarChart3, 
    color: "#ea580c" // orange
  },
};

export function LandingWhySection() {
  return (
    <section className="bg-brand-bg px-5 py-12 sm:px-8 md:py-16 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <p className="text-center text-xs font-medium uppercase tracking-[0.25em] text-brand-accent">
          Porquê a LUSIA
        </p>
        <h2 className="mx-auto mt-3 max-w-2xl text-center font-instrument text-3xl leading-tight tracking-tight text-brand-primary sm:text-4xl">
          Porque é que escolhem a LUSIA
        </h2>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {whyPillars.map((pillar) => {
            const style = PILLAR_STYLES[pillar.title];
            const Icon = style?.icon || Package;
            const color = style?.color || "#15316b";
            const bgTint = `${color}15`; // ~8% opacity

            return (
              <div
                key={pillar.title}
                className="relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm"
                style={{
                  backgroundColor: bgTint,
                  border: `1.5px solid ${color}`,
                  borderBottomWidth: "4px",
                }}
              >
                {/* Background icon */}
                <div 
                  className="pointer-events-none absolute -right-4 -top-4 opacity-[0.08]"
                  style={{ color }}
                >
                  <Icon className="h-20 w-20" strokeWidth={1.5} />
                </div>

                {/* Icon */}
                <div 
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ 
                    backgroundColor: `${color}20`,
                    color 
                  }}
                >
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>

                {/* Title */}
                <h3 
                  className="mt-4 text-lg font-semibold"
                  style={{ color }}
                >
                  {pillar.title}
                </h3>

                {/* Description */}
                <p className="mt-2 text-sm leading-relaxed text-brand-primary/70">
                  {pillar.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

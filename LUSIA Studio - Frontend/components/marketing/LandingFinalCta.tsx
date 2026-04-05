import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ctas } from "./landing-content";

export function LandingFinalCta() {
  return (
    <section className="bg-[#0b1a3b] px-5 py-20 text-white sm:px-8 md:py-28 lg:px-12">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-instrument text-3xl leading-tight tracking-tight text-white sm:text-4xl">
          Pronto para começar?
        </h2>
        <p className="mt-4 text-base leading-relaxed text-white/60">
          Crie o seu centro em minutos ou entre com um código de inscrição para
          se juntar a uma organização existente.
        </p>

        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
          <Button
            asChild
            size="lg"
            className="w-full rounded-2xl bg-brand-accent text-white shadow-lg hover:bg-brand-accent-hover sm:w-auto"
          >
            <Link href={ctas[0].href}>{ctas[0].label}</Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full rounded-2xl border-white/20 bg-transparent text-white hover:bg-white/10 sm:w-auto"
          >
            <Link href={ctas[1].href}>{ctas[1].label}</Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-white/50 hover:bg-white/8 hover:text-white"
          >
            <Link href={ctas[2].href}>{ctas[2].label}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

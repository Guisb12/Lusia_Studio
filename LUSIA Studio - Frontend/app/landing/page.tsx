import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import { LandingHero } from "@/components/marketing/LandingHero";
import { LandingOutcomeGrid } from "@/components/marketing/LandingOutcomeGrid";
import { LandingWhySection } from "@/components/marketing/LandingWhySection";
import { LandingDemoSection } from "@/components/marketing/LandingDemoSection";
import { LandingOperationsSection } from "@/components/marketing/LandingOperationsSection";
import { LandingStudentSection } from "@/components/marketing/LandingStudentSection";
import { LandingAnalyticsSection } from "@/components/marketing/LandingAnalyticsSection";
import { LandingDeviceParitySection } from "@/components/marketing/LandingDeviceParitySection";
import { LandingFaq } from "@/components/marketing/LandingFaq";
import { LandingFinalCta } from "@/components/marketing/LandingFinalCta";
import { faqItems } from "@/components/marketing/landing-content";

const landingDescription =
  "LUSIA Studio: plataforma de operação académica com IA para centros de explicações e escolas. Horários, conteúdos, alunos e analítica financeira — tudo num só lugar.";

export async function generateMetadata(): Promise<Metadata> {
  const site = getSiteUrl();
  const canonical = new URL("/landing", site);

  return {
    title: { absolute: "LUSIA Studio — Plataforma educativa com IA" },
    description: landingDescription,
    alternates: { canonical: canonical.toString() },
    openGraph: {
      title: "LUSIA Studio — Plataforma educativa com IA",
      description: landingDescription,
      url: canonical.toString(),
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "LUSIA Studio — Plataforma educativa com IA",
      description: landingDescription,
    },
  };
}

export default function LandingPage() {
  const site = getSiteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name: "LUSIA Studio",
        url: site.origin,
        inLanguage: "pt-PT",
        description: landingDescription,
      },
      {
        "@type": "Organization",
        name: "LUSIA Studio",
        url: site.origin,
      },
      {
        "@type": "FAQPage",
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: item.answer,
          },
        })),
      },
    ],
  };

  return (
    <main className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* S1: Hero */}
      <LandingHero />

      {/* S2: Product breadth snapshot */}
      <LandingOutcomeGrid />

      {/* S3: Why centers choose LUSIA */}
      <LandingWhySection />

      {/* S4: AI docs demo workflow */}
      <LandingDemoSection />

      {/* S5: Operational control */}
      <LandingOperationsSection />

      {/* S6: Student experience */}
      <LandingStudentSection />

      {/* S7: Financial analytics */}
      <LandingAnalyticsSection />

      {/* S8: Device parity */}
      <LandingDeviceParitySection />

      {/* S10: FAQ */}
      <LandingFaq />

      {/* S11: Final CTA */}
      <LandingFinalCta />
    </main>
  );
}

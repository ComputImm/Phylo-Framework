import { Hero } from "@/components/landing/Hero";
import { WhyUseIt } from "@/components/landing/WhyUseIt";
import { SequenceTraceSpotlight } from "@/components/landing/SequenceTraceSpotlight";
import { FeatureHighlights } from "@/components/landing/FeatureHighlights";
import { CtaSection } from "@/components/landing/CtaSection";
import { SiteFooter } from "@/components/layout/SiteFooter";

export default function Home() {
  return (
    <>
      <main className="flex flex-col">
        <Hero />
        <WhyUseIt />
        <SequenceTraceSpotlight />
        <FeatureHighlights />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}

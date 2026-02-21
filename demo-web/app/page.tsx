import { HeroSection } from "@/components/landing/HeroSection";
import { ProtocolFlow } from "@/components/landing/ProtocolFlow";
import { DemoCards } from "@/components/landing/DemoCards";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { AdaptabilitySection } from "@/components/landing/AdaptabilitySection";
import { ReputationSection } from "@/components/landing/ReputationSection";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Zenga",
    description:
      "On-chain escrow settlement for autonomous agents and marketplaces — reputation scoring, dispute resolution, and programmable release logic on Base.",
    url: process.env.NEXT_PUBLIC_BASE_URL || "https://zenga.xyz",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HeroSection />
      <ProtocolFlow />
      <DemoCards />
      <HowItWorks />
      <AdaptabilitySection />
      <ReputationSection />
      <Footer />
    </div>
  );
}

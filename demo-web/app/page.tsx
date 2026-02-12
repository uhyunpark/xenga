import { HeroSection } from "@/components/landing/HeroSection";
import { ProtocolFlow } from "@/components/landing/ProtocolFlow";
import { DemoCards } from "@/components/landing/DemoCards";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { Footer } from "@/components/landing/Footer";

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <ProtocolFlow />
      <DemoCards />
      <HowItWorks />
      <ComparisonTable />
      <Footer />
    </div>
  );
}

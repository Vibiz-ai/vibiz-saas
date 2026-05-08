import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/landing/hero";
import { Features } from "@/components/landing/features";
import { Testimonials } from "@/components/landing/testimonials";
import { Pricing } from "@/components/landing/pricing";
import { FAQ } from "@/components/landing/faq";
import { CTA } from "@/components/landing/cta";

interface LandingPageProps {
  searchParams: Promise<{ claim?: string; payment?: string }>;
}

export default async function LandingPage({ searchParams }: LandingPageProps) {
  const { claim, payment } = await searchParams;
  if (claim) {
    const target = new URLSearchParams({ claim });
    if (payment) target.set("payment", payment);
    redirect(`/payment-success?${target.toString()}`);
  }

  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <Features />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

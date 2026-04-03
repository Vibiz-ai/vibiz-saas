import { config } from "@/lib/config";
import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="py-24 bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-secondary)] text-white">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-heading font-bold">
          Ready to get started?
        </h2>
        <p className="mt-4 text-white/80 text-lg">
          Join {config.hero.socialProof?.replace("Trusted by ", "") || "thousands of users"} who already use {config.product.name}.
        </p>
        <div className="mt-10">
          <Button href="/signup" variant="secondary" size="lg" className="bg-white text-brand-primary hover:bg-gray-100">
            {config.hero.cta.text}
          </Button>
        </div>
        <p className="mt-4 text-sm text-white/60">No credit card required · Cancel anytime</p>
      </div>
    </section>
  );
}

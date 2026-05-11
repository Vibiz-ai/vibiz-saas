import { getConfig } from "@/lib/config-server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Hero() {
  const config = getConfig();
  return (
    <section className="min-h-[85vh] flex items-center relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--brand-primary)] via-[var(--brand-secondary)] to-[var(--brand-primary)] opacity-5" />
      <div className="max-w-6xl mx-auto px-6 pt-24 pb-16 relative">
        <div className="max-w-3xl">
          <Badge variant="primary">{config.hero.socialProof}</Badge>
          <h1 className="text-5xl md:text-6xl font-heading font-bold mt-6 leading-tight text-gray-900">
            {config.hero.headline}
          </h1>
          <p className="text-xl text-gray-500 mt-6 max-w-2xl">
            {config.hero.subheadline}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 mt-10">
            <Button href={config.hero.cta.href} size="lg">
              {config.hero.cta.text}
            </Button>
            <Button href={config.hero.secondaryCta.href} variant="outline" size="lg">
              {config.hero.secondaryCta.text}
            </Button>
          </div>
          <p className="text-sm text-gray-400 mt-4">
            No credit card required · {config.hero.rating}
          </p>
        </div>
      </div>
    </section>
  );
}

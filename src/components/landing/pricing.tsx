import { config } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export function Pricing() {
  return (
    <section id="pricing" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-gray-900">
            {config.pricing.headline}
          </h2>
          <p className="text-gray-500 mt-4">{config.pricing.subheadline}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 mt-16 items-start">
          {config.pricing.tiers.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "rounded-xl border p-8 relative",
                tier.highlighted
                  ? "border-brand-primary shadow-xl shadow-brand-primary/10 scale-105"
                  : "border-gray-200"
              )}
            >
              {tier.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-xs px-4 py-1 rounded-full font-medium">
                  Most Popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-gray-900">{tier.name}</h3>
              <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-gray-900">{tier.price}</span>
                {tier.period && <span className="text-gray-400 ml-1">{tier.period}</span>}
              </div>
              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-center gap-3 text-sm text-gray-600">
                    <Check className="w-4 h-4 text-brand-primary flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Button
                  href={tier.cta.href}
                  variant={tier.highlighted ? "primary" : "outline"}
                  className="w-full"
                >
                  {tier.cta.text}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { config } from "@/lib/config";
import { type Offer, formatPrice, getSeededOffers } from "@/lib/offers";
import { cn } from "@/lib/utils";

// True when the deployment was provisioned by the Vibiz platform (env var
// stamped by sandbox-deploy at deploy time). On Vibiz-managed sites the
// static fallback tiers from template.config.ts are NEVER rendered — they
// would ship $0/$29/Custom placeholder pricing that EP-1433 explicitly
// forbade. Standalone clones of the template (no Vibiz env marker) keep
// the fallback so the pricing section still works out of the box.
const IS_VIBIZ_DEPLOY = process.env.NEXT_PUBLIC_VIBIZ_DEPLOY === "1";

export async function Pricing() {
  const offers = await getSeededOffers();

  return (
    <section id="pricing" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-gray-900">
            {config.pricing.headline}
          </h2>
          <p className="text-gray-500 mt-4">{config.pricing.subheadline}</p>
        </div>
        {offers.length > 0 ? (
          <OffersGrid offers={offers} />
        ) : IS_VIBIZ_DEPLOY ? (
          <PricingComingSoon />
        ) : (
          <FallbackTiersGrid />
        )}
      </div>
    </section>
  );
}

function PricingComingSoon() {
  return (
    <div className="mt-16 max-w-xl mx-auto rounded-xl border border-gray-200 p-10 text-center">
      <h3 className="text-lg font-semibold text-gray-900">
        Pricing coming soon
      </h3>
      <p className="text-sm text-gray-500 mt-2">
        Set up your offers in the dashboard, then republish to ship pricing
        to your live site.
      </p>
    </div>
  );
}

function OffersGrid({ offers }: { offers: Offer[] }) {
  // Sort by `position`, then highlight the middle card by default — matches
  // the existing template's three-tier visual rhythm.
  const sorted = [...offers].sort((a, b) => a.position - b.position);
  const highlightIdx =
    sorted.length === 1 ? 0 : Math.floor((sorted.length - 1) / 2);

  return (
    <div
      className={cn(
        "grid gap-8 mt-16 items-start mx-auto",
        sorted.length === 1 && "max-w-md",
        sorted.length === 2 && "md:grid-cols-2 max-w-3xl",
        sorted.length >= 3 && "md:grid-cols-3 max-w-6xl",
      )}
    >
      {sorted.map((offer, idx) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          highlighted={idx === highlightIdx}
        />
      ))}
    </div>
  );
}

function OfferCard({
  offer,
  highlighted,
}: {
  offer: Offer;
  highlighted: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-8 relative",
        highlighted
          ? "border-brand-primary shadow-xl shadow-brand-primary/10 scale-105"
          : "border-gray-200",
      )}
    >
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-primary text-white text-xs px-4 py-1 rounded-full font-medium">
          Most Popular
        </span>
      )}
      <div className="flex items-center gap-2">
        {offer.iconEmoji && (
          <span className="text-2xl" aria-hidden>
            {offer.iconEmoji}
          </span>
        )}
        <h3 className="text-lg font-semibold text-gray-900">{offer.title}</h3>
      </div>
      {offer.description && (
        <p className="text-sm text-gray-500 mt-1">{offer.description}</p>
      )}
      <div className="mt-6">
        <span className="text-4xl font-bold text-gray-900">
          {formatPrice(offer.priceCents, offer.priceCurrency)}
        </span>
      </div>
      <div className="mt-8">
        <Button
          href={offer.paymentLinkUrl}
          variant={highlighted ? "primary" : "outline"}
          className="w-full"
        >
          Buy now
        </Button>
      </div>
    </div>
  );
}

/**
 * Fallback grid rendered when `data/offers.json` is missing or empty. This
 * is the path a fresh clone of the template hits before Vibiz seeds offers
 * (or for someone using the template standalone). Reads the static tiers
 * from `template.config.ts`'s `pricing.fallbackTiers`.
 */
function FallbackTiersGrid() {
  const tiers = config.pricing.fallbackTiers;
  return (
    <div className="grid md:grid-cols-3 gap-8 mt-16 items-start max-w-6xl mx-auto">
      {tiers.map((tier) => (
        <div
          key={tier.name}
          className={cn(
            "rounded-xl border p-8 relative",
            tier.highlighted
              ? "border-brand-primary shadow-xl shadow-brand-primary/10 scale-105"
              : "border-gray-200",
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
            <span className="text-4xl font-bold text-gray-900">
              {tier.price}
            </span>
            {tier.period && (
              <span className="text-gray-400 ml-1">{tier.period}</span>
            )}
          </div>
          <ul className="mt-8 space-y-3">
            {tier.features.map((f) => (
              <li
                key={f}
                className="flex items-center gap-3 text-sm text-gray-600"
              >
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
  );
}

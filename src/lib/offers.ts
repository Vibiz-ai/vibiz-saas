import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Offers contract — must match the shape written by the Vibiz platform via
 * `lib/services/sandbox/seed-offers.ts` into `/home/user/app/data/offers.json`
 * during sandbox bootstrap. The customer-deployed app reads this JSON and
 * renders Buy buttons whose `href` is the Stripe Payment Link URL minted
 * platform-side.
 *
 * No Stripe SDK or key required in the customer app — Stripe handles checkout
 * via the hosted Payment Link page. Webhook attribution stays platform-side.
 */
export interface Offer {
  id: string;
  title: string;
  description: string | null;
  priceCents: number;
  priceCurrency: string;
  iconEmoji: string | null;
  paymentLinkUrl: string;
  position: number;
}

const OFFERS_PATH = path.join(process.cwd(), "data", "offers.json");

/**
 * Read seeded offers. Returns [] if the file is missing, empty, or unreadable
 * — callers should fall back to a static config in that case.
 */
export async function getSeededOffers(): Promise<Offer[]> {
  try {
    const raw = await fs.readFile(OFFERS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidOffer);
  } catch {
    // File missing on a fresh clone, or unreadable. Either way: caller renders
    // the template static fallback.
    return [];
  }
}

function isValidOffer(o: unknown): o is Offer {
  if (!o || typeof o !== "object") return false;
  const x = o as Record<string, unknown>;
  return (
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.priceCents === "number" &&
    typeof x.priceCurrency === "string" &&
    typeof x.paymentLinkUrl === "string" &&
    x.paymentLinkUrl.length > 0
  );
}

/**
 * Format a price for display, e.g. 2900 USD → "$29".
 * Returns "$X" without trailing ".00" when the cents are whole dollars,
 * matching the existing template's pricing card aesthetic.
 */
export function formatPrice(priceCents: number, currency: string): string {
  const amount = priceCents / 100;
  const isWhole = priceCents % 100 === 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "USD").toUpperCase(),
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

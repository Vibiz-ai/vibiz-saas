import Stripe from "stripe";
import { appUrl } from "./app-url";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function createCheckoutSession(priceId: string, customerId?: string) {
  const base = appUrl();
  return stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/dashboard?checkout=success`,
    cancel_url: `${base}/pricing`,
    ...(customerId ? { customer: customerId } : {}),
  });
}

export async function createPortalSession(customerId: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/dashboard/billing`,
  });
}

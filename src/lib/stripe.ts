import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-03-31.basil",
});

export async function createCheckoutSession(priceId: string, customerId?: string) {
  return stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"}/dashboard?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"}/pricing`,
    ...(customerId ? { customer: customerId } : {}),
  });
}

export async function createPortalSession(customerId: string) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"}/dashboard/billing`,
  });
}

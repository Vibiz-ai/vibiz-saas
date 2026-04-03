import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  try {
    const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // TODO: Activate subscription for the user
        console.log("Checkout completed:", session.id);
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        // TODO: Update user's subscription status
        console.log("Subscription updated:", subscription.id);
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        // TODO: Downgrade user to free plan
        console.log("Subscription cancelled:", subscription.id);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json({ error: "Webhook failed" }, { status: 400 });
  }
}

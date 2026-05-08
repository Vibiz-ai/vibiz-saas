# Generated App Payment Unlock Flow

Minimal one-time purchase flow for a generated Vibiz app.

```mermaid
flowchart LR
  A["1. Buyer clicks paid offer"]
  B["2. Stripe Checkout"]
  C["3. Stripe webhook records payment in Vibiz"]
  D["4. Stripe redirects browser to Vibiz /post-checkout"]
  E["5. Vibiz verifies paid session"]
  F["6. Vibiz redirects buyer back to generated app"]
  G["7. Generated app stores entitlement for logged-in buyer"]
  H["8. Future visits unlock from local entitlement"]

  A --> B
  B --> C
  B --> D
  D --> E
  E --> F
  F --> G
  G --> H
```

Notes:

- `/post-checkout` is not called by our frontend. Stripe redirects the buyer's browser there after checkout because Vibiz configures it on the Payment Link.
- The webhook and redirect are separate. The webhook records the payment; the redirect returns the buyer to the generated app.
- Today, `/post-checkout` verifies payment and redirects with a success marker. The proposed next step is to redirect with a short-lived claim so the generated app can safely store local paid access.

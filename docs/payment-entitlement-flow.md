# Generated App Payment Unlock Flow

Minimal one-time purchase flow for a generated Vibiz app.

```text
+---------------------------+
| 1. Buyer clicks paid offer |
|    in generated app        |
+-------------+-------------+
              |
              v
+---------------------------+
| 2. Buyer pays in Stripe    |
|    Checkout                |
+------+------+-------------+
       |      |
       |      +-----------------------------+
       v                                    v
+---------------------------+   +---------------------------+
| 3. Stripe webhook records  |   | 4. Browser opens          |
|    payment in Vibiz        |   |    https://vibiz.ai/      |
+---------------------------+   |    post-checkout?         |
                                |    session_id=cs_...       |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 5. Vibiz verifies session |
                                |    and mints claim token  |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 6. Vibiz redirects buyer  |
                                |    to generated app with  |
                                |    claim=...              |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 7. Generated app calls    |
                                |    Vibiz claim endpoint   |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 8. Vibiz returns          |
                                |    entitlement data       |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 9. App stores entitlement |
                                |    in local DB            |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 10. Future visits unlock  |
                                |    from local entitlement |
                                +---------------------------+
```

Notes:

- `https://vibiz.ai/post-checkout?session_id=cs_...` is not called by our frontend. Stripe sends the buyer's browser directly to that URL after checkout because Vibiz configures it on the Payment Link.
- The webhook and redirect are separate. The webhook records the payment; the redirect returns the buyer to the generated app.
- Today, `/post-checkout` verifies payment and redirects with a success marker. The proposed next step is for `/post-checkout` to mint a short-lived claim, redirect the buyer back to the generated app with that claim, then let the generated app call a Vibiz runtime claim endpoint.
- The claim endpoint should return minimal entitlement data: offer or entitlement key, status, buyer identity, paid time, amount, currency, and optional `expiresAt`. The generated app stores that in its local DB for future access checks.

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
| 3. Stripe webhook records  |   | 4. Stripe redirects       |
|    payment in Vibiz        |   |    browser to Vibiz       |
+---------------------------+   |    /post-checkout          |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 5. Vibiz verifies paid    |
                                |    Checkout Session       |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 6. Vibiz redirects buyer  |
                                |    back to generated app  |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 7. Generated app stores   |
                                |    local paid entitlement |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                | 8. Future visits unlock   |
                                |    from local entitlement |
                                +---------------------------+
```

Notes:

- `/post-checkout` is not called by our frontend. Stripe redirects the buyer's browser there after checkout because Vibiz configures it on the Payment Link.
- The webhook and redirect are separate. The webhook records the payment; the redirect returns the buyer to the generated app.
- Today, `/post-checkout` verifies payment and redirects with a success marker. The proposed next step is to redirect with a short-lived claim so the generated app can safely store local paid access.

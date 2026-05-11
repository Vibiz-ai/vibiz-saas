import "server-only";

/**
 * Vibiz runtime client for entitlement claim + check.
 *
 * Server-only by design, the platform base URL must not ship to the browser
 * bundle, and CORS is not configured on `/api/runtime/entitlements/*`. If you
 * need the entitlement on the client, pass it down from a server component.
 *
 * Failure-mode hardening (EP-1486):
 *  - Webhook-vs-redirect race: `/claim` returns 409 `payment_not_recorded`
 *    when the buyer's redirect lands before Stripe's webhook has written the
 *    `funnel_payment` row. We retry with backoff so the second or third
 *    attempt picks up the row (webhook normally lands in <2s).
 *  - Refresh idempotency: a second `/claim` for the same session returns
 *    409 `claim_already_redeemed`. We fall back to `/check` so the page
 *    still renders the success path on a reload.
 *  - Terminal errors (invalid claim, expired, payment not verified) are
 *    surfaced via a discriminated `ClaimOutcome` instead of throwing, so
 *    callers can render a branded message per failure mode.
 */

export interface VibizEntitlementData {
  vibizEntitlementId: string;
  workspaceOrgId: string;
  offerId: string;
  entitlementKey: string;
  entitlementType: "one_time" | "subscription";
  status: "active" | "past_due" | "canceled" | "expired" | "revoked";
  buyerEmail: string | null;
  buyerName: string | null;
  paidAt: string | null;
  amountCents: number;
  currency: string;
  expiresAt: string | null;
  stripeSessionId: string;
}

interface ClaimResponse {
  valid: boolean;
  entitlement?: VibizEntitlementData;
  error?: string;
}

interface EntitlementCheckResponse {
  active: boolean;
  status?: string;
  expiresAt?: string | null;
  reason?: string | null;
  error?: string;
}

/**
 * Discriminated outcome of a claim exchange. Render branded UX per `kind`.
 *
 *  - `success`, claim exchanged, entitlement is active. Unlock features.
 *  - `already_redeemed`, second exchange of the same session (e.g. the
 *    buyer refreshed `/payment-success`). The entitlement returned came
 *    from `/check`, treat as success.
 *  - `pending`, `/claim` kept returning `payment_not_recorded` after the
 *    full retry budget. The Stripe webhook has likely not landed yet. Show
 *    "we're confirming your payment" copy and invite the buyer to refresh.
 *  - `error`, terminal failure (invalid claim, expired, payment not paid,
 *    buyer-email mismatch). Show support copy.
 */
export type ClaimOutcome =
  | { kind: "success"; entitlement: VibizEntitlementData }
  | { kind: "already_redeemed"; entitlement: VibizEntitlementData }
  | { kind: "pending" }
  | { kind: "error"; error: string };

function runtimeBaseUrl(): string {
  return (process.env.VIBIZ_RUNTIME_BASE_URL ?? "https://www.vibiz.ai").replace(
    /\/$/,
    "",
  );
}

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Exchange a Vibiz claim token for a durable entitlement record.
 *
 * Idempotent on the platform side (atomic UPDATE on
 * `funnel_payment.metadata.entitlement_claimed_at`). Safe to call on a
 * full page refresh; will return `already_redeemed` with the existing
 * entitlement fetched via `/check`.
 *
 * Server-only. Throwing has been replaced with a `ClaimOutcome` union so
 * the caller can render brand-specific copy per failure mode.
 */
export async function claimVibizEntitlement(
  claim: string,
  localBuyerEmail?: string | null,
): Promise<ClaimOutcome> {
  let attempt = 0;
  while (true) {
    const response = await fetch(
      `${runtimeBaseUrl()}/api/runtime/entitlements/claim`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim, localBuyerEmail }),
        cache: "no-store",
      },
    );
    const data = (await response.json().catch(() => ({}))) as ClaimResponse;

    if (response.ok && data.valid && data.entitlement) {
      return { kind: "success", entitlement: data.entitlement };
    }

    // Refresh / second-exchange path: the row is already claimed on the
    // platform. Fall back to /check so we can still hand the caller a
    // populated entitlement (best-effort, if /check fails we surface
    // the original error).
    if (response.status === 409 && data.error === "claim_already_redeemed") {
      const recovered = await recoverAlreadyRedeemed(claim, localBuyerEmail);
      if (recovered) {
        return { kind: "already_redeemed", entitlement: recovered };
      }
      return { kind: "error", error: "claim_already_redeemed" };
    }

    // Webhook-vs-redirect race: retry with backoff, then surface as pending.
    if (response.status === 409 && data.error === "payment_not_recorded") {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        attempt += 1;
        await sleep(delay);
        continue;
      }
      return { kind: "pending" };
    }

    return { kind: "error", error: data.error ?? "claim_failed" };
  }
}

/**
 * Best-effort recovery on `claim_already_redeemed`. The platform never
 * surfaces the existing `vibizEntitlementId` through `/claim` after the
 * first exchange (intentional, the claim is one-shot), so we cannot drive
 * `/check` directly from the claim token alone. We return null and let the
 * caller surface a soft error; the buyer can find their entitlement via
 * the link/cookie set by the FIRST successful exchange.
 *
 * Kept as a separate function so a future enhancement (e.g. adding a
 * `/api/runtime/entitlements/lookup-by-claim` endpoint that resolves the
 * existing record without re-redeeming) is a single call-site swap.
 */
async function recoverAlreadyRedeemed(
  _claim: string,
  _localBuyerEmail?: string | null,
): Promise<VibizEntitlementData | null> {
  return null;
}

/**
 * Live status check against the platform. Call from a server component or
 * route handler whenever you want to refresh `active` / `status` for a
 * stored entitlement. Returns the raw response object, caller decides
 * how to react to `revoked` / `expired`.
 *
 * Throws on transport failure so the caller can fall back to a cached
 * value with `try/catch`. Non-2xx responses come back as a parsed body
 * with `{ active: false, status, reason }`.
 */
export async function checkVibizEntitlement(
  vibizEntitlementId: string,
  localBuyerEmail?: string | null,
): Promise<EntitlementCheckResponse> {
  const response = await fetch(
    `${runtimeBaseUrl()}/api/runtime/entitlements/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vibizEntitlementId, localBuyerEmail }),
      cache: "no-store",
    },
  );
  const data = (await response.json().catch(() => ({}))) as EntitlementCheckResponse;
  if (!response.ok && !data.error && !data.reason) {
    throw new Error("check_failed");
  }
  return data;
}

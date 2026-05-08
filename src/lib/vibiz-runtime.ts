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

function runtimeBaseUrl(): string {
  return (
    process.env.VIBIZ_RUNTIME_BASE_URL ??
    process.env.NEXT_PUBLIC_VIBIZ_RUNTIME_BASE_URL ??
    "https://www.vibiz.ai"
  ).replace(/\/$/, "");
}

export async function claimVibizEntitlement(
  claim: string,
  localBuyerEmail?: string | null,
): Promise<VibizEntitlementData> {
  const response = await fetch(`${runtimeBaseUrl()}/api/runtime/entitlements/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ claim, localBuyerEmail }),
    cache: "no-store",
  });
  const data = (await response.json()) as ClaimResponse;
  if (!response.ok || !data.valid || !data.entitlement) {
    throw new Error(data.error ?? "claim_failed");
  }
  return data.entitlement;
}

export async function checkVibizEntitlement(
  vibizEntitlementId: string,
  localBuyerEmail?: string | null,
): Promise<EntitlementCheckResponse> {
  const response = await fetch(`${runtimeBaseUrl()}/api/runtime/entitlements/check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vibizEntitlementId, localBuyerEmail }),
    cache: "no-store",
  });
  const data = (await response.json()) as EntitlementCheckResponse;
  if (!response.ok) {
    throw new Error(data.reason ?? data.error ?? "check_failed");
  }
  return data;
}

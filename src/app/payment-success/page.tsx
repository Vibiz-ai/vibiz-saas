import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { storeLocalEntitlement } from "@/lib/entitlements";
import {
  type ClaimOutcome,
  claimVibizEntitlement,
  type VibizEntitlementData,
} from "@/lib/vibiz-runtime";

interface PaymentSuccessPageProps {
  searchParams: Promise<{ claim?: string; payment?: string }>;
}

function loginHref(claim: string, path: "login" | "signup") {
  const redirect = `/payment-success?claim=${encodeURIComponent(claim)}`;
  return `/${path}?redirect=${encodeURIComponent(redirect)}`;
}

export default async function PaymentSuccessPage({
  searchParams,
}: PaymentSuccessPageProps) {
  const { claim } = await searchParams;
  if (!claim) {
    return (
      <PaymentShell
        title="Payment received"
        message="Your payment was completed."
      />
    );
  }

  // When the template runs in funnel-mode (no DATABASE_URL → auth=null), the
  // buyer is anonymous. We still call the platform so the funnel_payment row
  // gets stamped as redeemed, then render a brand-voice thank-you. No signin
  // gate, no local entitlement table (there's no user to link it to).
  if (!auth) {
    return <AnonymousAck claim={claim} />;
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return (
      <PaymentShell
        title="Payment received"
        message="Sign in or create an account to attach this purchase to your profile."
        actions={
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button href={loginHref(claim, "login")}>Sign in</Button>
            <Button href={loginHref(claim, "signup")} variant="outline">
              Create account
            </Button>
          </div>
        }
      />
    );
  }

  const sessionEmail = session.user.email?.toLowerCase();
  const outcome = await claimVibizEntitlement(claim, sessionEmail);
  return renderAuthenticatedOutcome({
    outcome,
    sessionUserId: session.user.id,
    sessionEmail,
    claim,
  });
}

async function renderAuthenticatedOutcome({
  outcome,
  sessionUserId,
  sessionEmail,
  claim,
}: {
  outcome: ClaimOutcome;
  sessionUserId: string;
  sessionEmail: string | undefined;
  claim: string;
}) {
  if (outcome.kind === "pending") {
    return <PendingShell />;
  }
  if (outcome.kind === "error") {
    return <ErrorShell error={outcome.error} />;
  }
  if (outcome.kind === "already_redeemed_opaque") {
    // Refresh of a previously-successful exchange. The local entitlement
    // row was written on the FIRST exchange so gated routes still resolve;
    // we just can't re-show the offer-specific details here.
    return (
      <PaymentShell
        title="Payment already confirmed"
        message="This purchase has already been processed. Your access is still active."
        actions={<Button href="/dashboard">Continue</Button>}
      />
    );
  }

  // success or already_redeemed (with recovered entitlement)
  const entitlement = outcome.entitlement;
  const buyerEmail = entitlement.buyerEmail?.toLowerCase();
  if (buyerEmail && sessionEmail && buyerEmail !== sessionEmail) {
    return (
      <PaymentShell
        title="Sign in with purchase email"
        message={`This purchase was made with ${entitlement.buyerEmail}. Sign in with that email to unlock access.`}
        actions={<Button href={loginHref(claim, "login")}>Switch account</Button>}
      />
    );
  }

  // Best-effort local mirror with one retry on transient errors. The
  // platform is the source of truth, but `hasLocalEntitlement` reads the
  // local table and returns false when no row exists (it does NOT consult
  // /check as a fallback). If both writes fail, surface a soft error so
  // the buyer can refresh, rather than rendering "Access unlocked" while
  // gated routes remain locked.
  let stored = false;
  try {
    await storeLocalEntitlement(sessionUserId, entitlement);
    stored = true;
  } catch {
    try {
      await new Promise((r) => setTimeout(r, 500));
      await storeLocalEntitlement(sessionUserId, entitlement);
      stored = true;
    } catch {
      stored = false;
    }
  }

  if (!stored) {
    return (
      <PaymentShell
        title="Payment confirmed"
        message="Your payment went through. We had trouble linking it to your account on this device, refresh in a moment to try again. Contact support if this persists."
        detail={entitlement.buyerEmail ? `Paid as ${entitlement.buyerEmail}` : undefined}
      />
    );
  }

  return (
    <PaymentShell
      title="Access unlocked"
      message={`Your ${entitlement.entitlementKey} purchase is now linked to this account.`}
      detail={entitlement.buyerEmail ? `Paid as ${entitlement.buyerEmail}` : undefined}
      actions={<Button href="/dashboard">Continue</Button>}
    />
  );
}

/**
 * Funnel-mode renderer. No local entitlement persistence, the operator
 * fulfils delivery via email or manual review, using `funnel_payment` rows
 * on the Vibiz side as the source of truth.
 */
async function AnonymousAck({ claim }: { claim: string }) {
  const outcome = await claimVibizEntitlement(claim);
  if (outcome.kind === "pending") return <PendingShell />;
  if (outcome.kind === "error") return <ErrorShell error={outcome.error} />;
  if (outcome.kind === "already_redeemed_opaque") {
    return (
      <PaymentShell
        title="Payment already confirmed"
        message="This purchase has already been processed. Check your inbox for the delivery."
      />
    );
  }
  return <AnonymousSuccessShell entitlement={outcome.entitlement} />;
}

function AnonymousSuccessShell({
  entitlement,
}: {
  entitlement: VibizEntitlementData;
}) {
  return (
    <PaymentShell
      title="Payment confirmed"
      message="Thanks for your purchase. We're preparing your result and will email it to you shortly."
      detail={entitlement.buyerEmail ? `Confirmation sent to ${entitlement.buyerEmail}` : undefined}
      actions={<Button href="/">Back home</Button>}
    />
  );
}

function PendingShell() {
  return (
    <PaymentShell
      title="Confirming your payment"
      message="Your payment was successful. We're still finalising the confirmation on our side, this usually takes under a minute. Refresh this page if you don't see access shortly."
      detail="If this persists for more than a few minutes, contact support with your Stripe receipt."
    />
  );
}

function ErrorShell({ error }: { error: string }) {
  return (
    <PaymentShell
      title="Payment needs review"
      message="We could not verify this payment claim. Please try again from your Stripe success link or contact support."
      detail={error}
      actions={<Button href="/">Back home</Button>}
    />
  );
}

function PaymentShell({
  title,
  message,
  detail,
  actions,
}: {
  title: string;
  message: string;
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6 py-16">
      <Card className="max-w-lg w-full">
        <CardContent className="text-center space-y-6">
          <div>
            <h1 className="text-2xl font-heading font-bold text-gray-900">
              {title}
            </h1>
            <p className="mt-3 text-gray-600">{message}</p>
            {detail && <p className="mt-2 text-sm text-gray-500">{detail}</p>}
          </div>
          {actions}
        </CardContent>
      </Card>
    </main>
  );
}

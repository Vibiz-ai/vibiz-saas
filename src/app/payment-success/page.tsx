import { headers } from "next/headers";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { storeLocalEntitlement } from "@/lib/entitlements";
import { claimVibizEntitlement } from "@/lib/vibiz-runtime";

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

  const session = auth
    ? await auth.api.getSession({ headers: await headers() })
    : null;

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

  try {
    const sessionEmail = session.user.email?.toLowerCase();
    const entitlement = await claimVibizEntitlement(claim, sessionEmail);
    const buyerEmail = entitlement.buyerEmail?.toLowerCase();
    if (buyerEmail && sessionEmail && buyerEmail !== sessionEmail) {
      return (
        <PaymentShell
          title="Sign in with purchase email"
          message={`This purchase was made with ${entitlement.buyerEmail}. Sign in with that email to unlock access.`}
          actions={
            <Button href={loginHref(claim, "login")}>Switch account</Button>
          }
        />
      );
    }
    await storeLocalEntitlement(session.user.id, entitlement);
    return (
      <PaymentShell
        title="Access unlocked"
        message={`Your ${entitlement.entitlementKey} purchase is now linked to this account.`}
        detail={
          entitlement.buyerEmail
            ? `Paid as ${entitlement.buyerEmail}`
            : undefined
        }
        actions={<Button href="/dashboard">Continue</Button>}
      />
    );
  } catch (error) {
    return (
      <PaymentShell
        title="Payment needs review"
        message="We could not verify this payment claim. Please try again from your Stripe success link or contact support."
        detail={error instanceof Error ? error.message : undefined}
        actions={<Button href="/">Back home</Button>}
      />
    );
  }
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

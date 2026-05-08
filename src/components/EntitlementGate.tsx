import { headers } from "next/headers";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { hasLocalEntitlement } from "@/lib/entitlements";

export async function EntitlementGate({
  entitlementKey,
  fallback = null,
  children,
}: {
  entitlementKey: string;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const session = auth
    ? await auth.api.getSession({ headers: await headers() })
    : null;
  if (!session?.user?.id) return fallback;

  const unlocked = await hasLocalEntitlement(
    session.user.id,
    entitlementKey,
    session.user.email,
  );
  return unlocked ? children : fallback;
}

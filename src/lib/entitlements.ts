import { createClient, type Client } from "@libsql/client";
import {
  checkVibizEntitlement,
  type VibizEntitlementData,
} from "./vibiz-runtime";

const dbUrl = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL;
let client: Client | null = null;

function entitlementDb(): Client {
  if (!dbUrl) {
    throw new Error("TURSO_DATABASE_URL / DATABASE_URL is required");
  }
  if (!client) {
    client = createClient({
      url: dbUrl,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return client;
}

export async function ensureEntitlementsTable() {
  await entitlementDb().execute(`
    CREATE TABLE IF NOT EXISTS vibiz_entitlements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vibiz_entitlement_id TEXT NOT NULL,
      offer_id TEXT NOT NULL,
      entitlement_key TEXT NOT NULL,
      entitlement_type TEXT NOT NULL DEFAULT 'one_time',
      status TEXT NOT NULL,
      buyer_email TEXT,
      buyer_name TEXT,
      paid_at TEXT,
      amount_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'USD',
      expires_at TEXT,
      stripe_session_id TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'vibiz',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, entitlement_key)
    )
  `);
}

export async function storeLocalEntitlement(
  userId: string,
  entitlement: VibizEntitlementData,
) {
  await ensureEntitlementsTable();
  await entitlementDb().execute({
    sql: `
      INSERT INTO vibiz_entitlements (
        id,
        user_id,
        vibiz_entitlement_id,
        offer_id,
        entitlement_key,
        entitlement_type,
        status,
        buyer_email,
        buyer_name,
        paid_at,
        amount_cents,
        currency,
        expires_at,
        stripe_session_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        vibiz_entitlement_id = excluded.vibiz_entitlement_id,
        offer_id = excluded.offer_id,
        entitlement_type = excluded.entitlement_type,
        status = excluded.status,
        buyer_email = excluded.buyer_email,
        buyer_name = excluded.buyer_name,
        paid_at = excluded.paid_at,
        amount_cents = excluded.amount_cents,
        currency = excluded.currency,
        expires_at = excluded.expires_at,
        stripe_session_id = excluded.stripe_session_id,
        updated_at = CURRENT_TIMESTAMP
    `,
    args: [
      `${userId}:${entitlement.entitlementKey}`,
      userId,
      entitlement.vibizEntitlementId,
      entitlement.offerId,
      entitlement.entitlementKey,
      entitlement.entitlementType,
      entitlement.status,
      entitlement.buyerEmail,
      entitlement.buyerName,
      entitlement.paidAt,
      entitlement.amountCents,
      entitlement.currency,
      entitlement.expiresAt,
      entitlement.stripeSessionId,
    ],
  });
}

export async function hasLocalEntitlement(
  userId: string,
  entitlementKey: string,
  localBuyerEmail?: string | null,
): Promise<boolean> {
  await ensureEntitlementsTable();
  const result = await entitlementDb().execute({
    sql: `
      SELECT status, expires_at, vibiz_entitlement_id, buyer_email
      FROM vibiz_entitlements
      WHERE user_id = ? AND entitlement_key = ?
      LIMIT 1
    `,
    args: [userId, entitlementKey],
  });
  const row = result.rows[0] as
    | {
        status?: string;
        expires_at?: string | null;
        vibiz_entitlement_id?: string;
        buyer_email?: string | null;
      }
    | undefined;
  if (!row || row.status !== "active") return false;
  if (!row.vibiz_entitlement_id) return false;

  try {
    const check = await checkVibizEntitlement(
      row.vibiz_entitlement_id,
      localBuyerEmail ?? row.buyer_email,
    );
    const expiresAt = check.expiresAt ?? row.expires_at ?? null;
    await entitlementDb().execute({
      sql: `
        UPDATE vibiz_entitlements
        SET status = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND entitlement_key = ?
      `,
      args: [
        check.active ? "active" : (check.status ?? "revoked"),
        expiresAt,
        userId,
        entitlementKey,
      ],
    });
    if (!check.active) return false;
    if (!expiresAt) return true;
    return new Date(expiresAt).getTime() > Date.now();
  } catch {
    return false;
  }
}

export async function requireEntitlement(
  userId: string,
  entitlementKey: string,
  localBuyerEmail?: string | null,
) {
  const ok = await hasLocalEntitlement(userId, entitlementKey, localBuyerEmail);
  if (!ok) throw new Error(`Missing entitlement: ${entitlementKey}`);
}

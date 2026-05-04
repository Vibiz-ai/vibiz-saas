import { createAuthClient } from "better-auth/react";

export const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

function clientBaseURL(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
}

const client = authEnabled ? createAuthClient({ baseURL: clientBaseURL() }) : null;

export const signIn = client?.signIn ?? { email: async () => {} };
export const signUp = client?.signUp ?? { email: async () => {} };
export const signOut = client?.signOut ?? (async () => {});
export const useSession = client?.useSession ?? (() => ({ data: null, isPending: false }));

import { createAuthClient } from "better-auth/react";

export const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

const client = authEnabled
  ? createAuthClient({
      baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100",
    })
  : null;

export const signIn = client?.signIn ?? { email: async () => {} };
export const signUp = client?.signUp ?? { email: async () => {} };
export const signOut = client?.signOut ?? (async () => {});
export const useSession = client?.useSession ?? (() => ({ data: null, isPending: false }));

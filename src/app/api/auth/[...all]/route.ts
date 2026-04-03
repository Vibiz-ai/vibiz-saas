import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";

const handler = auth
  ? toNextJsHandler(auth)
  : {
      GET: () => NextResponse.json({ error: "Auth not configured" }, { status: 404 }),
      POST: () => NextResponse.json({ error: "Auth not configured" }, { status: 404 }),
    };

export const { GET, POST } = handler;

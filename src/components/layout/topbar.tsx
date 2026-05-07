"use client";
import { config } from "@/lib/config";
import { signOut } from "@/lib/auth-client";

export function Topbar() {
  async function handleSignOut() {
    try {
      await signOut();
    } finally {
      window.location.href = "/";
    }
  }

  return (
    <header className="h-14 border-b border-gray-100 flex items-center justify-between px-6">
      <h2 className="text-sm font-medium text-gray-500">Dashboard</h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{config.product.name}</span>
        <button
          type="button"
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

import { config } from "@/lib/config";

export function Topbar() {
  return (
    <header className="h-14 border-b border-gray-100 flex items-center justify-between px-6">
      <h2 className="text-sm font-medium text-gray-500">Dashboard</h2>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{config.product.name}</span>
        <a href="/api/auth/signout" className="text-sm text-gray-400 hover:text-gray-600">Sign out</a>
      </div>
    </header>
  );
}

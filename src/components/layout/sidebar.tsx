"use client";
import { config } from "@/lib/config";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import * as Icons from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-gray-100 bg-gray-50/50 min-h-screen p-4">
      <div className="flex items-center gap-2 px-3 py-2 mb-6">
        <span className="font-heading font-bold">{config.product.name}</span>
      </div>
      <nav className="space-y-1">
        {config.dashboard.sidebarItems.map((item) => {
          const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[
            item.icon.charAt(0).toUpperCase() + item.icon.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
          ];
          const active = pathname === item.href;
          return (
            <a
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active ? "bg-brand-primary/10 text-brand-primary font-medium" : "text-gray-600 hover:bg-gray-100"
              )}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

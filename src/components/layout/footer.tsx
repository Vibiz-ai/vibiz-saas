"use client";
import { config } from "@/lib/config";
import { authEnabled } from "@/lib/auth-client";

const authPaths = ["/login", "/signup", "/dashboard"];

export function Footer() {
  const filtered = authEnabled
    ? config.footer.links
    : config.footer.links.filter((l) => !authPaths.includes(l.href));
  // Dedupe by href: generated configs occasionally produce two entries
  // pointing to the same anchor (e.g. "Pricing" + "Plans" both → #pricing),
  // which would render two identical links AND trigger React duplicate-key warnings.
  const seen = new Set<string>();
  const links = filtered.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });

  return (
    <footer className="border-t border-gray-100 py-12">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="font-heading font-bold">{config.product.name}</span>
        </div>
        <div className="flex items-center gap-6">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="text-sm text-gray-500 hover:text-gray-900">
              {link.label}
            </a>
          ))}
        </div>
        <p className="text-sm text-gray-400">{config.footer.copyright}</p>
      </div>
    </footer>
  );
}

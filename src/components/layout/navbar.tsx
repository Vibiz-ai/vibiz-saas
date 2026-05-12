import { getConfig } from "@/lib/config-server";
import { Button } from "@/components/ui/button";

const authEnabled = process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";

export function Navbar() {
  const config = getConfig();
  return (
    <nav className="fixed top-0 w-full bg-white/80 backdrop-blur-md border-b border-gray-100 z-50">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          {config.brand.logo && <img src={config.brand.logo} alt={config.product.name} className="h-8" />}
          <span className="font-heading font-bold text-lg">{config.product.name}</span>
        </a>
        <div className="hidden md:flex items-center gap-8">
          <a href="#features" className="text-gray-600 hover:text-gray-900 text-sm">Features</a>
          <a href="#pricing" className="text-gray-600 hover:text-gray-900 text-sm">Pricing</a>
          {authEnabled && (
            <>
              <a href="/login" className="text-gray-600 hover:text-gray-900 text-sm">Log in</a>
              <Button href="/signup" size="sm">{config.hero.cta.text}</Button>
            </>
          )}
          {!authEnabled && (
            <Button href={config.hero.cta.href} size="sm">{config.hero.cta.text}</Button>
          )}
        </div>
      </div>
    </nav>
  );
}

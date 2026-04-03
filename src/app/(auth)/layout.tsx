import { config } from "@/lib/config";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-6">
        <div className="text-center mb-8">
          <a href="/" className="inline-flex items-center gap-2">
            <span className="font-heading font-bold text-xl">{config.product.name}</span>
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}

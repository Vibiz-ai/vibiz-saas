import { config } from "@/lib/config";
import * as Icons from "lucide-react";

export function Features() {
  return (
    <section id="features" className="py-24">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-heading font-bold text-gray-900">
            Everything you need
          </h2>
          <p className="text-gray-500 mt-4">
            Built for teams who want to move fast without compromising quality.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mt-16">
          {config.features.map((feature) => {
            const Icon = (Icons as Record<string, React.ComponentType<{ className?: string }>>)[
              feature.icon.charAt(0).toUpperCase() + feature.icon.slice(1).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
            ];
            return (
              <div key={feature.title} className="group p-6 rounded-xl border border-gray-100 hover:border-brand-primary/20 hover:shadow-lg hover:shadow-brand-primary/5 transition-all duration-300">
                <div className="w-12 h-12 bg-brand-primary/10 rounded-lg flex items-center justify-center text-brand-primary mb-4 group-hover:bg-brand-primary group-hover:text-white transition-colors">
                  {Icon && <Icon className="w-6 h-6" />}
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="text-gray-500 mt-2 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

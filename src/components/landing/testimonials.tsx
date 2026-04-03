import { config } from "@/lib/config";

export function Testimonials() {
  return (
    <section className="py-24 bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-gray-900">
          Loved by teams everywhere
        </h2>
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          {config.testimonials.map((t) => (
            <div key={t.name} className="bg-white p-8 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex gap-1 text-yellow-400 mb-4">
                {"★★★★★".split("").map((s, i) => <span key={i}>{s}</span>)}
              </div>
              <p className="text-gray-700 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 mt-6">
                <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary font-bold text-sm">
                  {t.name.split(" ").map((n) => n[0]).join("")}
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">{t.name}</p>
                  <p className="text-gray-400 text-sm">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

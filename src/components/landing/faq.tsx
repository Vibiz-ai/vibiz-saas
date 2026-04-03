"use client";
import { config } from "@/lib/config";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-24">
      <div className="max-w-3xl mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-heading font-bold text-center text-gray-900">
          Frequently asked questions
        </h2>
        <div className="mt-16 space-y-3">
          {config.faq.map((item, i) => (
            <div key={i} className="border border-gray-200 rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-gray-50 transition-colors"
              >
                <span className="font-medium text-gray-900">{item.question}</span>
                <ChevronDown className={cn("w-5 h-5 text-gray-400 transition-transform", open === i && "rotate-180")} />
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-gray-600 text-sm leading-relaxed">
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

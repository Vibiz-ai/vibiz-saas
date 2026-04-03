import type { Metadata } from "next";
import { config } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `${config.product.name} — ${config.product.tagline}`,
  description: config.product.description,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={{
        "--brand-primary": config.brand.colors.primary,
        "--brand-secondary": config.brand.colors.secondary,
        "--brand-accent": config.brand.colors.accent,
        "--brand-bg": config.brand.colors.background,
        "--brand-text": config.brand.colors.foreground,
        "--font-heading": config.brand.fonts.heading,
        "--font-body": config.brand.fonts.body,
      } as React.CSSProperties}
    >
      <head>
        <link
          href={`https://fonts.googleapis.com/css2?family=${config.brand.fonts.heading.replace(/ /g, "+")}:wght@400;500;600;700&family=${config.brand.fonts.body.replace(/ /g, "+")}:wght@400;500&display=swap`}
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

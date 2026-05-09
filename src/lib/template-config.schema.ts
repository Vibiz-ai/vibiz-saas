// Sandbox v2 contract — DO NOT EDIT silently.
// This file is the source of truth for the TemplateConfig payload accepted by
// the in-sandbox runner API. The vibiz platform validates payloads against the
// generated artifacts in `dist-schema/` before sending them across the runner
// boundary. Schema changes here MUST be followed by a regenerated artifact in
// the vibiz repo (see vibiz/docs/sandbox-v2-types-sharing.md, decision C).
//
// Mirror of the runtime shape in vibiz-saas/template.config.ts. Keep in sync.
//
// Conventions:
// - `z.object({...}).strict()` at the root and on every nested object so a
//   stray key (typo, accidental field) fails loud rather than silently
//   round-tripping.
// - Hex colors restricted to 6-digit form (`#rrggbb`), matching the existing
//   chassis values. 3- and 8-digit forms can be added later without breaking.
// - URL fields require well-formed URLs. `cta.href` and footer-link `href`
//   accept relative paths AND absolute URLs AND `mailto:` (mirrors the
//   chassis runtime — see fallbackTiers Enterprise CTA), so they are
//   `z.string().min(1)` rather than `.url()`.
// - Icon names are lucide-react kebab-case strings. Validating them here
//   would couple the schema to the lucide release we ship; we keep it loose
//   and let the chassis renderer fall back gracefully on unknown names.

import { z } from "zod";

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a 6-digit hex color (e.g. #7c3aed)");

// CTA hrefs in the runtime are a mix of:
//   - relative paths    ("/signup", "#features")
//   - absolute URLs     (none today, but the schema must allow them)
//   - mailto: URLs      ("mailto:sales@myproduct.com")
// `z.string().url()` would reject "/signup" and "#features", so we use a
// lenient non-empty string. Validation can be tightened later if we want.
const hrefString = z.string().min(1);

// Lucide icon name. See note above — kept loose on purpose.
const iconName = z.string().min(1);

const productSchema = z
  .object({
    name: z.string().min(1),
    tagline: z.string(),
    description: z.string(),
    url: z.string().url(),
  })
  .strict();

const brandColorsSchema = z
  .object({
    primary: hexColor,
    secondary: hexColor,
    accent: hexColor,
    background: hexColor,
    foreground: hexColor,
  })
  .strict();

const brandFontsSchema = z
  .object({
    heading: z.string().min(1),
    body: z.string().min(1),
  })
  .strict();

const brandSchema = z
  .object({
    colors: brandColorsSchema,
    // Logo can be a relative public path ("/logo.svg") or absolute URL.
    // Treated as a non-empty string for the same reason as `hrefString`.
    logo: z.string().min(1),
    fonts: brandFontsSchema,
  })
  .strict();

const ctaSchema = z
  .object({
    text: z.string().min(1),
    href: hrefString,
  })
  .strict();

const heroSchema = z
  .object({
    headline: z.string().min(1),
    subheadline: z.string(),
    cta: ctaSchema,
    secondaryCta: ctaSchema,
    socialProof: z.string(),
    rating: z.string(),
  })
  .strict();

const featureSchema = z
  .object({
    icon: iconName,
    title: z.string().min(1),
    description: z.string(),
  })
  .strict();

const testimonialSchema = z
  .object({
    quote: z.string().min(1),
    name: z.string().min(1),
    role: z.string(),
  })
  .strict();

const pricingTierSchema = z
  .object({
    name: z.string().min(1),
    price: z.string().min(1),
    // `period` is "" for the Enterprise tier in the runtime config — allow empty.
    period: z.string(),
    description: z.string(),
    features: z.array(z.string()),
    cta: ctaSchema,
    highlighted: z.boolean(),
  })
  .strict();

const pricingSchema = z
  .object({
    headline: z.string().min(1),
    subheadline: z.string(),
    fallbackTiers: z.array(pricingTierSchema),
  })
  .strict();

const faqItemSchema = z
  .object({
    question: z.string().min(1),
    answer: z.string().min(1),
  })
  .strict();

const footerLinkSchema = z
  .object({
    label: z.string().min(1),
    href: hrefString,
  })
  .strict();

const footerSchema = z
  .object({
    links: z.array(footerLinkSchema),
    copyright: z.string(),
  })
  .strict();

const authSchema = z
  .object({
    // Free-form list — chassis only knows "email-password" today, but the
    // platform may seed values like "google", "github" later. Keep open.
    providers: z.array(z.string().min(1)),
  })
  .strict();

const sidebarItemSchema = z
  .object({
    label: z.string().min(1),
    href: hrefString,
    icon: iconName,
  })
  .strict();

const dashboardSchema = z
  .object({
    sidebarItems: z.array(sidebarItemSchema),
  })
  .strict();

export const TemplateConfigSchema = z
  .object({
    // Contract version. Required by the schema even though
    // template.config.ts does NOT carry it yet (the chassis ships without
    // it; the runner injects/strips it at the boundary). Bump this when a
    // breaking field shape change lands.
    schemaVersion: z.literal(1),
    product: productSchema,
    brand: brandSchema,
    hero: heroSchema,
    features: z.array(featureSchema),
    testimonials: z.array(testimonialSchema),
    pricing: pricingSchema,
    faq: z.array(faqItemSchema),
    footer: footerSchema,
    auth: authSchema,
    dashboard: dashboardSchema,
  })
  .strict();

export type TemplateConfig = z.infer<typeof TemplateConfigSchema>;

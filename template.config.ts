export const config = {
  product: {
    name: "MyProduct",
    tagline: "The simplest way to achieve your goals",
    description: "A brief description of what this product does and who it's for.",
    url: "https://myproduct.com",
  },

  brand: {
    colors: {
      primary: "#7c3aed",
      secondary: "#3b82f6",
      accent: "#f59e0b",
      background: "#ffffff",
      foreground: "#111111",
    },
    fonts: {
      heading: "Inter",
      body: "Inter",
    },
    logo: "/logo.svg",
  },

  hero: {
    headline: "Achieve [outcome] without [pain]",
    subheadline: "One sentence explaining how your product helps.",
    cta: { text: "Start Free Trial", href: "/signup" },
    secondaryCta: { text: "See How It Works", href: "#features" },
    socialProof: "Trusted by 10,000+ users",
    rating: "4.9/5 from 2,000+ reviews",
  },

  features: [
    {
      icon: "zap",
      title: "Lightning Fast",
      description: "Get results in minutes, not hours.",
    },
    {
      icon: "shield",
      title: "Secure by Default",
      description: "Enterprise-grade security built in.",
    },
    {
      icon: "bar-chart-3",
      title: "Analytics Dashboard",
      description: "See exactly what's working and what's not.",
    },
    {
      icon: "users",
      title: "Team Collaboration",
      description: "Work together seamlessly with your team.",
    },
    {
      icon: "smartphone",
      title: "Mobile Ready",
      description: "Works perfectly on any device.",
    },
    {
      icon: "clock",
      title: "Save Time",
      description: "Automate the repetitive tasks.",
    },
  ],

  testimonials: [
    {
      quote: "This changed everything for our team. We cut our workflow time in half.",
      name: "Sarah Johnson",
      role: "CEO at TechCorp",
    },
    {
      quote: "The best investment we've made this year. Incredible ROI.",
      name: "Mike Chen",
      role: "Founder at StartupXYZ",
    },
    {
      quote: "Simple, powerful, and just works. No learning curve at all.",
      name: "Emily Rodriguez",
      role: "Product Manager at ScaleUp",
    },
  ],

  pricing: {
    headline: "Simple, transparent pricing",
    subheadline: "Start free. Upgrade when you need to.",
    tiers: [
      {
        name: "Free",
        price: "$0",
        period: "forever",
        description: "For individuals getting started",
        features: ["Up to 3 projects", "Basic analytics", "Community support"],
        cta: { text: "Get Started", href: "/signup" },
        highlighted: false,
        stripePriceId: "",
      },
      {
        name: "Pro",
        price: "$29",
        period: "/month",
        description: "For growing teams",
        features: [
          "Unlimited projects",
          "Advanced analytics",
          "Priority support",
          "Custom integrations",
          "Team collaboration",
        ],
        cta: { text: "Start Free Trial", href: "/signup" },
        highlighted: true,
        stripePriceId: "price_PLACEHOLDER_PRO",
      },
      {
        name: "Enterprise",
        price: "Custom",
        period: "",
        description: "For large organizations",
        features: [
          "Everything in Pro",
          "Dedicated account manager",
          "Custom SLA",
          "SSO / SAML",
          "Audit logs",
        ],
        cta: { text: "Contact Sales", href: "mailto:sales@myproduct.com" },
        highlighted: false,
        stripePriceId: "",
      },
    ],
  },

  faq: [
    {
      question: "How does the free trial work?",
      answer:
        "You get full access to all Pro features for 14 days. No credit card required. Cancel anytime.",
    },
    {
      question: "Can I cancel my subscription?",
      answer:
        "Yes, you can cancel with one click from your dashboard. No questions asked.",
    },
    {
      question: "Do you offer refunds?",
      answer:
        "Yes, we offer a 30-day money-back guarantee. If you're not satisfied, we'll refund you.",
    },
    {
      question: "What payment methods do you accept?",
      answer: "We accept all major credit cards, processed securely through Stripe.",
    },
  ],

  footer: {
    links: [
      { label: "Pricing", href: "/pricing" },
      { label: "Login", href: "/login" },
      { label: "Sign Up", href: "/signup" },
    ],
    copyright: "2026 MyProduct. All rights reserved.",
  },

  auth: {
    providers: ["email-password"] as string[],
  },

  dashboard: {
    sidebarItems: [
      { label: "Home", href: "/dashboard", icon: "home" },
      { label: "AI Playground", href: "/dashboard/ai", icon: "sparkles" },
      { label: "Settings", href: "/dashboard/settings", icon: "settings" },
      { label: "Billing", href: "/dashboard/billing", icon: "credit-card" },
    ],
  },
} as const;

export type SiteConfig = typeof config;

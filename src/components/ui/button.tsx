import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  href?: string;
}

export function Button({ variant = "primary", size = "md", className, href, children, ...props }: ButtonProps) {
  const base = "inline-flex items-center justify-center font-semibold rounded-lg transition-all duration-200";
  const variants = {
    primary: "bg-brand-primary text-white hover:opacity-90 shadow-lg shadow-brand-primary/25",
    secondary: "bg-brand-secondary text-white hover:opacity-90",
    outline: "border-2 border-brand-primary text-brand-primary hover:bg-brand-primary hover:text-white",
    ghost: "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
  };
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3 text-base",
    lg: "px-8 py-4 text-lg",
  };

  const classes = cn(base, variants[variant], sizes[size], className);

  if (href) {
    return <a href={href} className={classes}>{children}</a>;
  }
  return <button className={classes} {...props}>{children}</button>;
}

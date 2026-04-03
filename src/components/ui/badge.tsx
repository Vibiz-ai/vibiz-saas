import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "success" | "warning";
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  const variants = {
    default: "bg-gray-100 text-gray-700",
    primary: "bg-brand-primary/10 text-brand-primary",
    success: "bg-green-100 text-green-700",
    warning: "bg-yellow-100 text-yellow-700",
  };

  return (
    <span className={cn("inline-flex items-center px-3 py-1 rounded-full text-xs font-medium", variants[variant], className)} {...props}>
      {children}
    </span>
  );
}

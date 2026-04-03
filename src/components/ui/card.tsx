import { cn } from "@/lib/utils";

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-white rounded-xl border border-gray-200 shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-0", className)}>{children}</div>;
}

export function CardContent({ className, children }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)}>{children}</div>;
}

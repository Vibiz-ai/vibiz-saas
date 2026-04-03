import { cn } from "@/lib/utils";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>}
      <input
        id={id}
        className={cn(
          "w-full px-4 py-3 rounded-lg border border-gray-300 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all",
          error && "border-red-500 focus:border-red-500 focus:ring-red-500/20",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}

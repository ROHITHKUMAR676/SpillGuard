import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "text";
type Size = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-700",
  secondary: "border border-neutral-300 bg-transparent text-navy-900 hover:bg-navy-50",
  text: "bg-transparent text-navy-500 hover:text-navy-700"
};

const sizes: Record<Size, string> = {
  md: "h-9 px-4 text-body-medium",
  sm: "h-7 px-3 text-caption"
};

export function Button({ variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  return (
    <button className={`inline-flex items-center justify-center rounded-sm font-medium ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  );
}

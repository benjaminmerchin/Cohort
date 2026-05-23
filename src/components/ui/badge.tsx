import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-widest",
  {
    variants: {
      variant: {
        default: "border-white/15 bg-white/[0.04] text-white/80",
        success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        critical: "border-red-500/40 bg-red-500/10 text-red-300",
        high: "border-orange-500/40 bg-orange-500/10 text-orange-300",
        medium: "border-amber-500/30 bg-amber-500/10 text-amber-300",
        low: "border-sky-500/30 bg-sky-500/10 text-sky-300",
        outline: "border-white/15 bg-transparent text-white/70",
        live: "border-red-500/30 bg-red-500/10 text-red-300",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

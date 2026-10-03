import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "muted",
  children,
}: {
  className?: string;
  tone?: "muted" | "success" | "warn" | "accent";
  children: ReactNode;
}) {
  const tones = {
    muted: "bg-raised text-muted shadow-[var(--shadow-border)]",
    success: "bg-success/15 text-success",
    warn: "bg-warn/15 text-warn",
    accent: "bg-accent text-accent-fg",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

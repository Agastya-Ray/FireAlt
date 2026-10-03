import type { ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, Flame, KeyRound } from "lucide-react";
import { Spark } from "./spark";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Playground", icon: Flame },
  { to: "/connect", label: "Connect", icon: KeyRound },
  { to: "/docs", label: "API", icon: BookOpen },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-dvh overflow-x-hidden bg-bg text-fg">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(1200px_500px_at_12%_-10%,rgba(232,226,214,0.05),transparent_55%)]" />
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 text-fg">
            <span className="flex size-8 items-center justify-center rounded-md bg-raised shadow-[var(--shadow-border)]">
              <Spark className="size-4 text-accent" />
            </span>
            <span className="font-display text-lg tracking-tight">Ember</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = pathname === item.to;
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-md px-2.5 text-sm transition-colors duration-150 sm:px-3",
                    active ? "bg-raised text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.75} />
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <div className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</div>
    </div>
  );
}

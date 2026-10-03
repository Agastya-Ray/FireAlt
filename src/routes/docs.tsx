import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { DocsPanel } from "@/components/docs-panel";

export const Route = createFileRoute("/docs")({ component: DocsPage });

function DocsPage() {
  return (
    <AppShell>
      <DocsPanel />
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { ConnectPanel } from "@/components/connect-panel";

export const Route = createFileRoute("/connect")({ component: ConnectPage });

function ConnectPage() {
  return (
    <AppShell>
      <ConnectPanel />
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Playground } from "@/components/playground";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <AppShell>
      <Playground />
    </AppShell>
  );
}

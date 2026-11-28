"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PetstoreLaunch({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const exampleResponse = await fetch("/api/examples/petstore");
      const example = (await exampleResponse.json()) as { specText?: string; tasks?: string[]; error?: string };
      if (!exampleResponse.ok || !example.specText || !example.tasks) {
        throw new Error(example.error || "Could not load the Petstore example.");
      }
      const runResponse = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ specText: example.specText, tasks: example.tasks }),
      });
      const created = (await runResponse.json()) as { id?: string; cached?: boolean; error?: string };
      if (!runResponse.ok || !created.id) throw new Error(created.error || "Could not start the Petstore run.");
      router.push(created.cached ? `/r/${created.id}?cached=1` : `/r/${created.id}`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Could not start the Petstore run.");
    }
  }

  return (
    <div>
      <button type="button" onClick={start} disabled={busy} className={className}>
        {busy ? "Starting Petstore…" : "Try Petstore"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 max-w-md text-sm text-clay">
          {error}
        </p>
      ) : null}
    </div>
  );
}

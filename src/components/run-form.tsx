"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ProviderInfo, StorageMode } from "@/lib/types";

type ParsedPreview = {
  title: string;
  version: string;
  openapi: string;
  operationCount: number;
  trimmedFrom: number | null;
  warnings: string[];
  convertedFrom: string | null;
  operations: { method: string; path: string; summary: string }[];
  specText: string;
};

export function RunForm({
  providers,
  storage,
  notice,
}: {
  providers: ProviderInfo[];
  storage: StorageMode;
  notice: string | null;
}) {
  const router = useRouter();
  const [specText, setSpecText] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<ParsedPreview | null>(null);
  const [tasks, setTasks] = useState(["", "", ""]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readyTasks = useMemo(() => tasks.map((task) => task.trim()).filter(Boolean), [tasks]);

  async function parseSource(payload: { text?: string; url?: string }) {
    setBusy("Reading the spec");
    setError(null);
    const response = await fetch("/api/specs/parse", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await response.json()) as ParsedPreview & { error?: string };
    setBusy(null);
    if (!response.ok) {
      setPreview(null);
      setError(body.error || "Could not read that spec.");
      return;
    }
    setPreview(body);
    setSpecText(body.specText);
  }

  async function loadPetstore() {
    setBusy("Loading Petstore");
    setError(null);
    const response = await fetch("/api/examples/petstore");
    const body = (await response.json()) as { specText: string; tasks: string[]; error?: string };
    setBusy(null);
    if (!response.ok) {
      setError(body.error || "Could not load Petstore.");
      return;
    }
    setSpecText(body.specText);
    setTasks(body.tasks);
    await parseSource({ text: body.specText });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setSpecText(text);
    await parseSource({ text });
  }

  async function suggest() {
    if (!specText) {
      setError("Validate a spec before asking for tasks.");
      return;
    }
    setBusy("Suggesting tasks");
    setError(null);
    const response = await fetch("/api/tasks/suggest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ specText }),
    });
    const body = (await response.json()) as { tasks?: string[]; source?: string; error?: string };
    setBusy(null);
    if (!response.ok || !body.tasks) {
      setError(body.error || "Could not suggest tasks.");
      return;
    }
    const next = body.tasks.slice(0, 10);
    while (next.length < 3) next.push("");
    setTasks(next);
  }

  async function run() {
    setBusy("Starting the run");
    setError(null);
    const response = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ specText, tasks: readyTasks }),
    });
    const body = (await response.json()) as { id?: string; cached?: boolean; error?: string };
    setBusy(null);
    if (!response.ok || !body.id) {
      setError(body.error || "Could not start the run.");
      return;
    }
    router.push(body.cached ? `/r/${body.id}?cached=1` : `/r/${body.id}`);
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1.2fr_0.8fr]">
      <div className="space-y-8">
        <section>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">1 · Spec</p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">Give it an OpenAPI spec.</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
            JSON or YAML, OpenAPI 3.x. Swagger 2.0 is converted. A public URL is fetched with private addresses blocked. Nothing here calls the real API.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={loadPetstore} className="rounded-full bg-pine px-4 py-2 text-sm text-card">
              Try Petstore
            </button>
            <label className="cursor-pointer rounded-full bg-sand px-4 py-2 text-sm">
              Upload file
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,text/yaml"
                className="sr-only"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </label>
          </div>
          <label className="mt-4 block text-sm">
            Public spec URL
            <div className="mt-1 flex gap-2">
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
                className="w-full rounded-md border border-line bg-card px-3 py-2"
              />
              <button type="button" className="rounded-md bg-ink px-3 py-2 text-card" onClick={() => parseSource({ url })}>
                Fetch
              </button>
            </div>
          </label>
          <label className="mt-4 block text-sm">
            Or paste the document
            <textarea
              value={specText}
              onChange={(event) => setSpecText(event.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-line bg-card px-3 py-2 font-mono text-xs"
              placeholder='{"openapi":"3.0.3","info":{"title":"Example","version":"1"},"paths":{}}'
            />
          </label>
          <button type="button" className="mt-3 text-sm text-pine" onClick={() => parseSource({ text: specText })}>
            Validate
          </button>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">2 · Tasks</p>
            <button type="button" onClick={suggest} className="text-sm text-pine">
              Suggest tasks
            </button>
          </div>
          <p className="mt-2 text-sm text-muted">Three to ten jobs, in the words a teammate would use. Suggestions stay editable.</p>
          <div className="mt-3 space-y-2">
            {tasks.map((task, index) => (
              <div key={index} className="flex gap-2">
                <input
                  value={task}
                  onChange={(event) => setTasks(tasks.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))}
                  className="w-full rounded-md border border-line bg-card px-3 py-2 text-sm"
                  placeholder="Create a customer, then fetch their invoice"
                />
                {tasks.length > 3 ? (
                  <button type="button" className="text-sm text-muted" onClick={() => setTasks(tasks.filter((_, itemIndex) => itemIndex !== index))}>
                    Remove
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {tasks.length < 10 ? (
            <button type="button" className="mt-2 text-sm text-pine" onClick={() => setTasks([...tasks, ""])}>
              Add a task
            </button>
          ) : null}
        </section>
      </div>

      <aside className="h-fit rounded-lg border border-line bg-card p-5">
        <p className="text-xs uppercase tracking-[0.16em] text-muted">3 · Run</p>
        <ul className="mt-3 space-y-2 text-sm">
          {providers.map((provider) => (
            <li key={provider.id} className="flex items-center justify-between gap-3">
              <span>{provider.label}</span>
              <span className="text-xs uppercase tracking-wide text-muted">{provider.kind}</span>
            </li>
          ))}
          {!providers.length ? <li>No model key is configured.</li> : null}
        </ul>
        {notice ? <p className="mt-3 text-sm leading-6 text-pine-deep">{notice}</p> : null}
        <p className="mt-3 text-xs text-muted">
          Storage: {storage === "postgres" ? "Postgres" : "memory on this server. Set DATABASE_URL to keep reports."}
        </p>
        {preview ? (
          <div className="mt-4 border-t border-line pt-4 text-sm">
            <p className="font-medium">
              {preview.title} · {preview.openapi}
            </p>
            <p className="text-muted">
              {preview.operationCount} operations
              {preview.trimmedFrom ? ` (trimmed from ${preview.trimmedFrom})` : ""}
              {preview.convertedFrom ? " · converted from Swagger 2.0" : ""}
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {preview.operations.map((operation) => (
                <li key={`${operation.method}${operation.path}`}>
                  {operation.method} {operation.path}
                </li>
              ))}
            </ul>
            {preview.warnings.map((warning) => (
              <p key={warning} className="mt-2 text-xs text-muted">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-clay">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p className="mt-4 text-sm" role="status">
            {busy}…
          </p>
        ) : null}
        <button
          type="button"
          disabled={Boolean(busy) || readyTasks.length < 3 || !specText}
          onClick={run}
          className="mt-5 w-full rounded-full bg-ink px-4 py-3 text-sm text-card disabled:opacity-40"
        >
          Run {readyTasks.length || 0} tasks
        </button>
      </aside>
    </div>
  );
}

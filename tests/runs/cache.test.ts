import { describe, expect, it } from "vitest";
import { createScriptedProvider } from "@/lib/agent/scripted";
import { createMemoryStore } from "@/lib/db/store";
import { createRun } from "@/lib/runs/service";

const spec = JSON.stringify({
  openapi: "3.0.3",
  info: { title: "Cache shop", version: "1" },
  paths: {
    "/pets": {
      post: {
        operationId: "addPet",
        summary: "Add a pet",
        responses: { "200": { description: "ok" } },
      },
    },
    "/pets/{petId}": {
      get: {
        operationId: "getPet",
        summary: "Fetch a pet by id",
        parameters: [{ name: "petId", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "ok" } },
      },
    },
    "/store/inventory": {
      get: {
        operationId: "inventory",
        summary: "List inventory",
        responses: { "200": { description: "ok" } },
      },
    },
  },
});

const tasks = ["Add a pet named Demo, then fetch that pet by its id.", "List inventory.", "Add a pet named Other."];

describe("run cache", () => {
  it("does not reuse a finished run that left a model unscored", async () => {
    const store = createMemoryStore();
    const providers = [createScriptedProvider({ id: "groq", label: "Groq · scripted" })];
    providers[0].model = "openai/gpt-oss-120b";
    const first = await createRun({ specText: spec, tasks, store, providers, skipRateLimit: true });
    const results = await store.listResults(first.id);
    await store.saveResult(results[0].id, { status: "error", passed: null, error: "Timed out" });
    await store.markRun(first.id, "complete");
    const second = await createRun({ specText: spec, tasks, store, providers, skipRateLimit: true });
    expect(second.cached).toBe(false);
    expect(second.id).not.toBe(first.id);
  });

  it("changes the cache key when the model id changes", async () => {
    const store = createMemoryStore();
    const firstProvider = createScriptedProvider({ id: "groq", label: "Groq · old" });
    firstProvider.model = "openai/gpt-oss-20b";
    const created = await createRun({ specText: spec, tasks, store, providers: [firstProvider], skipRateLimit: true });
    for (const result of await store.listResults(created.id)) {
      await store.saveResult(result.id, { status: "done", passed: true });
    }
    await store.markRun(created.id, "complete");
    const nextProvider = createScriptedProvider({ id: "groq", label: "Groq · new" });
    nextProvider.model = "openai/gpt-oss-120b";
    const again = await createRun({ specText: spec, tasks, store, providers: [nextProvider], skipRateLimit: true });
    expect(again.cached).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createScriptedProvider } from "@/lib/agent/scripted";
import { createMemoryStore } from "@/lib/db/store";
import { assertAdminRequest, seedGalleryStep } from "@/lib/gallery/seed";

describe("gallery seed", () => {
  it("rejects a missing admin token and accepts the right one", () => {
    const previous = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = "";
    expect(() => assertAdminRequest(new Request("http://localhost/api/admin/gallery/seed"))).toThrow(/Set ADMIN_TOKEN/);
    process.env.ADMIN_TOKEN = "secret-token";
    expect(() =>
      assertAdminRequest(new Request("http://localhost/api/admin/gallery/seed", { headers: { authorization: "Bearer wrong" } })),
    ).toThrow(/rejected/);
    expect(() =>
      assertAdminRequest(
        new Request("http://localhost/api/admin/gallery/seed", { headers: { authorization: "Bearer secret-token" } }),
      ),
    ).not.toThrow();
    process.env.ADMIN_TOKEN = previous;
  });

  it("scores one spec in chunks and then starts the next", async () => {
    const store = createMemoryStore();
    const providers = [
      createScriptedProvider({ id: "groq", label: "Groq · scripted" }),
      createScriptedProvider({ id: "gemini", label: "Gemini · scripted" }),
    ];
    let step = await seedGalleryStep({ session: "testseed1", store, providers });
    expect(step.slug).toBe("petstore");
    expect(step.done).toBe(false);
    for (let guard = 0; guard < 8 && !step.completedSpecs.includes("petstore"); guard += 1) {
      step = await seedGalleryStep({ session: "testseed1", store, providers });
    }
    expect(step.completedSpecs).toContain("petstore");
    const gallery = await store.listGallery();
    expect(gallery.map((entry) => entry.slug)).toContain("petstore");

    const next = await seedGalleryStep({ session: "testseed1", store, providers });
    expect(next.slug).toBe("github");
    expect(next.done).toBe(false);
    expect(next.completedSpecs).toContain("petstore");
  });

  it("re-runs only gallery entries that were unscored", async () => {
    const store = createMemoryStore();
    const providers = [createScriptedProvider({ id: "groq", label: "Groq · scripted" })];
    const scored = await storeCreate(store, providers, "Scored");
    for (const result of await store.listResults(scored)) await store.saveResult(result.id, { status: "done", passed: true });
    await store.markRun(scored, "complete");
    const unscored = await storeCreate(store, providers, "Unscored");
    const rows = await store.listResults(unscored);
    await store.saveResult(rows[0].id, { status: "error", passed: null, error: "Timed out" });
    for (const result of rows.slice(1)) await store.saveResult(result.id, { status: "done", passed: true });
    await store.markRun(unscored, "complete");
    await store.upsertGallery("github", scored);
    await store.upsertGallery("petstore", unscored);

    const step = await seedGalleryStep({ session: "rerun01", store, providers, rerunUnscored: true });
    expect(step.slug).toBe("petstore");
    expect(step.remainingSpecs).toEqual(["petstore"]);
  });
});

async function storeCreate(
  store: ReturnType<typeof createMemoryStore>,
  providers: ReturnType<typeof createScriptedProvider>[],
  title: string,
) {
  const { createRun } = await import("@/lib/runs/service");
  const created = await createRun({
    specText: JSON.stringify({
      openapi: "3.0.3",
      info: { title, version: "1" },
      paths: {
        "/ping": { get: { operationId: "ping", summary: "Ping", responses: { "200": { description: "ok" } } } },
        "/pong": { get: { operationId: "pong", summary: "Pong", responses: { "200": { description: "ok" } } } },
        "/done": { get: { operationId: "done", summary: "Done", responses: { "200": { description: "ok" } } } },
      },
    }),
    tasks: ["Ping.", "Pong.", "Done."],
    store,
    providers,
    skipRateLimit: true,
    bypassCache: true,
  });
  return created.id;
}

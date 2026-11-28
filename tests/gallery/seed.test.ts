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
});

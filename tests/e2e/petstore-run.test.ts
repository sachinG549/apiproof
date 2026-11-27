import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { createScriptedProvider } from "@/lib/agent/scripted";
import { createMemoryStore } from "@/lib/db/store";
import { GALLERY_SOURCES } from "@/lib/gallery/sources";
import { advanceRun, createRun } from "@/lib/runs/service";

const petstore = GALLERY_SOURCES.find((source) => source.slug === "petstore");
if (!petstore) throw new Error("Petstore is missing from the gallery catalog.");

describe("petstore run", () => {
  it("compares two stub agents and records pass, fail, and a trace", async () => {
    const specText = readFileSync(path.join(process.cwd(), "src/data/gallery/petstore.json"), "utf8");
    const store = createMemoryStore();
    const careful = createScriptedProvider({ id: "careful", label: "Careful stub" });
    const careless = createScriptedProvider({
      id: "careless",
      label: "Careless stub",
      failPattern: /delete/i,
    });
    const created = await createRun({
      specText,
      tasks: petstore.tasks,
      store,
      providers: [careful, careless],
      skipRateLimit: true,
    });
    let report = await advanceRun(created.id, store, [careful, careless]);
    let guard = 0;
    while (report.run.status !== "complete" && guard < 20) {
      guard += 1;
      report = await advanceRun(created.id, store, [careful, careless]);
    }

    expect(report.run.status).toBe("complete");
    expect(report.run.specTitle).toMatch(/Petstore/i);
    const carefulSummary = report.summary.models.find((model) => model.modelId === "careful");
    const carelessSummary = report.summary.models.find((model) => model.modelId === "careless");
    expect(carefulSummary?.passed).toBe(petstore.tasks.length);
    expect(carelessSummary && carefulSummary && carelessSummary.passed < carefulSummary.passed).toBe(true);
    expect(carelessSummary?.failed).toBe(1);

    const failed = report.results.find((result) => result.modelId === "careless" && result.passed === false);
    expect(failed?.failureMode).toBeTruthy();
    expect(failed?.steps.length).toBeGreaterThan(0);
    expect(failed?.suggestion?.path).toBeTruthy();

    const passed = report.results.find((result) => result.modelId === "careful" && result.taskIndex === 0);
    expect(passed?.passed).toBe(true);
    expect(passed?.steps.some((step) => step.kind === "tool" && step.status && step.status < 300)).toBe(true);

    const again = await createRun({
      specText,
      tasks: petstore.tasks,
      store,
      providers: [careful, careless],
      skipRateLimit: true,
    });
    expect(again.cached).toBe(true);
    expect(again.id).toBe(created.id);
  });
});

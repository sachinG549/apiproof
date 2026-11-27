import { readFileSync } from "fs";
import path from "path";
import { GALLERY_SOURCES } from "../src/lib/gallery/sources";
import { getStore } from "../src/lib/db";
import { advanceRun, createRun, getReport } from "../src/lib/runs/service";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required. The gallery is stored in Postgres, not invented locally.");
    process.exit(1);
  }
  if (!process.env.GROQ_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error("Set GROQ_API_KEY or GEMINI_API_KEY. The gallery seed refuses to store stub-agent results.");
    process.exit(1);
  }
  if (process.env.ALLOW_STUB_LLM === "1") {
    console.error("Unset ALLOW_STUB_LLM. Gallery results must come from a real model.");
    process.exit(1);
  }

  const store = getStore();
  for (const source of GALLERY_SOURCES) {
    const file = path.join(process.cwd(), "src/data/gallery", `${source.slug}.json`);
    const specText = readFileSync(file, "utf8");
    console.log(`\n${source.name}`);
    const created = await createRun({
      specText,
      tasks: source.tasks,
      ip: "gallery-seed",
      store,
      skipRateLimit: true,
      bypassCache: true,
      noticeExtra: source.note,
    });
    let report = await getReport(created.id, store);
    let guard = 0;
    while (report && report.run.status !== "complete" && report.run.status !== "error" && guard < 80) {
      guard += 1;
      report = await advanceRun(created.id, store);
      const done = report.results.filter((result) => result.status === "done" || result.status === "error").length;
      console.log(`  ${done}/${report.results.length} ${report.summary.models.map((model) => `${model.modelLabel} ${model.passed}/${model.total - model.unscored || model.total}`).join(" · ")}`);
    }
    if (!report || report.run.status !== "complete") {
      throw new Error(`${source.slug} did not finish (status ${report?.run.status || "missing"}).`);
    }
    await store.upsertGallery(source.slug, created.id);
    const summary = report.summary.models
      .map((model) => `${model.modelLabel}: ${model.passed} passed, ${model.failed} failed, ${model.unscored} unscored`)
      .join("; ");
    console.log(`  stored ${created.id} — ${summary}`);
  }
  console.log("\nGallery seed complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

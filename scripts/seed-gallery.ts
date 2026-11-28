import { seedGalleryStep } from "../src/lib/gallery/seed";

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

  const session = `local${Date.now().toString(36)}`.slice(0, 40);
  for (let step = 0; step < 200; step += 1) {
    const result = await seedGalleryStep({ session });
    const where = result.slug ? `${result.slug} ${result.status}` : "idle";
    console.log(`${result.completedSpecs.length} done, ${result.remainingSpecs.length} left · ${where}`);
    if (result.done) {
      console.log("Gallery seed complete.");
      return;
    }
  }
  throw new Error("Gallery seed did not finish within 200 chunks.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

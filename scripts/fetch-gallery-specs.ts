import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { GALLERY_SOURCES } from "../src/lib/gallery/sources";
import { freezeSpec } from "../src/lib/spec/compact";
import { parseSpec } from "../src/lib/spec/parse";
import { trimDocument } from "../src/lib/spec/trim";

async function main() {
  const outDir = path.join(process.cwd(), "src/data/gallery");
  mkdirSync(outDir, { recursive: true });
  for (const source of GALLERY_SOURCES) {
    process.stdout.write(`fetch ${source.slug} … `);
    const response = await fetch(source.sourceUrl, {
      headers: { "user-agent": "APIProofGalleryFetch/1.0", accept: "application/json, application/yaml, text/yaml, */*" },
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new Error(`${source.slug} returned HTTP ${response.status} from ${source.sourceUrl}`);
    const text = await response.text();
    const raw = looksLikeJson(text) ? JSON.parse(text) : parseYaml(text, { maxAliasCount: 50_000 });
    const keep = source.paths ? (specPath: string) => source.paths?.includes(specPath) || false : () => true;
    const trimmed = trimDocument(raw, keep);
    if (source.paths) {
      const missing = source.paths.filter((specPath) => !trimmed.document.paths || !(specPath in (trimmed.document.paths as object)));
      if (missing.length) throw new Error(`${source.slug} is missing paths: ${missing.join(", ")}`);
    }
    const frozen = freezeSpec(parseSpec(trimmed.document));
    const file = path.join(outDir, `${source.slug}.json`);
    const body = JSON.stringify(frozen.document);
    writeFileSync(file, body);
    console.log(`${frozen.operations.length}/${trimmed.total} operations, ${Buffer.byteLength(body)} bytes`);
  }
}

function looksLikeJson(text: string): boolean {
  const start = text.trimStart()[0];
  return start === "{" || start === "[";
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

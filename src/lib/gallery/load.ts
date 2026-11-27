import { readFileSync } from "fs";
import path from "path";
import { GALLERY_SOURCES, type GallerySource } from "@/lib/gallery/sources";
import { parseSpec } from "@/lib/spec/parse";
import type { ParsedSpec } from "@/lib/types";

export function loadGallerySpec(slug: string): { source: GallerySource; spec: ParsedSpec; text: string } {
  const source = GALLERY_SOURCES.find((item) => item.slug === slug);
  if (!source) throw new Error(`Unknown gallery spec ${slug}`);
  const text = readFileSync(path.join(process.cwd(), "src/data/gallery", `${slug}.json`), "utf8");
  return { source, spec: parseSpec(text), text };
}

export function loadGalleryCatalog(): { source: GallerySource; spec: ParsedSpec }[] {
  return GALLERY_SOURCES.map((source) => {
    const loaded = loadGallerySpec(source.slug);
    return { source, spec: loaded.spec };
  });
}

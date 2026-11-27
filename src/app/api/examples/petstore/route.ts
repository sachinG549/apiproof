import { NextResponse } from "next/server";
import { loadGallerySpec } from "@/lib/gallery/load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const { source, text, spec } = loadGallerySpec("petstore");
  return NextResponse.json({
    title: spec.title,
    specText: text,
    tasks: source.tasks,
    note: source.note,
  });
}

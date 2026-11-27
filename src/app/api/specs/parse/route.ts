import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { respond } from "@/lib/http";
import { fetchPublicSpec } from "@/lib/spec/fetch-url";
import { parseSpec } from "@/lib/spec/parse";
import { limitOperations } from "@/lib/spec/trim";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = (await request.json()) as { text?: string; url?: string; tasks?: string[] };
    const text = body.url ? await fetchPublicSpec(body.url) : body.text || "";
    if (!text.trim()) throw new UserError("Paste a spec, upload a file, or provide a public URL.");
    if (text.length > getConfig().maxSpecBytes) throw new UserError("That spec is over the size limit.");
    const parsed = limitOperations(parseSpec(text), Array.isArray(body.tasks) ? body.tasks.map(String) : [], getConfig().maxOperations);
    return NextResponse.json({
      title: parsed.title,
      version: parsed.version,
      openapi: parsed.openapi,
      description: parsed.description,
      operationCount: parsed.operations.length,
      trimmedFrom: parsed.trimmedFrom || null,
      warnings: parsed.warnings,
      convertedFrom: parsed.convertedFrom || null,
      operations: parsed.operations.slice(0, 12).map((operation) => ({
        method: operation.method.toUpperCase(),
        path: operation.path,
        summary: operation.summary,
      })),
      specText: JSON.stringify(parsed.document),
    });
  });
}

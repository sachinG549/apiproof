import { NextResponse } from "next/server";
import { respond } from "@/lib/http";
import { listProviders } from "@/lib/agent/providers";
import { parseSpec } from "@/lib/spec/parse";
import { suggestTasks } from "@/lib/tasks/suggest";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = (await request.json()) as { specText?: string };
    if (!body.specText?.trim()) throw new UserError("Validate a spec before asking for tasks.");
    const spec = parseSpec(body.specText);
    const provider = listProviders().find((item) => item.kind !== "stub");
    const suggested = await suggestTasks(spec, provider);
    return NextResponse.json(suggested);
  });
}

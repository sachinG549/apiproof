import { NextResponse } from "next/server";
import { respond } from "@/lib/http";
import { createRun } from "@/lib/runs/service";
import { clientIp } from "@/lib/util";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    const body = (await request.json()) as { specText?: string; tasks?: string[] };
    if (!body.specText?.trim()) throw new UserError("Add an OpenAPI spec before running.");
    const created = await createRun({
      specText: body.specText,
      tasks: body.tasks || [],
      ip: clientIp(request),
    });
    return NextResponse.json(created);
  });
}

import { NextResponse } from "next/server";
import { respond } from "@/lib/http";
import { advanceRun } from "@/lib/runs/service";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await context.params;
    const report = await advanceRun(id);
    return NextResponse.json(report);
  });
}

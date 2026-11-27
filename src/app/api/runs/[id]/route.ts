import { NextResponse } from "next/server";
import { respond } from "@/lib/http";
import { getReport } from "@/lib/runs/service";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await context.params;
    const report = await getReport(id);
    if (!report) throw new UserError("That run does not exist.", 404);
    return NextResponse.json(report);
  });
}

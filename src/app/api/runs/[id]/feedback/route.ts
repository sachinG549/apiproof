import { NextResponse } from "next/server";
import { respond } from "@/lib/http";
import { saveFeedback } from "@/lib/runs/service";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await context.params;
    const body = (await request.json()) as { useful?: boolean; comment?: string };
    if (typeof body.useful !== "boolean") throw new UserError("Choose yes or no.");
    await saveFeedback({ runId: id, useful: body.useful, comment: body.comment });
    return NextResponse.json({ ok: true });
  });
}

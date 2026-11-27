import { NextResponse } from "next/server";
import { assertAdminRequest, sanitizeSession, seedGalleryStep } from "@/lib/gallery/seed";
import { respond } from "@/lib/http";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return respond(async () => {
    assertAdminRequest(request);
    const body = (await request.json().catch(() => ({}))) as { session?: string };
    const session = sanitizeSession(body.session) || defaultSession();
    if (!sanitizeSession(session)) throw new UserError("The session id was not usable.");
    const step = await seedGalleryStep({ session });
    return NextResponse.json(step);
  });
}

function defaultSession(): string {
  return new Date().toISOString().slice(0, 13).replace(/[-:T]/g, "");
}

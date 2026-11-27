import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";
import { respond } from "@/lib/http";
import { UserError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return respond(async () => {
    const config = getConfig();
    if (config.adminToken) {
      const header = request.headers.get("authorization");
      const url = new URL(request.url);
      const token = header?.replace(/^Bearer\s+/i, "") || url.searchParams.get("token") || "";
      if (token !== config.adminToken) throw new UserError("Stats are locked. Provide the admin token.", 401);
    }
    const stats = await getStore().stats();
    return NextResponse.json(stats);
  });
}

import { NextResponse } from "next/server";
import { describeProviders, providerNotice } from "@/lib/agent/providers";
import { storageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export function GET() {
  const providers = describeProviders();
  return NextResponse.json({
    providers,
    notice: providerNotice(providers),
    storage: storageMode(),
  });
}

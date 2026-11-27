import type { Metadata } from "next";
import { RunForm } from "@/components/run-form";
import { describeProviders, providerNotice } from "@/lib/agent/providers";
import { storageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New run" };

export default function NewRunPage() {
  const providers = describeProviders();
  return <RunForm providers={providers} storage={storageMode()} notice={providerNotice(providers)} />;
}

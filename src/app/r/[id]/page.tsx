import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportLive } from "@/components/report-live";
import { getConfig } from "@/lib/config";
import { getReport } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = await getReport(id);
  const siteUrl = getConfig().siteUrl.replace(/\/$/, "");
  const canonical = `${siteUrl}/r/${id}`;
  if (!report) return { title: "Report", alternates: { canonical } };
  const bits = report.summary.models.map((model) => {
    const decided = model.passed + model.failed;
    const rate = decided ? Math.round((model.passed / decided) * 100) : null;
    return `${model.modelLabel} ${rate == null ? "n/a" : `${rate}%`}`;
  });
  return {
    title: report.run.specTitle,
    description: bits.join(" · ") || "APIProof run",
    alternates: { canonical },
    openGraph: {
      title: `${report.run.specTitle} · APIProof`,
      description: bits.join(" · "),
      url: canonical,
      images: [{ url: `${canonical}/opengraph-image`, width: 1200, height: 630, alt: report.run.specTitle }],
    },
  };
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cached?: string }>;
}) {
  const { id } = await params;
  const { cached } = await searchParams;
  const report = await getReport(id);
  if (!report) notFound();
  if (cached === "1") report.run.cached = true;
  return <ReportLive initial={report} />;
}

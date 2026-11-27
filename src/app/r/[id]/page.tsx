import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportLive } from "@/components/report-live";
import { getReport } from "@/lib/runs/service";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = await getReport(id);
  if (!report) return { title: "Report" };
  const bits = report.summary.models.map((model) => {
    const decided = model.passed + model.failed;
    const rate = decided ? Math.round((model.passed / decided) * 100) : null;
    return `${model.modelLabel} ${rate == null ? "n/a" : `${rate}%`}`;
  });
  return {
    title: report.run.specTitle,
    description: bits.join(" · ") || "APIProof run",
    openGraph: {
      title: `${report.run.specTitle} · APIProof`,
      description: bits.join(" · "),
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

import type { Metadata } from "next";
import { ReportView } from "@/components/report-view";
import { SAMPLE_REPORT } from "@/lib/sample-report";

export const metadata: Metadata = { title: "Report layout" };

export default function ExamplePage() {
  return <ReportView report={SAMPLE_REPORT} illustrative />;
}

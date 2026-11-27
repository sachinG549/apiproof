import { ImageResponse } from "next/og";
import { getReport } from "@/lib/runs/service";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await getReport(id);
  const title = report?.run.specTitle || "APIProof run";
  const lines = report
    ? report.summary.models.map((model) => {
        const decided = model.passed + model.failed;
        const rate = decided ? `${Math.round((model.passed / decided) * 100)}%` : "n/a";
        return `${model.modelLabel}  ${rate}`;
      })
    : ["Run not found"];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f3ecdf",
          color: "#1c1612",
          padding: "64px",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, color: "#1f5c40" }}>APIPROOF</div>
        <div style={{ display: "flex", flexDirection: "column", fontSize: 68, lineHeight: 1.05 }}>{title}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 32 }}>
          {lines.map((line) => (
            <div key={line} style={{ display: "flex" }}>
              {line}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

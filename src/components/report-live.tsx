"use client";

import { useEffect, useState } from "react";
import { ReportView } from "@/components/report-view";
import type { PublicReport } from "@/lib/types";

export function ReportLive({ initial }: { initial: PublicReport }) {
  const [report, setReport] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      let status = initial.run.status;
      while (!cancelled && status !== "complete" && status !== "error") {
        const response = await fetch(`/api/runs/${initial.run.id}/advance`, { method: "POST" });
        const body = (await response.json()) as PublicReport & { error?: string };
        if (!response.ok) {
          if (!cancelled) setError(body.error || "The run paused. Refresh to continue.");
          return;
        }
        if (cancelled) return;
        setReport(body);
        status = body.run.status;
      }
    }
    void loop();
    return () => {
      cancelled = true;
    };
  }, [initial.run.id, initial.run.status]);

  return (
    <ReportView
      report={report}
      error={error}
    />
  );
}

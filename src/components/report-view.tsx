import type { PublicReport } from "@/lib/types";
import { FeedbackForm } from "@/components/feedback-form";
import { unscoredReason, unscoredReasons } from "@/lib/unscored";

const FAILURE_LABELS: Record<string, string> = {
  wrong_operation: "Wrong operation",
  missing_parameter: "Missing parameter",
  ambiguous_parameter: "Ambiguous parameter",
  unclear_id_linkage: "Unclear id linkage",
  auth_confusion: "Auth confusion",
  schema_mismatch: "Schema mismatch",
  gave_up: "Gave up",
  hallucinated_endpoint: "Hallucinated endpoint",
  quota_exhausted: "Quota exhausted",
  judge_unverified: "Judge unverified",
};

export function ReportView({
  report,
  illustrative = false,
  error,
}: {
  report: PublicReport;
  illustrative?: boolean;
  error?: string | null;
}) {
  const done = report.results.filter((result) => result.status === "done" || result.status === "error").length;
  const total = report.results.length || 1;
  return (
    <article className="mx-auto max-w-6xl px-5 py-10">
      {illustrative ? (
        <p className="mb-6 rounded-md border border-gold bg-gold/20 px-4 py-3 text-sm">
          This is an illustration of the report layout, not a measured run. Pass rates on this page were written by hand so you can see the shape of a result.
        </p>
      ) : null}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">
            {report.run.openapi} · {report.run.operationCount} operations
            {report.run.trimmed ? " · trimmed" : ""}
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight sm:text-5xl">{report.run.specTitle}</h1>
          <p className="mt-2 text-sm text-muted">
            {new Date(report.run.createdAt).toLocaleString()} · {report.run.tasks.length} tasks · {report.run.status}
          </p>
        </div>
        {report.run.status !== "complete" && report.run.status !== "error" ? (
          <p className="text-sm" role="status">
            Scoring {done} of {report.results.length || "…"} model attempts. This page updates as each task finishes.
          </p>
        ) : null}
      </header>
      {report.run.cached ? (
        <p className="mt-4 max-w-3xl text-sm">This matches an earlier run of the same spec and tasks, so you are seeing that report. It did not count against the daily limit.</p>
      ) : null}
      {report.run.notice ? <p className="mt-4 max-w-3xl text-sm text-pine-deep">{report.run.notice}</p> : null}
      {report.run.trimNote ? <p className="mt-2 max-w-3xl text-sm text-muted">{report.run.trimNote}</p> : null}
      {error ? <p className="mt-4 text-sm text-clay">{error}</p> : null}
      {report.run.status !== "complete" ? (
        <div
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-sand"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          aria-label="Run progress"
        >
          <div className="h-full bg-pine" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      ) : null}
      <p className="mt-4 max-w-3xl text-sm leading-6">
        A pass means the agent finished that task. A fail means it did not. Unscored means that attempt could not be scored. The label is the recorded reason. It is not a fault in the API.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {report.summary.models.map((model) => {
          const decided = model.passed + model.failed;
          const rate = decided ? Math.round((model.passed / decided) * 100) : null;
          const reasons = unscoredReasons(report.results.filter((result) => result.modelId === model.modelId));
          return (
            <div key={model.modelId} className="rounded-lg border border-line bg-card p-5">
              <p className="text-sm text-muted">{model.modelLabel}</p>
              <p className="mt-2 font-serif text-5xl tracking-tight">
                {rate == null ? "—" : `${rate}%`}
                <span className="ml-3 align-middle font-sans text-base text-muted">
                  {model.passed}/{decided || model.total} passed
                  {model.unscored ? ` · ${model.unscored} unscored` : ""}
                </span>
              </p>
              {model.unscored ? (
                <p className="mt-2 text-sm text-muted">
                  {model.unscored} unscored: {reasons.join(", ")}. Left out of the percentage.
                </p>
              ) : null}
              <p className="mt-3 text-xs text-muted">
                {model.promptTokens + model.completionTokens} tokens
                {model.avgLatencyMs != null ? ` · ${model.avgLatencyMs} ms avg` : ""}
              </p>
            </div>
          );
        })}
      </section>

      <section className="mt-10 space-y-4">
        {report.run.tasks.map((task, index) => {
          const rows = report.results.filter((result) => result.taskIndex === index);
          return (
            <div key={`${index}-${task}`} className="rounded-lg border border-line bg-card">
              <div className="border-b border-line px-5 py-4">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Task {index + 1}</p>
                <h2 className="mt-1 text-lg">{task}</h2>
              </div>
              <div className="divide-y divide-line">
                {rows.map((result) => (
                  <div key={result.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Mark passed={result.passed} status={result.status} reason={unscoredReason(result)} />
                      <p className="text-sm font-medium">{result.modelLabel}</p>
                      {result.failureMode ? (
                        <span className="rounded-full bg-sand px-2 py-0.5 text-xs">
                          {FAILURE_LABELS[result.failureMode] || result.failureMode}
                        </span>
                      ) : null}
                      {result.checkSource ? <span className="text-xs text-muted">{result.checkSource}</span> : null}
                    </div>
                    {result.explanation ? <p className="mt-2 max-w-3xl text-sm leading-6">{result.explanation}</p> : null}
                    {result.error ? <p className="mt-2 text-sm text-clay">{result.error}</p> : null}
                    {result.suggestion ? (
                      <div className="mt-3 rounded-md border border-gold/70 bg-gold/15 px-4 py-3 text-sm">
                        <p className="font-medium">
                          Spec fix · {result.suggestion.method} {result.suggestion.path}
                        </p>
                        <p className="mt-1">{result.suggestion.title}</p>
                        <p className="mt-1 text-muted">{result.suggestion.detail}</p>
                      </div>
                    ) : null}
                    {result.steps.length ? (
                      <details className="mt-3">
                        <summary className="text-sm text-pine">Trace · {result.steps.length} steps</summary>
                        <ol className="mt-3 space-y-2 font-mono text-xs leading-5">
                          {result.steps.map((step) => (
                            <li key={step.index} className="rounded-md bg-paper px-3 py-2">
                              {step.kind === "reasoning" ? (
                                <span>{step.reasoning}</span>
                              ) : (
                                <span>
                                  {step.method} {step.path} → {step.status}
                                  {step.error ? ` · ${step.error}` : ""}
                                  <pre className="mt-1 whitespace-pre-wrap text-[11px] text-muted">
                                    {JSON.stringify({ args: step.args, response: step.response }, null, 2)}
                                  </pre>
                                </span>
                              )}
                            </li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                  </div>
                ))}
                {!rows.length ? <p className="px-5 py-4 text-sm text-muted">Waiting for a model to pick this up.</p> : null}
              </div>
            </div>
          );
        })}
      </section>

      {!illustrative && report.run.status === "complete" ? <FeedbackForm runId={report.run.id} /> : null}
    </article>
  );
}

function Mark({ passed, status, reason }: { passed: boolean | null; status: string; reason: string }) {
  if (status === "pending" || status === "running") {
    return <span className="rounded-full bg-sand px-2 py-0.5 text-xs uppercase tracking-wide">{status}</span>;
  }
  if (passed === true) {
    return <span className="stamp inline-block px-2 py-0.5 text-[11px] text-pine">Pass</span>;
  }
  if (passed === false) {
    return <span className="stamp inline-block px-2 py-0.5 text-[11px] text-clay">Fail</span>;
  }
  return <span className="rounded-full bg-sand px-2 py-0.5 text-xs">Unscored · {reason}</span>;
}

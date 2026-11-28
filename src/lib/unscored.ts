export type UnscoredInput = {
  passed?: boolean | null;
  status?: string | null;
  error?: string | null;
  explanation?: string | null;
  failureMode?: string | null;
};

/** Short label for an attempt that was not scored. Uses the recorded error, not a fixed list. */
export function unscoredReason(input: UnscoredInput): string {
  const text = `${input.error || ""} ${input.explanation || ""}`;
  if (/quota|rate limit|\b429\b/i.test(text)) return "quota";
  if (/timed out|timeout|time budget|time limit/i.test(text)) return "timeout";
  if (/overload|high demand|\b503\b/i.test(text)) return "provider overload";
  if (/\b413\b|too large|request too large/i.test(text)) return "request too large";
  if (/invalid tool schema|invalid schema/i.test(text)) return "invalid schema";
  const recorded = (input.error || "").trim();
  if (recorded && recorded.length <= 60 && !/model request failed/i.test(recorded)) return recorded;
  return "couldn't be scored, see details";
}

export function unscoredReasons(results: UnscoredInput[]): string[] {
  const reasons = results
    .filter((result) => result.passed == null || result.status === "error")
    .map((result) => unscoredReason(result));
  return [...new Set(reasons)];
}

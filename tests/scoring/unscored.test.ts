import { describe, expect, it } from "vitest";
import { unscoredReason, unscoredReasons } from "@/lib/unscored";

describe("unscored reasons", () => {
  it("uses the recorded cause", () => {
    expect(unscoredReason({ error: "Quota exhausted", explanation: "out of free-tier quota" })).toBe("quota");
    expect(unscoredReason({ error: "Timed out", explanation: "ran out of time" })).toBe("timeout");
    expect(unscoredReason({ error: "Model overloaded", explanation: "HTTP 503 high demand" })).toBe("provider overload");
    expect(unscoredReason({ explanation: "Groq returned HTTP 413. Request too large" })).toBe("request too large");
    expect(unscoredReason({ explanation: "Gemini returned HTTP 400. invalid tool schema on body" })).toBe("invalid schema");
    expect(unscoredReason({ error: "Model request failed", explanation: "something odd happened" })).toBe(
      "couldn't be scored, see details",
    );
  });

  it("lists each distinct reason once", () => {
    expect(
      unscoredReasons([
        { passed: null, status: "error", error: "Timed out" },
        { passed: null, status: "error", error: "Timed out" },
        { passed: false, status: "done", failureMode: "wrong_operation" },
        { passed: null, status: "error", explanation: "HTTP 413 request too large" },
      ]),
    ).toEqual(["timeout", "request too large"]);
  });
});

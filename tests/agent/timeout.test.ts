import { describe, expect, it } from "vitest";
import type { LlmProvider } from "@/lib/agent/providers";
import { runTask } from "@/lib/agent/run-task";
import { parseSpec } from "@/lib/spec/parse";

const spec = parseSpec(`
openapi: 3.0.3
info: { title: Shop, version: "1" }
paths:
  /pets:
    post:
      operationId: addPet
      summary: Add a pet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name: { type: string }
      responses:
        "201": { description: created }
`);

describe("per-step timeout", () => {
  it("stops a hung model call without waiting for the whole task budget", async () => {
    const provider: LlmProvider = {
      id: "slow",
      label: "Slow",
      model: "slow",
      kind: "stub",
      complete(_messages, _tools, signal) {
        return new Promise((_resolve, reject) => {
          const fail = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (signal?.aborted) fail();
          else signal?.addEventListener("abort", fail, { once: true });
        });
      },
    };
    const started = Date.now();
    const result = await runTask({
      spec,
      task: "Add a pet named DemoDog, then fetch that pet by its id.",
      provider,
      timeoutMs: 2_000,
      stepTimeoutMs: 50,
      maxSteps: 4,
    });
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(result.passed).toBeNull();
    expect(result.error).toBe("Timed out");
    expect(result.checkSource).toBe("unscored");
  });
});

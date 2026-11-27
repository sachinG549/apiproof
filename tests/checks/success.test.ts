import { describe, expect, it } from "vitest";
import { planTask } from "@/lib/agent/plan";
import { runTask } from "@/lib/agent/run-task";
import type { LlmProvider } from "@/lib/agent/providers";
import { createScriptedProvider } from "@/lib/agent/scripted";
import { evaluateTask } from "@/lib/checks/evaluate";
import { parseSpec } from "@/lib/spec/parse";
import type { CallLogEntry } from "@/lib/types";

const spec = parseSpec(`
openapi: 3.0.3
info: { title: Shop, version: "1" }
components:
  securitySchemes:
    api_key: { type: apiKey, name: api_key, in: header }
paths:
  /pets:
    post:
      operationId: addPet
      summary: Add a pet
      security: [{ api_key: [] }]
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                id: { type: integer }
                name: { type: string }
                status: { type: string }
      responses:
        "201":
          description: created
          content:
            application/json:
              schema:
                type: object
                properties:
                  id: { type: integer }
                  name: { type: string }
  /pets/{petId}:
    get:
      operationId: getPet
      summary: Fetch a pet by id
      security: [{ api_key: [] }]
      parameters:
        - { name: petId, in: path, required: true, schema: { type: integer } }
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema: { type: object, properties: { id: { type: integer }, name: { type: string } } }
  /pets/findByStatus:
    get:
      operationId: findPetsByStatus
      summary: Find pets by status
      security: [{ api_key: [] }]
      parameters:
        - name: status
          in: query
          required: true
          schema: { type: string, enum: [available, pending, sold] }
      responses:
        "200": { description: ok }
  /pets/{petId}/delete-alias:
    delete:
      operationId: deletePet
      summary: Delete a pet
      parameters:
        - { name: petId, in: path, required: true, schema: { type: integer } }
      responses:
        "204": { description: gone }
`);

describe("task plans and success checks", () => {
  it("maps a create-then-fetch sentence onto the two operations", () => {
    const plan = planTask("Add a pet named DemoDog with status available, then fetch that pet by its id.", spec.operations);
    expect(plan.confident).toBe(true);
    expect(plan.expected.map((operation) => operation.operationId)).toEqual(["addPet", "getPet"]);
  });

  it("passes a scripted agent that reuses the created id", async () => {
    const result = await runTask({
      spec,
      task: "Add a pet named DemoDog with status available, then fetch that pet by its id.",
      provider: createScriptedProvider({ id: "stub", label: "Stub" }),
    });
    expect(result.passed).toBe(true);
    expect(result.checkSource).toBe("deterministic");
    expect(result.steps.some((step) => step.method === "POST" && step.status === 201)).toBe(true);
    expect(result.steps.some((step) => step.method === "GET" && step.status === 200)).toBe(true);
  });

  it("classifies a missing credential as auth confusion", async () => {
    const result = await runTask({
      spec,
      task: "Add a pet named DemoDog, then fetch that pet by its id.",
      provider: createScriptedProvider({ id: "stub", label: "Stub", omitAuthPattern: /pet/i }),
    });
    expect(result.passed).toBe(false);
    expect(result.failureMode).toBe("auth_confusion");
    expect(result.suggestion?.path).toBe("/pets");
  });

  it("rejects a judge pass that does not cite the log", async () => {
    const log: CallLogEntry[] = [
      {
        method: "GET",
        pathTemplate: "/pets/findByStatus",
        path: "/pets/findByStatus",
        operationId: "findPetsByStatus",
        args: {},
        status: 200,
        response: [],
        auth: "ok",
      },
    ];
    const provider: LlmProvider = {
      id: "judge",
      label: "Judge",
      model: "judge",
      kind: "stub",
      async complete() {
        return {
          content: JSON.stringify({ pass: true, explanation: "Looks fine.", evidence: ["not in the log"] }),
          toolCalls: [],
          promptTokens: 3,
          completionTokens: 4,
          model: "judge",
        };
      },
    };
    const evaluation = await evaluateTask({
      task: "Do something ambiguous with the pets endpoint please",
      plan: { task: "x", stages: ["x"], expected: [], confidence: 0.1, confident: false },
      log,
      finalText: "",
      unknownTools: [],
      provider,
    });
    expect(evaluation.passed).toBe(false);
    expect(evaluation.failureMode).toBe("judge_unverified");
  });

  it("accepts a judge pass that quotes a log line", async () => {
    const log: CallLogEntry[] = [
      {
        method: "GET",
        pathTemplate: "/pets/findByStatus",
        path: "/pets/findByStatus?status=available",
        operationId: "findPetsByStatus",
        args: { status: "available" },
        status: 200,
        response: [],
        auth: "ok",
      },
    ];
    const provider: LlmProvider = {
      id: "judge",
      label: "Judge",
      model: "judge",
      kind: "stub",
      async complete(messages) {
        const user = messages.find((message) => message.role === "user");
        const line = user && user.role === "user" ? user.content.split("\n").find((item) => item.includes("-> 200")) : "";
        return {
          content: JSON.stringify({
            pass: true,
            explanation: "The log shows the search succeeded.",
            evidence: [line],
          }),
          toolCalls: [],
          promptTokens: 1,
          completionTokens: 1,
          model: "judge",
        };
      },
    };
    const evaluation = await evaluateTask({
      task: "Please handle the pets somehow",
      plan: { task: "x", stages: ["x"], expected: [], confidence: 0.1, confident: false },
      log,
      finalText: "",
      unknownTools: [],
      provider,
    });
    expect(evaluation.passed).toBe(true);
    expect(evaluation.checkSource).toBe("judge");
  });
});

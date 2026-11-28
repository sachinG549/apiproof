import { describe, expect, it } from "vitest";
import { geminiToolSchema } from "@/lib/agent/gemini";
import { operationsToTools, selectToolsForTask } from "@/lib/agent/tools";
import { parseSpec } from "@/lib/spec/parse";
import type { JsonSchema } from "@/lib/types";

describe("tool schemas", () => {
  it("makes a Gemini schema safe when the body is a loose object", () => {
    const dirty = {
      type: "object",
      properties: {
        body: {
          description: "request",
          oneOf: [{ type: "object" }, { type: "string" }],
          additionalProperties: true,
        } as JsonSchema,
        tags: { type: "array" } as JsonSchema,
      },
    } as JsonSchema;
    const clean = geminiToolSchema(dirty);
    const body = clean.properties?.body;
    const tags = clean.properties?.tags;
    expect(body?.type).toBe("object");
    expect(body?.properties && Object.keys(body.properties).length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/oneOf|additionalProperties|\$ref/);
    expect(tags?.type).toBe("array");
    expect(tags?.items?.type).toBe("string");
  });

  it("shrinks a large tool list under the request budget", () => {
    const wide: JsonSchema = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [`field${index}`, { type: "object", properties: { nested: { type: "string", description: "x".repeat(400) } } }]),
      ),
    };
    const spec = parseSpec({
      openapi: "3.0.3",
      info: { title: "Wide", version: "1" },
      paths: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `/things/${index}`,
          {
            post: {
              operationId: `createThing${index}`,
              summary: index === 0 ? "Create a customer invoice" : `Create thing ${index}`,
              requestBody: { required: true, content: { "application/json": { schema: wide } } },
              responses: { "201": { description: "created" } },
            },
          },
        ]),
      ),
    });
    const selected = selectToolsForTask(operationsToTools(spec), "Create a customer invoice", 12_000);
    const size = JSON.stringify(selected.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))).length;
    expect(selected.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThan(operationsToTools(spec).length);
    expect(size).toBeLessThanOrEqual(12_000);
    expect(selected[0]?.name).toBe("createThing0");
  });
});

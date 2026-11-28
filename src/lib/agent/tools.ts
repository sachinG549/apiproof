import { rankOperations } from "@/lib/agent/plan";
import type { JsonSchema, Operation, ParsedSpec } from "@/lib/types";
import { boundSchema } from "@/lib/spec/schema";

export type ToolSpec = {
  name: string;
  description: string;
  parameters: JsonSchema;
  operation: Operation;
};

export function operationsToTools(spec: ParsedSpec): ToolSpec[] {
  return spec.operations.map((operation) => {
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const parameter of operation.parameters) {
      if (parameter.in === "cookie") continue;
      properties[parameter.name] = boundSchema(parameter.schema || { type: "string" });
      if (parameter.description) properties[parameter.name].description = parameter.description.slice(0, 180);
      if (parameter.required && parameter.in !== "header") required.push(parameter.name);
    }
    if (operation.requestBody?.schema) {
      properties.body = boundSchema(operation.requestBody.schema);
      properties.body.description = operation.requestBody.description || "JSON request body.";
      if (operation.requestBody.required) required.push("body");
    }
    if (operation.security.length) {
      const names = operation.security
        .flat()
        .map((scheme) => scheme.paramName || scheme.key)
        .join(" or ");
      properties.authToken = {
        type: "string",
        description: `Required credential for ${names}. Any non-empty value is accepted. Use apiproof-demo.`,
      };
      required.push("authToken");
    }
    const requiredBody = (operation.requestBody?.schema?.required || []).slice(0, 8);
    const lines = [
      `${operation.method.toUpperCase()} ${operation.path}`,
      operation.summary,
      operation.description,
      requiredBody.length ? `Required body fields: ${requiredBody.join(", ")}.` : "",
      operation.security.length ? "Auth: send authToken." : "Auth: none.",
    ].filter(Boolean);
    return {
      name: operation.operationId,
      description: lines.join("\n").slice(0, 700),
      parameters: {
        type: "object",
        properties,
        required,
      },
      operation,
    };
  });
}

export function toolIndex(tools: ToolSpec[]): string {
  return tools
    .map((tool) => `- ${tool.operation.method.toUpperCase()} ${tool.operation.path} — ${tool.operation.summary} (tool ${tool.name})`)
    .join("\n");
}

/** Keep the tools a model sees small enough for Groq's request limit. */
export function selectToolsForTask(tools: ToolSpec[], task: string, maxBytes = 48_000): ToolSpec[] {
  const ranked = rankOperations(task, tools.map((tool) => tool.operation));
  const ordered = ranked
    .map((item) => tools.find((tool) => tool.name === item.operation.operationId))
    .filter((tool): tool is ToolSpec => Boolean(tool));
  const pool = ordered.length ? ordered : tools;
  let chosen: ToolSpec[] = [];
  for (const tool of pool) {
    const next = [...chosen, shrinkTool(tool, 3, 12)];
    if (chosen.length >= 8 || payloadSize(next) > maxBytes) break;
    chosen = next;
  }
  if (!chosen.length && pool[0]) chosen = [shrinkTool(pool[0], 2, 6)];
  if (payloadSize(chosen) > maxBytes) chosen = chosen.slice(0, 4).map((tool) => shrinkTool(tool, 2, 6));
  if (payloadSize(chosen) > maxBytes) chosen = chosen.slice(0, 2).map((tool) => shrinkTool(tool, 1, 4));
  return chosen;
}

export function shrinkTool(tool: ToolSpec, depth: number, maxProps: number): ToolSpec {
  return {
    ...tool,
    description: tool.description.slice(0, depth <= 1 ? 180 : 400),
    parameters: shrinkSchema(tool.parameters, depth, maxProps) || { type: "object", properties: {} },
  };
}

function shrinkSchema(schema: JsonSchema | undefined, depth: number, maxProps: number): JsonSchema | undefined {
  if (!schema) return undefined;
  if (depth <= 0) return { type: schema.type === "array" ? "array" : "string", description: "Shortened." };
  const next: JsonSchema = {};
  if (schema.type) next.type = schema.type;
  if (schema.description) next.description = schema.description.slice(0, 120);
  if (schema.enum) next.enum = schema.enum.slice(0, 6);
  if (schema.items) next.items = shrinkSchema(schema.items, depth - 1, maxProps);
  if (schema.properties) {
    next.properties = {};
    const required = new Set(schema.required || []);
    const entries = Object.entries(schema.properties).sort(([a], [b]) => Number(required.has(b)) - Number(required.has(a)));
    for (const [key, value] of entries.slice(0, maxProps)) next.properties[key] = shrinkSchema(value, depth - 1, maxProps) || { type: "string" };
  }
  if (schema.required) next.required = schema.required.filter((name) => next.properties?.[name]).slice(0, maxProps);
  return next;
}

function payloadSize(tools: ToolSpec[]): number {
  return JSON.stringify(tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters }))).length;
}

import type { JsonSchema, Operation, ParsedSpec } from "@/lib/types";
import { boundSchema, primaryType } from "@/lib/spec/schema";

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
    .map((tool) => {
      const type = primaryType(tool.parameters);
      void type;
      return `- ${tool.operation.method.toUpperCase()} ${tool.operation.path} — ${tool.operation.summary} (tool ${tool.name})`;
    })
    .join("\n");
}

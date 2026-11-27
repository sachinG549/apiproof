import type { ParsedSpec } from "@/lib/types";
import { isRecord } from "@/lib/util";
import { boundSchema } from "@/lib/spec/schema";
import { parseSpec } from "@/lib/spec/parse";

export function freezeSpec(spec: ParsedSpec): ParsedSpec {
  const document = compactDocument(spec);
  const reparsed = parseSpec(document);
  return {
    ...reparsed,
    warnings: spec.warnings,
    convertedFrom: spec.convertedFrom,
    trimmedFrom: spec.trimmedFrom,
    trimNote: spec.trimNote,
  };
}

export function compactDocument(spec: ParsedSpec): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const operation of spec.operations) {
    const pathItem = paths[operation.path] || {};
    const responses: Record<string, unknown> = {};
    for (const [code, response] of Object.entries(operation.responses)) {
      const example = smallExample(response.example);
      responses[code] = {
        description: response.description || "Response",
        content:
          response.schema || example !== undefined
            ? {
                "application/json": {
                  schema: response.schema ? boundSchema(response.schema) : undefined,
                  example,
                },
              }
            : undefined,
      };
    }
    pathItem[operation.method] = {
      operationId: operation.operationId,
      summary: operation.summary,
      description: operation.description,
      tags: operation.tags,
      parameters: operation.parameters.map((parameter) => ({
        name: parameter.name,
        in: parameter.in,
        required: parameter.required,
        description: parameter.description,
        schema: boundSchema(parameter.schema || { type: "string" }),
      })),
      requestBody: operation.requestBody
        ? {
            required: operation.requestBody.required,
            description: operation.requestBody.description,
            content: {
              "application/json": { schema: boundSchema(operation.requestBody.schema) },
            },
          }
        : undefined,
      responses,
      security: operation.security.map((group) => Object.fromEntries(group.map((scheme) => [scheme.key, []]))),
    };
    paths[operation.path] = pathItem;
  }

  return {
    openapi: spec.openapi.startsWith("3.") ? spec.openapi : "3.0.3",
    info: {
      title: spec.title,
      version: spec.version,
      description: spec.description,
    },
    paths,
    components: {
      securitySchemes: securitySchemes(spec),
    },
  };
}

function securitySchemes(spec: ParsedSpec): Record<string, unknown> {
  const source = isRecord(spec.document.components) && isRecord(spec.document.components.securitySchemes)
    ? spec.document.components.securitySchemes
    : {};
  const used = new Set(spec.operations.flatMap((operation) => operation.security.flat().map((scheme) => scheme.key)));
  const kept: Record<string, unknown> = {};
  for (const key of used) {
    if (isRecord(source[key])) {
      kept[key] = source[key];
      continue;
    }
    const scheme = spec.operations.flatMap((operation) => operation.security.flat()).find((item) => item.key === key);
    if (!scheme) continue;
    if (scheme.type === "apiKey") {
      kept[key] = { type: "apiKey", name: scheme.paramName || key, in: scheme.in || "header" };
    } else if (scheme.type === "oauth2") {
      kept[key] = {
        type: "oauth2",
        flows: { implicit: { authorizationUrl: "https://example.invalid/oauth", scopes: {} } },
      };
    } else if (scheme.type === "http") {
      kept[key] = { type: "http", scheme: "bearer" };
    } else {
      kept[key] = { type: "http", scheme: "bearer" };
    }
  }
  return kept;
}

function smallExample(value: unknown): unknown {
  if (value === undefined) return undefined;
  const text = JSON.stringify(value);
  if (!text || text.length > 500) return undefined;
  return value;
}

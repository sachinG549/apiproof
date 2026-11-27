import { parse as parseYaml } from "yaml";
import { UserError } from "@/lib/errors";
import type {
  HttpMethod,
  JsonSchema,
  Operation,
  Parameter,
  ParsedSpec,
  RequestBody,
  ResponseDef,
  SecurityScheme,
} from "@/lib/types";
import { isRecord } from "@/lib/util";
import { resolveSchema } from "@/lib/spec/schema";
import { isSwagger2, swagger2ToOpenapi } from "@/lib/spec/swagger2";

const METHODS: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

export function parseSpecText(text: string): unknown {
  const source = text.replace(/^\uFEFF/, "").trim();
  if (!source) throw new UserError("The spec is empty. Paste OpenAPI JSON or YAML.");
  if (source.startsWith("{") || source.startsWith("[")) {
    try {
      return JSON.parse(source) as unknown;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid JSON";
      throw new UserError(`That JSON did not parse. ${message}`);
    }
  }
  try {
    return parseYaml(source, { maxAliasCount: 1000 }) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid YAML";
    throw new UserError(`That YAML did not parse. ${message}`);
  }
}

export function parseSpec(input: string | unknown): ParsedSpec {
  const raw = typeof input === "string" ? parseSpecText(input) : input;
  if (!isRecord(raw)) throw new UserError("The spec must be a JSON or YAML object with paths.");

  const warnings: string[] = [];
  let document = raw;
  let convertedFrom: ParsedSpec["convertedFrom"];
  if (isSwagger2(document)) {
    document = swagger2ToOpenapi(document);
    convertedFrom = "swagger2";
    warnings.push("Converted from Swagger 2.0. Vendor extensions and a few less common parameter styles were dropped.");
  }

  const openapi = typeof document.openapi === "string" ? document.openapi : "";
  if (!openapi.startsWith("3.")) {
    throw new UserError(
      "APIProof needs OpenAPI 3.x. Swagger 2.0 is converted automatically when the document has swagger: \"2.0\".",
    );
  }

  const info = isRecord(document.info) ? document.info : {};
  const title = typeof info.title === "string" && info.title.trim() ? info.title.trim() : "Untitled API";
  const version = typeof info.version === "string" ? info.version : "0";
  const description = typeof info.description === "string" ? info.description.slice(0, 600) : "";
  if (!isRecord(document.paths) || Object.keys(document.paths).length === 0) {
    throw new UserError("No paths were found. Add at least one path with an HTTP operation.");
  }

  const operations = extractOperations(document);
  if (!operations.length) {
    throw new UserError("Paths exist, but none of them define a get, post, put, patch, or delete operation.");
  }

  return {
    title,
    version,
    openapi,
    description,
    document,
    operations,
    warnings,
    convertedFrom,
  };
}

function extractOperations(document: Record<string, unknown>): Operation[] {
  const paths = isRecord(document.paths) ? document.paths : {};
  const globalSecurity = normalizeSecurity(document.security, document);
  const operations: Operation[] = [];

  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const source = item[method];
      if (!isRecord(source)) continue;
      const parameters = dedupeParams([
        ...readParameters(shared, document),
        ...readParameters(Array.isArray(source.parameters) ? source.parameters : [], document),
      ]);
      const security = source.security === undefined ? globalSecurity : normalizeSecurity(source.security, document);
      operations.push({
        operationId: sanitizeOperationId(typeof source.operationId === "string" ? source.operationId : `${method}_${path}`),
        method,
        path,
        pathKey: "",
        summary: text(source.summary) || text(source.operationId) || `${method.toUpperCase()} ${path}`,
        description: text(source.description).slice(0, 700),
        tags: Array.isArray(source.tags) ? source.tags.filter((tag): tag is string => typeof tag === "string") : [],
        parameters,
        requestBody: readBody(source.requestBody, document),
        responses: readResponses(source.responses, document),
        security,
        collection: "",
      });
    }
  }

  const seen = new Map<string, number>();
  for (const operation of operations) {
    const count = seen.get(operation.operationId) || 0;
    seen.set(operation.operationId, count + 1);
    if (count > 0) operation.operationId = `${operation.operationId}_${count + 1}`;
  }
  bindResources(operations);
  return operations;
}

export function bindResources(operations: Operation[]): void {
  for (const operation of operations) operation.pathKey = normalizePath(operation.path);
  const collections = new Set<string>();
  for (const operation of operations) {
    const param = lastParam(operation.pathKey);
    if (param) collections.add(operation.pathKey.replace(/\/\{[^/]+\}$/, ""));
  }
  for (const operation of operations) {
    let best = "";
    for (const collection of collections) {
      if (operation.pathKey === collection || operation.pathKey.startsWith(`${collection}/`)) {
        if (collection.length > best.length) best = collection;
      }
    }
    operation.collection = best || operation.pathKey;
    const param = lastParam(operation.pathKey);
    operation.itemParam = param && operation.pathKey === `${operation.collection}/{${param}}` ? param : undefined;
  }
}

export function normalizePath(path: string): string {
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\.json(?=\/|$)/g, "");
}

function lastParam(pathKey: string): string | null {
  const segment = pathKey.split("/").filter(Boolean).pop() || "";
  return paramName(segment);
}

export function paramName(segment: string): string | null {
  const match = segment.match(/^\{([^}]+)\}(?:\..+)?$/);
  return match ? match[1] : null;
}

function sanitizeOperationId(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+/, "");
  const named = /^[A-Za-z]/.test(cleaned) ? cleaned : `op_${cleaned || "call"}`;
  return named.slice(0, 64);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readParameters(parameters: unknown[], root: unknown): Parameter[] {
  const result: Parameter[] = [];
  for (const parameter of parameters) {
    const resolved = isRecord(parameter) && typeof parameter.$ref === "string" ? pointerRecord(root, parameter.$ref) : parameter;
    if (!isRecord(resolved) || typeof resolved.name !== "string") continue;
    const location = resolved.in;
    if (location !== "path" && location !== "query" && location !== "header" && location !== "cookie") continue;
    result.push({
      name: resolved.name,
      in: location,
      required: Boolean(resolved.required) || location === "path",
      description: text(resolved.description).slice(0, 300),
      schema: resolveSchema(resolved.schema || { type: "string" }, root),
    });
  }
  return result;
}

function dedupeParams(parameters: Parameter[]): Parameter[] {
  const map = new Map<string, Parameter>();
  for (const parameter of parameters) map.set(`${parameter.in}:${parameter.name}`, parameter);
  return [...map.values()];
}

function readBody(body: unknown, root: unknown): RequestBody | undefined {
  const resolved = isRecord(body) && typeof body.$ref === "string" ? pointerRecord(root, body.$ref) : body;
  if (!isRecord(resolved) || !isRecord(resolved.content)) return undefined;
  const entry =
    (isRecord(resolved.content["application/json"]) && resolved.content["application/json"]) ||
    Object.values(resolved.content).find(isRecord);
  if (!entry) return undefined;
  const contentType = Object.entries(resolved.content).find(([, value]) => value === entry)?.[0] || "application/json";
  return {
    required: resolved.required !== false,
    description: text(resolved.description).slice(0, 300),
    contentType,
    schema: resolveSchema(entry.schema, root),
  };
}

function readResponses(responses: unknown, root: unknown): Record<string, ResponseDef> {
  if (!isRecord(responses)) return {};
  const result: Record<string, ResponseDef> = {};
  for (const [code, response] of Object.entries(responses)) {
    const resolved = isRecord(response) && typeof response.$ref === "string" ? pointerRecord(root, response.$ref) : response;
    if (!isRecord(resolved)) continue;
    let schema: JsonSchema | undefined;
    let example: unknown;
    if (isRecord(resolved.content)) {
      const json = isRecord(resolved.content["application/json"])
        ? resolved.content["application/json"]
        : Object.values(resolved.content).find(isRecord);
      if (json) {
        schema = resolveSchema(json.schema, root);
        example = json.example ?? firstExample(json.examples);
        if (example !== undefined && schema && schema.example === undefined) schema = { ...schema, example };
      }
    }
    result[code] = { description: text(resolved.description).slice(0, 300), schema, example };
  }
  return result;
}

function firstExample(examples: unknown): unknown {
  if (!isRecord(examples)) return undefined;
  for (const example of Object.values(examples)) {
    if (isRecord(example) && "value" in example) return example.value;
  }
  return undefined;
}

function normalizeSecurity(security: unknown, document: Record<string, unknown>): SecurityScheme[][] {
  if (!Array.isArray(security)) return [];
  const schemes = isRecord(document.components) && isRecord(document.components.securitySchemes)
    ? document.components.securitySchemes
    : {};
  return security.map((group) => {
    if (!isRecord(group)) return [];
    return Object.keys(group).map((key) => {
      const scheme = isRecord(schemes[key]) ? schemes[key] : {};
      return {
        key,
        type: typeof scheme.type === "string" ? scheme.type : "apiKey",
        in: typeof scheme.in === "string" ? scheme.in : undefined,
        paramName: typeof scheme.name === "string" ? scheme.name : undefined,
      };
    });
  });
}

function pointerRecord(root: unknown, ref: string): Record<string, unknown> | undefined {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return isRecord(current) ? current : undefined;
}

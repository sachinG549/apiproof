import type { CallLogEntry, JsonSchema, Operation, ParsedSpec } from "@/lib/types";
import { coerceValue, primaryType, schemaErrors, synthesize } from "@/lib/spec/schema";
import { paramName } from "@/lib/spec/parse";
import { isRecord } from "@/lib/util";

const ID_FIELDS = ["id", "ID", "Id", "sid", "SID", "uuid", "number", "petId", "orderId"];

export class MockApi {
  readonly log: CallLogEntry[] = [];
  private seq = 1000;
  private readonly buckets = new Map<string, Map<string, Record<string, unknown>>>();
  private readonly idIndex = new Map<string, Record<string, unknown>>();

  constructor(private readonly spec: ParsedSpec) {}

  call(operation: Operation, rawArgs: unknown): CallLogEntry {
    const args = isRecord(rawArgs) ? { ...rawArgs } : {};
    const normalized = this.normalizeArgs(operation, args);
    const auth = this.authState(operation, normalized);
    const concrete = this.concretePath(operation, normalized);
    const finish = (status: number, response: unknown, extra: Partial<CallLogEntry> = {}): CallLogEntry => {
      const entry: CallLogEntry = {
        method: operation.method.toUpperCase(),
        pathTemplate: operation.path,
        path: concrete,
        operationId: operation.operationId,
        args: normalized,
        status,
        response,
        auth,
        ...extra,
      };
      this.log.push(entry);
      return entry;
    };

    const missing = this.missingParameter(operation, normalized);
    if (missing) {
      return finish(400, {
        error: "missing_parameter",
        message: `Parameter "${missing.name}" is required for ${operation.method.toUpperCase()} ${operation.path}.`,
        parameter: missing.name,
      }, { errorCode: "missing_parameter", missingParameter: missing.name });
    }

    if (auth === "missing") {
      const names = operation.security.flat().map((scheme) => scheme.paramName || scheme.key).join(" or ");
      return finish(401, {
        error: "auth_required",
        message: `This operation requires a credential (${names}). Send authToken. The mock checks that it is present, not that it is real.`,
      }, { errorCode: "auth_required" });
    }

    if (operation.requestBody?.required && operation.requestBody.schema) {
      const body = isRecord(normalized.body) ? normalized.body : normalized.body;
      const errors = schemaErrors(body, operation.requestBody.schema, "body");
      if (errors.length) {
        return finish(400, {
          error: "schema_mismatch",
          message: `The request body does not match the schema. ${errors.join("; ")}`,
          errors,
        }, { errorCode: "schema_mismatch" });
      }
    }

    const key = this.collectionKey(operation, normalized);
    if (this.isCreate(operation)) {
      const resource = this.buildResource(operation, normalized);
      const id = String(resource.id ?? resource[operation.itemParam || "id"] ?? this.seq);
      this.bucket(key).set(id, resource);
      this.indexResource(resource, key);
      const status = this.successStatus(operation);
      return finish(status, status === 204 ? null : this.shapeResponse(operation, resource));
    }

    if (this.isItem(operation) && operation.itemParam) {
      const id = String(normalized[operation.itemParam] ?? "");
      const existing = this.lookup(key, id);
      if (operation.method === "get") {
        if (!existing) return finish(404, { error: "not_found", message: `No stored resource with ${operation.itemParam}=${id}.` }, { errorCode: "not_found" });
        return finish(this.successStatus(operation), this.shapeResponse(operation, existing));
      }
      if (operation.method === "delete") {
        if (!existing) return finish(404, { error: "not_found", message: `No stored resource with ${operation.itemParam}=${id}.` }, { errorCode: "not_found" });
        this.bucket(key).delete(id);
        const status = this.successStatus(operation);
        return finish(status, status === 204 ? null : this.shapeResponse(operation, { ...existing, deleted: true }));
      }
      const resource = this.buildResource(operation, normalized, existing || undefined, id);
      this.bucket(key).set(id, resource);
      this.indexResource(resource, key);
      return finish(this.successStatus(operation), this.shapeResponse(operation, resource));
    }

    if (operation.method === "get" || operation.method === "delete") {
      const items = this.listItems(operation, normalized, key);
      if (operation.method === "delete") {
        return finish(this.successStatus(operation), { deleted: items.length });
      }
      if (items.length === 0 && operation.pathKey !== operation.collection) {
        const synthetic = this.syntheticResponse(operation);
        this.harvest(synthetic, "*");
        return finish(this.successStatus(operation), synthetic);
      }
      return finish(this.successStatus(operation), this.shapeList(operation, items));
    }

    if (operation.method === "put" || operation.method === "patch") {
      const resource = this.buildResource(operation, normalized);
      const id = String(resource.id ?? this.seq);
      this.bucket(key).set(id, resource);
      this.indexResource(resource, key);
      return finish(this.successStatus(operation), this.shapeResponse(operation, resource));
    }

    const parentMissing = this.missingParent(operation, normalized, key);
    if (parentMissing) {
      return finish(404, {
        error: "not_found",
        message: `No stored parent resource for ${parentMissing}. Create it before calling this operation.`,
      }, { errorCode: "not_found" });
    }
    const action = this.buildResource(operation, normalized);
    this.indexResource(action, key);
    return finish(this.successStatus(operation), this.shapeResponse(operation, action));
  }

  private isCreate(operation: Operation): boolean {
    return operation.method === "post" && operation.pathKey === operation.collection;
  }

  private isItem(operation: Operation): boolean {
    return Boolean(operation.itemParam) && operation.pathKey === `${operation.collection}/{${operation.itemParam}}`;
  }

  private normalizeArgs(operation: Operation, args: Record<string, unknown>): Record<string, unknown> {
    const next = { ...args };
    for (const parameter of operation.parameters) {
      if (next[parameter.name] !== undefined) next[parameter.name] = coerceValue(next[parameter.name], parameter.schema);
    }
    if (isRecord(next.body) && operation.requestBody?.schema?.properties) {
      const body = { ...next.body };
      for (const [key, schema] of Object.entries(operation.requestBody.schema.properties)) {
        if (body[key] !== undefined) body[key] = coerceValue(body[key], schema);
      }
      next.body = body;
    }
    return next;
  }

  private missingParameter(operation: Operation, args: Record<string, unknown>): { name: string } | null {
    for (const parameter of operation.parameters) {
      if (!parameter.required || parameter.in === "header" || parameter.in === "cookie") continue;
      const value = args[parameter.name];
      if (value == null || value === "") return { name: parameter.name };
    }
    return null;
  }

  private authState(operation: Operation, args: Record<string, unknown>): CallLogEntry["auth"] {
    if (!operation.security.length) return "not_required";
    const token = typeof args.authToken === "string" ? args.authToken.trim() : "";
    const satisfied = operation.security.some((group) =>
      group.every((scheme) => {
        if (scheme.type === "apiKey" && scheme.paramName) {
          const direct = args[scheme.paramName];
          return (typeof direct === "string" && direct.trim().length > 0) || token.length > 0;
        }
        return token.length > 0 || nonEmpty(args.authorization) || nonEmpty(args.Authorization);
      }),
    );
    return satisfied ? "ok" : "missing";
  }

  private buildResource(
    operation: Operation,
    args: Record<string, unknown>,
    existing?: Record<string, unknown>,
    forcedId?: string,
  ): Record<string, unknown> {
    const schema = operation.requestBody?.schema;
    const base = isRecord(synthesize(schema)) ? (synthesize(schema) as Record<string, unknown>) : {};
    const body = isRecord(args.body) ? args.body : {};
    const resource: Record<string, unknown> = { ...base, ...(existing || {}), ...body };
    for (const parameter of operation.parameters) {
      if (parameter.in === "path" && args[parameter.name] != null && resource[parameter.name] == null) {
        resource[parameter.name] = args[parameter.name];
      }
    }
    const idField = this.idField(schema);
    if (forcedId != null) resource[idField] = this.castId(forcedId, schema?.properties?.[idField]);
    if (resource[idField] == null || resource[idField] === "") {
      resource[idField] = this.nextId(schema?.properties?.[idField]);
    }
    if (resource.id == null) resource.id = resource[idField];
    return resource;
  }

  private idField(schema?: JsonSchema): string {
    const props = schema?.properties || {};
    if (props.id) return "id";
    const match = Object.keys(props).find((key) => /id|sid|number|uuid/i.test(key));
    return match || "id";
  }

  private nextId(schema?: JsonSchema): string | number {
    this.seq += 1;
    if (primaryType(schema) === "integer") return this.seq;
    return String(this.seq);
  }

  private castId(value: string, schema?: JsonSchema): string | number {
    if (primaryType(schema) === "integer" && /^-?\d+$/.test(value)) return Number(value);
    return value;
  }

  private collectionKey(operation: Operation, args: Record<string, unknown>): string {
    return fillTemplate(operation.collection, args);
  }

  private concretePath(operation: Operation, args: Record<string, unknown>): string {
    const parts = operation.path.split("/");
    return parts
      .map((segment) => {
        const name = paramName(segment);
        if (!name) return segment;
        return args[name] == null ? segment : String(args[name]);
      })
      .join("/");
  }

  private listItems(operation: Operation, args: Record<string, unknown>, key: string): Record<string, unknown>[] {
    const items = [...this.bucket(key).values()];
    const query: Record<string, unknown> = {};
    for (const parameter of operation.parameters) {
      if (parameter.in === "query" && args[parameter.name] != null) query[parameter.name] = args[parameter.name];
    }
    return items.filter((item) => matchesQuery(item, query));
  }

  private missingParent(operation: Operation, args: Record<string, unknown>, key: string): string | null {
    for (const parameter of operation.parameters) {
      if (parameter.in !== "path" || !/id|sid|number|uuid/i.test(parameter.name)) continue;
      const value = args[parameter.name];
      if (value == null) continue;
      const id = String(value);
      if (this.lookup(key, id)) continue;
      const bucket = this.bucket(key);
      if ([...bucket.keys()].includes(id)) continue;
      if (operation.pathKey === operation.collection) continue;
      return `${parameter.name}=${id}`;
    }
    return null;
  }

  private successStatus(operation: Operation): number {
    const codes = Object.keys(operation.responses);
    const preferred =
      operation.method === "post" ? ["201", "200"] : operation.method === "delete" ? ["204", "200", "202"] : ["200", "201"];
    for (const code of preferred) if (codes.includes(code)) return Number(code);
    const success = codes.find((code) => code.startsWith("2"));
    return success ? Number(success) : 200;
  }

  private responseSchema(operation: Operation): JsonSchema | undefined {
    const code = String(this.successStatus(operation));
    return operation.responses[code]?.schema || operation.responses.default?.schema;
  }

  private shapeResponse(operation: Operation, resource: Record<string, unknown>): unknown {
    const schema = this.responseSchema(operation);
    if (!schema) return resource;
    if (primaryType(schema) === "array") return [shapeObject(schema.items, resource)];
    return shapeObject(schema, resource);
  }

  private shapeList(operation: Operation, items: Record<string, unknown>[]): unknown {
    const schema = this.responseSchema(operation);
    const shaped = items.map((item) => (schema && primaryType(schema) === "array" ? shapeObject(schema.items, item) : item));
    if (!schema) return shaped;
    if (primaryType(schema) === "array") return shaped;
    if (schema.properties) {
      const arrayKey = Object.entries(schema.properties).find(([, child]) => primaryType(child) === "array")?.[0];
      const base = isRecord(synthesize(schema)) ? (synthesize(schema) as Record<string, unknown>) : {};
      if (arrayKey) return { ...base, [arrayKey]: shaped };
    }
    return shaped;
  }

  private syntheticResponse(operation: Operation): unknown {
    const schema = this.responseSchema(operation);
    const example = operation.responses[String(this.successStatus(operation))]?.example;
    const value = example !== undefined ? example : synthesize(schema);
    return value;
  }

  private bucket(key: string): Map<string, Record<string, unknown>> {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Map();
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private lookup(key: string, id: string): Record<string, unknown> | undefined {
    return this.bucket(key).get(id) || this.idIndex.get(`${key}::${id}`) || this.idIndex.get(`*::${id}`);
  }

  private indexResource(resource: Record<string, unknown>, key: string): void {
    for (const field of ID_FIELDS) {
      const value = resource[field];
      if (typeof value === "string" || typeof value === "number") this.idIndex.set(`${key}::${String(value)}`, resource);
    }
  }

  private harvest(value: unknown, key: string): void {
    if (Array.isArray(value)) {
      for (const item of value) this.harvest(item, key);
      return;
    }
    if (!isRecord(value)) return;
    const indexed = ID_FIELDS.some((field) => typeof value[field] === "string" || typeof value[field] === "number");
    if (indexed) this.indexResource(value, key);
    for (const child of Object.values(value)) this.harvest(child, key);
  }
}

function fillTemplate(template: string, args: Record<string, unknown>): string {
  return template
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const name = paramName(segment);
      if (!name) return segment;
      return args[name] == null ? "_" : String(args[name]);
    })
    .join("/");
}

function matchesQuery(item: Record<string, unknown>, query: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(query)) {
    if (expected == null || expected === "" || !(key in item)) continue;
    if (!sameValue(item[key], expected)) return false;
  }
  return true;
}

function sameValue(actual: unknown, expected: unknown): boolean {
  const expectedValues = Array.isArray(expected) ? expected.map(String) : String(expected).split(",").map((item) => item.trim());
  const actualValues = Array.isArray(actual) ? actual.map(String) : [String(actual)];
  return expectedValues.some((value) => actualValues.some((candidate) => candidate.toLowerCase() === value.toLowerCase()));
}

function shapeObject(schema: JsonSchema | undefined, resource: Record<string, unknown>): unknown {
  if (!schema || primaryType(schema) === "array") return resource;
  const base = isRecord(synthesize(schema)) ? (synthesize(schema) as Record<string, unknown>) : {};
  const props = schema.properties || {};
  const overlap = Object.keys(resource).some((key) => key in props);
  if (overlap || Object.keys(props).length === 0) return { ...base, ...resource };
  for (const [key, child] of Object.entries(props)) {
    if (primaryType(child) === "object" || child.properties) {
      const current = isRecord(base[key]) ? base[key] : {};
      return { ...base, [key]: { ...current, ...resource } };
    }
  }
  return { ...base, ...resource };
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function operationById(spec: ParsedSpec, operationId: string): Operation | undefined {
  return spec.operations.find((operation) => operation.operationId === operationId);
}

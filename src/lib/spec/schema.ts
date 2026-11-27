import type { JsonSchema } from "@/lib/types";
import { isRecord } from "@/lib/util";

export function primaryType(schema?: JsonSchema): string | undefined {
  if (!schema?.type) return schema?.properties ? "object" : schema?.items ? "array" : undefined;
  if (Array.isArray(schema.type)) return schema.type.find((item) => item !== "null") || schema.type[0];
  return schema.type;
}

export function pointer(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = root;
  for (const part of parts) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function resolveSchema(schema: unknown, root: unknown, depth = 0, stack: string[] = []): JsonSchema | undefined {
  if (!isRecord(schema) || depth > 8) return undefined;
  if (typeof schema.$ref === "string") {
    if (stack.includes(schema.$ref)) return { type: "object", description: "Circular reference." };
    const target = pointer(root, schema.$ref);
    if (!isRecord(target)) return { type: "object", description: `Unresolved ${schema.$ref}` };
    return resolveSchema(target, root, depth + 1, [...stack, schema.$ref]);
  }

  const resolved: JsonSchema = {};
  if (schema.type !== undefined) resolved.type = schema.type as JsonSchema["type"];
  if (typeof schema.format === "string") resolved.format = schema.format;
  if (typeof schema.description === "string") resolved.description = schema.description.slice(0, 400);
  if (Array.isArray(schema.enum)) resolved.enum = schema.enum.slice(0, 12);
  if ("example" in schema) resolved.example = schema.example;
  if ("default" in schema) resolved.default = schema.default;
  if (typeof schema.nullable === "boolean") resolved.nullable = schema.nullable;
  if (Array.isArray(schema.required)) {
    resolved.required = schema.required.filter((item): item is string => typeof item === "string");
  }
  if (isRecord(schema.properties)) {
    resolved.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) {
      const child = resolveSchema(value, root, depth + 1, stack);
      if (child) resolved.properties[key] = child;
    }
  }
  if (schema.items) {
    const items = resolveSchema(schema.items, root, depth + 1, stack);
    if (items) resolved.items = items;
  }
  if (Array.isArray(schema.allOf)) {
    const parts = schema.allOf
      .map((part) => resolveSchema(part, root, depth + 1, stack))
      .filter((part): part is JsonSchema => Boolean(part));
    return mergeAllOf(resolved, parts);
  }
  const union = schema.oneOf || schema.anyOf;
  if (Array.isArray(union) && union.length) {
    const first = resolveSchema(union[0], root, depth + 1, stack);
    if (first) return { ...first, description: resolved.description || first.description };
  }
  return resolved;
}

function mergeAllOf(base: JsonSchema, parts: JsonSchema[]): JsonSchema {
  const merged: JsonSchema = {
    ...base,
    properties: { ...(base.properties || {}) },
    required: [...(base.required || [])],
  };
  for (const part of parts) {
    if (part.properties) merged.properties = { ...merged.properties, ...part.properties };
    if (part.required) merged.required = [...new Set([...(merged.required || []), ...part.required])];
    if (!merged.type && part.type) merged.type = part.type;
    if (!merged.description && part.description) merged.description = part.description;
    if (!merged.enum && part.enum) merged.enum = part.enum;
    if (merged.example === undefined && part.example !== undefined) merged.example = part.example;
  }
  if (merged.required && merged.required.length === 0) delete merged.required;
  if (merged.properties && Object.keys(merged.properties).length === 0) delete merged.properties;
  return merged;
}

export function boundSchema(schema: JsonSchema | undefined, depth = 0): JsonSchema {
  if (!schema || depth > 4) return { type: "object", description: "Nested object omitted so the tool schema stays small." };
  const next: JsonSchema = {};
  const type = primaryType(schema);
  if (type) next.type = type;
  if (schema.format) next.format = schema.format;
  if (schema.description) next.description = schema.description.slice(0, 180);
  if (schema.enum) next.enum = schema.enum.slice(0, 8);
  if (schema.example !== undefined && JSON.stringify(schema.example).length < 200) next.example = schema.example;
  if (schema.required) next.required = schema.required.slice(0, 24);
  if (schema.items) next.items = boundSchema(schema.items, depth + 1);
  if (schema.properties) {
    const required = new Set(schema.required || []);
    const rank = (key: string) => {
      if (required.has(key)) return 0;
      if (/^(id|sid|uuid|number|name|email|status|title|amount|currency)$/i.test(key) || /id$/i.test(key)) return 1;
      return 2;
    };
    const entries = Object.entries(schema.properties).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
    next.properties = {};
    for (const [key, value] of entries.slice(0, 24)) {
      next.properties[key] = boundSchema(value, depth + 1);
    }
  }
  return next;
}

export function synthesize(schema?: JsonSchema, hint?: unknown): unknown {
  if (hint !== undefined && hint !== null && matchesSchema(hint, schema)) return hint;
  if (!schema) return hint ?? {};
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  const type = primaryType(schema);
  if (type === "string") return exampleString(schema);
  if (type === "integer") return 1;
  if (type === "number") return 1;
  if (type === "boolean") return true;
  if (type === "array") return [synthesize(schema.items)];
  if (type === "object" || schema.properties) {
    const object: Record<string, unknown> = {};
    const props = schema.properties || {};
    const keys = schema.required?.length ? schema.required : Object.keys(props).slice(0, 8);
    for (const key of keys) object[key] = synthesize(props[key]);
    return object;
  }
  return {};
}

function exampleString(schema: JsonSchema): string {
  switch (schema.format) {
    case "date-time":
      return "2024-01-15T12:00:00Z";
    case "date":
      return "2024-01-15";
    case "email":
      return "ada@example.com";
    case "uri":
    case "url":
      return "https://example.com/resource";
    case "uuid":
      return "00000000-0000-4000-8000-000000000001";
    default:
      return "example";
  }
}

export function matchesSchema(value: unknown, schema?: JsonSchema): boolean {
  return schemaErrors(value, schema).length === 0;
}

export function schemaErrors(value: unknown, schema?: JsonSchema, path = "$"): string[] {
  if (!schema) return [];
  if (value == null) {
    if (schema.nullable) return [];
    return [`${path} is missing`];
  }
  const type = primaryType(schema);
  if (schema.enum && !schema.enum.map(String).includes(String(value)) && type !== "object" && type !== "array") {
    return [`${path} must be one of ${schema.enum.join(", ")}`];
  }
  if (type === "string" && typeof value !== "string") return [`${path} must be a string`];
  if (type === "integer" && !Number.isInteger(value)) return [`${path} must be an integer`];
  if (type === "number" && typeof value !== "number") return [`${path} must be a number`];
  if (type === "boolean" && typeof value !== "boolean") return [`${path} must be a boolean`];
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array`];
    return value.flatMap((item, index) => schemaErrors(item, schema.items, `${path}[${index}]`)).slice(0, 8);
  }
  if (type === "object" || schema.properties) {
    if (!isRecord(value)) return [`${path} must be an object`];
    const errors: string[] = [];
    for (const key of schema.required || []) {
      if (value[key] == null || value[key] === "") errors.push(`${path}.${key} is required`);
    }
    for (const [key, child] of Object.entries(schema.properties || {})) {
      if (value[key] !== undefined) errors.push(...schemaErrors(value[key], child, `${path}.${key}`));
    }
    return errors.slice(0, 8);
  }
  return [];
}

export function coerceValue(value: unknown, schema?: JsonSchema): unknown {
  const type = primaryType(schema);
  if (type === "integer" && typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
  if (type === "number" && typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if (type === "boolean" && typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  if (type === "array" && typeof value === "string") return [coerceValue(value, schema?.items)];
  return value;
}

import { createHash, randomBytes } from "crypto";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function truncateText(value: string, max = 4000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function truncateJson(value: unknown, max = 4000): unknown {
  const text = JSON.stringify(value);
  if (!text || text.length <= max) return value;
  return { truncated: true, preview: text.slice(0, max) };
}

const SECRET_KEY = /auth|token|api[_-]?key|authorization|secret|password/i;

export function redactArgs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => redactArgs(item));
  if (!isRecord(value)) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (SECRET_KEY.test(key) && typeof item === "string") {
      copy[key] = item.trim() ? "«present»" : "«missing»";
    } else {
      copy[key] = redactArgs(item);
    }
  }
  return copy;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function hashIp(ip: string, salt: string): string {
  return sha256(`${salt}|${ip}`);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "local";
  return request.headers.get("x-real-ip") || "local";
}

export function deepContains(value: unknown, needle: string): boolean {
  if (value == null) return false;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).toLowerCase().includes(needle.toLowerCase());
  }
  if (Array.isArray(value)) return value.some((item) => deepContains(item, needle));
  if (isRecord(value)) return Object.values(value).some((item) => deepContains(item, needle));
  return false;
}

export function collectPrimitives(value: unknown, into = new Set<string>()): Set<string> {
  if (value == null) return into;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    into.add(String(value));
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectPrimitives(item, into);
    return into;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) collectPrimitives(item, into);
  }
  return into;
}

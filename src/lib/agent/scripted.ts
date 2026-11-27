import type { ChatMessage, LlmCompletion, LlmProvider, ToolSpec } from "@/lib/agent/providers";
import { planTask } from "@/lib/agent/plan";
import type { JsonSchema } from "@/lib/types";
import { primaryType, synthesize } from "@/lib/spec/schema";
import { isRecord } from "@/lib/util";

export function createScriptedProvider(options: {
  id?: string;
  label?: string;
  failPattern?: RegExp;
  omitAuthPattern?: RegExp;
}): LlmProvider {
  return {
    id: options.id || "stub",
    label: options.label || "Stub agent · no model key",
    model: "scripted",
    kind: "stub",
    async complete(messages, tools) {
      const system = messages.find((message) => message.role === "system")?.content || "";
      if (system.startsWith("You are judging an API agent.")) return scriptedJudge(messages);
      return scriptedAct(messages, tools, options.failPattern, options.omitAuthPattern);
    },
  };
}

function scriptedJudge(messages: ChatMessage[]): LlmCompletion {
  const user = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  const success = user.match(/-> (2\d\d)/);
  const evidence = success ? `-> ${success[1]}` : "";
  const pass = Boolean(success);
  const content = JSON.stringify({
    pass,
    failureMode: pass ? null : "gave_up",
    explanation: pass ? "A tool call returned a success status." : "The call log has no successful tool call.",
    evidence: evidence ? [evidence] : [],
  });
  return { content, toolCalls: [], promptTokens: 0, completionTokens: 0, model: "scripted" };
}

function scriptedAct(
  messages: ChatMessage[],
  tools: ToolSpec[],
  failPattern?: RegExp,
  omitAuthPattern?: RegExp,
): LlmCompletion {
  const task = [...messages].reverse().find((message) => message.role === "user" && message.content.startsWith("Task:"))?.content || "";
  const text = task.replace(/^Task:\s*/, "");
  const priorTools = messages.filter((message) => message.role === "tool");
  if (failPattern?.test(text)) {
    if (priorTools.length === 0) {
      const decoy = tools.find((tool) => tool.operation?.method === "get") || tools[0];
      if (!decoy) return done("I cannot complete this task with the information I have.");
      return call(decoy, exampleArgs(decoy, text, priorTools, false), priorTools.length);
    }
    return done("I cannot complete this task with the information I have.");
  }
  const operations = tools.flatMap((tool) => (tool.operation ? [tool.operation] : []));
  const plan = planTask(text, operations);
  const expected = plan.expected.length ? plan.expected : operations.slice(0, 1);
  const next = expected[priorTools.length];
  if (!next) return done("Done.");
  const tool = tools.find((item) => item.name === next.operationId) || tools.find((item) => item.operation?.path === next.path);
  if (!tool) return done("I cannot complete this task with the information I have.");
  const omitAuth = Boolean(omitAuthPattern?.test(text));
  return call(tool, exampleArgs(tool, text, priorTools, omitAuth), priorTools.length);
}

function call(tool: ToolSpec, args: Record<string, unknown>, index: number): LlmCompletion {
  return {
    content: "",
    toolCalls: [{ id: `call_${index + 1}`, name: tool.name, arguments: args }],
    promptTokens: 0,
    completionTokens: 0,
    model: "scripted",
  };
}

function done(content: string): LlmCompletion {
  return { content, toolCalls: [], promptTokens: 0, completionTokens: 0, model: "scripted" };
}

function exampleArgs(tool: ToolSpec, task: string, prior: ChatMessage[], omitAuth: boolean): Record<string, unknown> {
  const schema = tool.parameters;
  const properties = schema.properties || {};
  const previousId = findIdentifier(prior);
  const args: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(properties)) {
    if (key === "body" || key === "authToken") continue;
    args[key] = argumentFor(key, child, task, previousId);
  }
  if (properties.body) {
    const body = isRecord(synthesize(properties.body)) ? { ...(synthesize(properties.body) as Record<string, unknown>) } : {};
    overlayTask(body, task, properties.body);
    args.body = body;
  }
  if (properties.authToken && !omitAuth) args.authToken = "apiproof-demo";
  return args;
}

function argumentFor(key: string, schema: JsonSchema, task: string, previousId?: string): unknown {
  if (/^(owner)$/i.test(key)) return "octocat";
  if (/repo/i.test(key)) return /hello-world/i.test(task) ? "hello-world" : "hello-world";
  if (/account/i.test(key)) return task.match(/AC[0-9a-f]{10,}/i)?.[0] || "AC00000000000000000000000000000001";
  if (/channel/i.test(key)) return task.match(/\bC[A-Z0-9]{5,}\b/)?.[0] || "C012345";
  if (/user_?id/i.test(key)) return "apiproof";
  if (/id|sid|number|uuid/i.test(key)) {
    const value = previousId || "1001";
    return primaryType(schema) === "integer" ? Number(value) || 1001 : value;
  }
  if (schema.enum?.length) {
    const fromTask = schema.enum.find((item) => task.toLowerCase().includes(String(item).toLowerCase()));
    return fromTask ?? schema.enum[0];
  }
  return synthesize(schema);
}

function overlayTask(body: Record<string, unknown>, task: string, schema: JsonSchema): void {
  const literals = quoted(task);
  const named = task.match(/\b(?:named|titled|called)\s+([A-Za-z][\w-]{1,40})/);
  const literal = named?.[1] || literals[0];
  const props = schema.properties || {};
  if (literal) {
    for (const key of ["name", "title", "text", "body", "message", "description", "receipt"]) {
      if (key in props || key in body) body[key] = literal;
    }
  }
  const amount = task.match(/\b(\d{2,9})\b/);
  if (amount && ("amount" in props || "amount" in body)) body.amount = Number(amount[1]);
  if (/\bINR\b/i.test(task) && ("currency" in props || "currency" in body)) body.currency = "INR";
  const status = task.match(/\b(available|pending|sold)\b/i);
  if (status && ("status" in props || "status" in body)) body.status = status[1].toLowerCase();
  if (literals[0] && ("query" in props || "q" in props)) {
    const key = "query" in props ? "query" : "q";
    body[key] = literals[0];
  }
}

function quoted(task: string): string[] {
  return [...task.matchAll(/"([^"]{2,80})"|'([^']{2,80})'/g)].map((match) => match[1] || match[2]);
}

function findIdentifier(messages: ChatMessage[]): string | undefined {
  for (const message of messages) {
    if (message.role !== "tool") continue;
    try {
      const found = walk(JSON.parse(message.content));
      if (found) return found;
    } catch {
      continue;
    }
  }
  return undefined;
}

function walk(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = walk(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of ["id", "number", "sid", "uuid", "petId", "orderId"]) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number") return String(item);
  }
  for (const item of Object.values(value)) {
    const found = walk(item);
    if (found) return found;
  }
  return undefined;
}

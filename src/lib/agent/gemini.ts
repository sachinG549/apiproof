import type { ChatMessage, LlmCompletion, ToolSpec } from "@/lib/agent/providers";
import { ProviderError } from "@/lib/errors";
import { boundSchema } from "@/lib/spec/schema";
import type { JsonSchema } from "@/lib/types";

export type GeminiReplayPart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
};

const RETRYABLE = new Set([408, 429, 500, 503]);

/**
 * Gemini 3 models think by default. On 27 Nov 2026 Google documents
 * gemini-3.8-flash as MEDIUM and gemini-3.5-flash-lite as MINIMAL.
 * Medium thinking on every tool step is what blew the 40s task budget.
 * Flash-lite is the fast default. 3.8-flash does not accept MINIMAL, so it gets LOW.
 * gemini-2.0-flash and gemini-2.5-flash are retired or deprecated and are not defaults.
 */
export function thinkingConfigFor(model: string, requested?: string): Record<string, string | number> | undefined {
  const family = geminiFamily(model);
  if (family === "2.5") {
    return { thinkingBudget: requested === "high" ? 1024 : 0 };
  }
  if (family === "3" || family === "4") {
    let level = (requested || defaultThinkingLevel(model)).toUpperCase();
    if (!["MINIMAL", "LOW", "MEDIUM", "HIGH"].includes(level)) level = "LOW";
    if (level === "MINIMAL" && !supportsMinimal(model)) level = "LOW";
    return { thinkingLevel: level };
  }
  return undefined;
}

export function defaultThinkingLevel(model: string): string {
  return /flash-lite/i.test(model) ? "MINIMAL" : "LOW";
}

export function supportsMinimal(model: string): boolean {
  if (/gemini-3\.[78]-flash($|[^a-z])/i.test(model)) return false;
  return true;
}

export function geminiFamily(model: string): "2.5" | "3" | "4" | "other" {
  if (/gemini-2\.5/i.test(model)) return "2.5";
  if (/gemini-[34](?:[.-]|$)/i.test(model)) {
    return model.startsWith("gemini-4") ? "4" : "3";
  }
  return "other";
}

export function isRetryableGeminiStatus(status: number): boolean {
  return RETRYABLE.has(status);
}

export function toGeminiBody(messages: ChatMessage[], tools: ToolSpec[], model: string, thinkingLevel?: string): Record<string, unknown> {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
    } else if (message.role === "assistant") {
      const parts = message.geminiParts?.length ? message.geminiParts.map(partToJson) : assistantParts(message);
      if (parts.length) contents.push({ role: "model", parts });
    } else if (message.role === "tool") {
      const part = { functionResponse: { name: message.name, response: safeJson(message.content) } };
      const previous = contents[contents.length - 1];
      if (previous?.role === "user" && previous.parts.every((item) => "functionResponse" in item)) previous.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  const thinking = thinkingConfigFor(model, thinkingLevel);
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    generationConfig: thinking ? { thinkingConfig: thinking } : undefined,
    tools: tools.length
      ? [
          {
            functionDeclarations: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: geminiSchema(boundSchema(tool.parameters)),
            })),
          },
        ]
      : undefined,
  };
}

export async function postGemini(input: {
  apiKey: string;
  model: string;
  fallbackModel: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  thinkingLevel?: string;
  attemptTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): Promise<LlmCompletion> {
  const fetchImpl = input.fetchImpl || fetch;
  const sleepImpl = input.sleepImpl || ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const attemptTimeoutMs = input.attemptTimeoutMs ?? 5_000;
  const models = [input.model, input.fallbackModel].filter((model, index, all) => model && all.indexOf(model) === index);
  let lastError: ProviderError | null = null;
  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const fallback = modelIndex > 0;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (input.signal?.aborted) throw abortError();
      try {
        const completion = await oneAttempt({
          ...input,
          model,
          fetchImpl,
          attemptTimeoutMs,
          usedFallback: fallback,
        });
        return completion;
      } catch (error) {
        if (input.signal?.aborted) throw error;
        const providerError = asProviderError(error);
        lastError = providerError;
        const status = providerError?.status;
        const retryable = status != null && isRetryableGeminiStatus(status);
        const fallbackable = retryable || status === 404 || isAbortError(error);
        if (retryable && attempt === 0) {
          await sleepImpl(400);
          continue;
        }
        if (fallbackable && modelIndex < models.length - 1) break;
        throw providerError || error;
      }
    }
  }
  throw lastError || new ProviderError("Gemini did not respond.", 502);
}

async function oneAttempt(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  thinkingLevel?: string;
  attemptTimeoutMs: number;
  fetchImpl: typeof fetch;
  usedFallback: boolean;
}): Promise<LlmCompletion> {
  const timeout = AbortSignal.timeout(input.attemptTimeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const response = await input.fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${input.model}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(toGeminiBody(input.messages, input.tools, input.model, input.thinkingLevel)),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new ProviderError(geminiFailureMessage(response.status, body), response.status, body);
  }
  const payload = (await response.json()) as GeminiResponse;
  const parts = payload.candidates?.[0]?.content?.parts || [];
  const replay = parts.map(normalizePart).filter((part) => part.functionCall || part.thoughtSignature || (part.text && !part.thought));
  const calls = replay.filter((part) => part.functionCall);
  return {
    content: parts
      .filter((part) => part.text && !part.thought)
      .map((part) => part.text || "")
      .join("\n"),
    toolCalls: calls.map((part, index) => ({
      id: `gem_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
      name: part.functionCall?.name || "unknown",
      arguments: part.functionCall?.args || {},
    })),
    geminiParts: replay,
    promptTokens: payload.usageMetadata?.promptTokenCount || 0,
    completionTokens: payload.usageMetadata?.candidatesTokenCount || 0,
    model: input.model,
    usedFallback: input.usedFallback,
  };
}

function assistantParts(message: Extract<ChatMessage, { role: "assistant" }>): Record<string, unknown>[] {
  const parts: Record<string, unknown>[] = [];
  if (message.content) parts.push({ text: message.content });
  for (const call of message.toolCalls || []) {
    parts.push({ functionCall: { name: call.name, args: call.arguments } });
  }
  return parts;
}

function partToJson(part: GeminiReplayPart): Record<string, unknown> {
  const json: Record<string, unknown> = {};
  if (part.text) json.text = part.text;
  if (part.thought) json.thought = true;
  if (part.thoughtSignature) json.thoughtSignature = part.thoughtSignature;
  if (part.functionCall) json.functionCall = part.functionCall;
  return json;
}

function normalizePart(part: GeminiResponsePart): GeminiReplayPart {
  return {
    text: part.text,
    thought: part.thought,
    thoughtSignature: part.thoughtSignature,
    functionCall: part.functionCall?.name
      ? { name: part.functionCall.name, args: isArgs(part.functionCall.args) ? part.functionCall.args : {} }
      : undefined,
  };
}

function geminiSchema(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = {};
  if (schema.type) next.type = schema.type;
  if (schema.description) next.description = schema.description;
  if (schema.enum) next.enum = schema.enum;
  if (schema.required) next.required = schema.required;
  if (schema.items) next.items = geminiSchema(schema.items);
  if (schema.properties) {
    next.properties = {};
    for (const [key, value] of Object.entries(schema.properties)) next.properties[key] = geminiSchema(value);
  }
  return next;
}

function safeJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return { result: parsed as never };
  } catch {
    return { result: text };
  }
}

function isArgs(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function geminiFailureMessage(status: number, body: string): string {
  if (status === 401 || status === 403) return "Gemini rejected the API key.";
  if (status === 404) return `Gemini model was not found. ${body.slice(0, 160)}`;
  if (status === 429) return "Gemini is out of free-tier quota right now.";
  if (status === 503) return "Gemini is under high demand right now.";
  return `Gemini returned HTTP ${status}. ${body.slice(0, 180)}`;
}

function asProviderError(error: unknown): ProviderError | null {
  return error instanceof ProviderError ? error : null;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function abortError(): Error {
  const error = new Error("The Gemini request was aborted.");
  error.name = "AbortError";
  return error;
}

type GeminiResponsePart = {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name?: string; args?: Record<string, unknown> };
};

type GeminiResponse = {
  candidates?: { content?: { parts?: GeminiResponsePart[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

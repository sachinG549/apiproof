import { getConfig } from "@/lib/config";
import { ProviderError } from "@/lib/errors";
import type { JsonSchema, Operation } from "@/lib/types";
import { boundSchema } from "@/lib/spec/schema";
import { sleep } from "@/lib/util";
import { createScriptedProvider } from "@/lib/agent/scripted";

export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; name: string; content: string };

export type ToolSpec = {
  name: string;
  description: string;
  parameters: JsonSchema;
  operation?: Operation;
};

export type LlmCompletion = {
  content: string;
  toolCalls: ToolCall[];
  promptTokens: number;
  completionTokens: number;
  model: string;
  usedFallback?: boolean;
};

export type ProviderKind = "groq" | "gemini" | "stub";

export interface LlmProvider {
  id: string;
  label: string;
  model: string;
  kind: ProviderKind;
  complete(messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal): Promise<LlmCompletion>;
}

export function listProviders(): LlmProvider[] {
  const config = getConfig();
  const providers: LlmProvider[] = [];
  if (config.hasGroq) providers.push(new GroqProvider());
  if (config.hasGemini) providers.push(new GeminiProvider());
  if (!providers.length && config.allowStub) {
    providers.push(
      createScriptedProvider({
        id: "stub",
        label: "Stub agent · no model key",
        failPattern: /\bdelete\b/i,
      }),
    );
  }
  return providers;
}

export function describeProviders(): { id: string; label: string; kind: ProviderKind }[] {
  return listProviders().map((provider) => ({ id: provider.id, label: provider.label, kind: provider.kind }));
}

export function providerNotice(providers: { kind: ProviderKind; label: string }[]): string | null {
  const kinds = new Set(providers.map((provider) => provider.kind));
  if (kinds.has("stub")) {
    return "No GROQ_API_KEY or GEMINI_API_KEY is set. This run uses a deterministic stub agent so you can preview the product. Pass rates here are not a measurement of Groq or Gemini.";
  }
  if (!kinds.has("groq") && kinds.has("gemini")) return "GROQ_API_KEY is not set, so this run only used Gemini.";
  if (kinds.has("groq") && !kinds.has("gemini")) return "GEMINI_API_KEY is not set, so this run only used Groq.";
  return null;
}

class GroqProvider implements LlmProvider {
  id = "groq";
  kind: ProviderKind = "groq";
  model = getConfig().groqModel;
  label = `Groq · ${this.model}`;
  private usedFallback = false;

  async complete(messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal): Promise<LlmCompletion> {
    const config = getConfig();
    try {
      return await this.request(this.model, messages, tools, signal, false);
    } catch (error) {
      if (!(error instanceof ProviderError) || error.status !== 429) throw error;
      this.usedFallback = true;
      this.model = config.groqFallbackModel;
      this.label = `Groq · ${this.model} (fallback)`;
      const completion = await this.request(this.model, messages, tools, signal, true);
      return { ...completion, usedFallback: true };
    }
  }

  private async request(
    model: string,
    messages: ChatMessage[],
    tools: ToolSpec[],
    signal: AbortSignal | undefined,
    fallback: boolean,
  ): Promise<LlmCompletion> {
    const key = process.env.GROQ_API_KEY || "";
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          authorization: `Bearer ${key}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: toOpenAiMessages(messages),
          tools: tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: boundSchema(tool.parameters),
            },
          })),
          tool_choice: tools.length ? "auto" : "none",
        }),
      });
      if (response.status === 429) {
        lastError = new ProviderError("Groq rate limit reached.", 429, await response.text());
        if (attempt < 2 && !fallback) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new ProviderError(providerMessage("Groq", response.status, body), response.status, body);
      }
      const payload = (await response.json()) as GroqResponse;
      const message = payload.choices?.[0]?.message;
      return {
        content: message?.content || "",
        toolCalls: (message?.tool_calls || []).map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: parseArguments(call.function.arguments),
        })),
        promptTokens: payload.usage?.prompt_tokens || 0,
        completionTokens: payload.usage?.completion_tokens || 0,
        model,
        usedFallback: this.usedFallback,
      };
    }
    throw lastError || new ProviderError("Groq did not respond.", 502);
  }
}

class GeminiProvider implements LlmProvider {
  id = "gemini";
  kind: ProviderKind = "gemini";
  model = getConfig().geminiModel;
  label = `Gemini · ${this.model}`;

  async complete(messages: ChatMessage[], tools: ToolSpec[], signal?: AbortSignal): Promise<LlmCompletion> {
    try {
      return await this.request(this.model, messages, tools, signal, false);
    } catch (error) {
      if (!(error instanceof ProviderError) || (error.status !== 429 && error.status !== 404)) throw error;
      const fallback = getConfig().geminiFallbackModel;
      this.model = fallback;
      this.label = `Gemini · ${fallback} (fallback)`;
      const completion = await this.request(fallback, messages, tools, signal, true);
      return { ...completion, usedFallback: true };
    }
  }

  private async request(
    model: string,
    messages: ChatMessage[],
    tools: ToolSpec[],
    signal: AbortSignal | undefined,
    fallback: boolean,
  ): Promise<LlmCompletion> {
    const key = process.env.GEMINI_API_KEY || "";
    let lastError: ProviderError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
        {
          method: "POST",
          signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(toGeminiBody(messages, tools)),
        },
      );
      if (response.status === 429) {
        lastError = new ProviderError("Gemini rate limit reached.", 429, await response.text());
        if (attempt < 2 && !fallback) {
          await sleep(500 * 2 ** attempt);
          continue;
        }
        throw lastError;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new ProviderError(providerMessage("Gemini", response.status, body), response.status, body);
      }
      const payload = (await response.json()) as GeminiResponse;
      const parts = payload.candidates?.[0]?.content?.parts || [];
      const calls = parts.filter((part) => part.functionCall);
      return {
        content: parts.map((part) => part.text || "").filter(Boolean).join("\n"),
        toolCalls: calls.map((part, index) => ({
          id: `gem_${index + 1}_${Math.random().toString(36).slice(2, 8)}`,
          name: part.functionCall?.name || "unknown",
          arguments: isArgs(part.functionCall?.args) ? part.functionCall?.args || {} : {},
        })),
        promptTokens: payload.usageMetadata?.promptTokenCount || 0,
        completionTokens: payload.usageMetadata?.candidatesTokenCount || 0,
        model,
      };
    }
    throw lastError || new ProviderError("Gemini did not respond.", 502);
  }
}

function providerMessage(name: string, status: number, body: string): string {
  if (status === 401 || status === 403) return `${name} rejected the API key.`;
  if (status === 429) return `${name} is out of free-tier quota right now.`;
  return `${name} returned HTTP ${status}. ${body.slice(0, 180)}`;
}

function parseArguments(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isArgs(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toOpenAiMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    }
    return { role: message.role, content: message.content };
  });
}

function toGeminiBody(messages: ChatMessage[], tools: ToolSpec[]): Record<string, unknown> {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n");
  const contents: { role: string; parts: Record<string, unknown>[] }[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user") {
      contents.push({ role: "user", parts: [{ text: message.content }] });
    } else if (message.role === "assistant") {
      const parts: Record<string, unknown>[] = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.toolCalls || []) parts.push({ functionCall: { name: call.name, args: call.arguments } });
      if (parts.length) contents.push({ role: "model", parts });
    } else if (message.role === "tool") {
      const response = safeJson(message.content);
      const part = { functionResponse: { name: message.name, response } };
      const previous = contents[contents.length - 1];
      if (previous?.role === "user" && previous.parts.every((item) => "functionResponse" in item)) previous.parts.push(part);
      else contents.push({ role: "user", parts: [part] });
    }
  }
  return {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents,
    tools: tools.length
      ? [{ functionDeclarations: tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: geminiSchema(boundSchema(tool.parameters)) })) }]
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
    return { result: parsed };
  } catch {
    return { result: text };
  }
}

type GroqResponse = {
  choices?: { message?: { content?: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; functionCall?: { name?: string; args?: Record<string, unknown> } }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
};

import { describe, expect, it } from "vitest";
import { postGemini, thinkingConfigFor, toGeminiBody } from "@/lib/agent/gemini";
import type { ChatMessage } from "@/lib/agent/providers";

describe("Gemini requests", () => {
  it("uses a low thinking level and does not default to retired models", () => {
    expect(thinkingConfigFor("gemini-3.5-flash-lite")).toEqual({ thinkingLevel: "MINIMAL" });
    expect(thinkingConfigFor("gemini-3.8-flash")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingConfigFor("gemini-3.8-flash", "MINIMAL")).toEqual({ thinkingLevel: "LOW" });
    expect(thinkingConfigFor("gemini-2.5-flash")).toEqual({ thinkingBudget: 0 });
    expect(thinkingConfigFor("gemini-2.0-flash")).toBeUndefined();
  });

  it("sends the thinking config and replays thought signatures", () => {
    const messages: ChatMessage[] = [
      { role: "user", content: "Task: add a pet" },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "1", name: "addPet", arguments: { name: "DemoDog" } }],
        geminiParts: [{ functionCall: { name: "addPet", args: { name: "DemoDog" } }, thoughtSignature: "sig-1" }],
      },
      { role: "tool", toolCallId: "1", name: "addPet", content: "{\"id\":1001}" },
    ];
    const body = toGeminiBody(messages, [], "gemini-3.5-flash-lite") as {
      generationConfig: { thinkingConfig: { thinkingLevel: string } };
      contents: { role: string; parts: Record<string, unknown>[] }[];
    };
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
    const modelTurn = body.contents.find((turn) => turn.role === "model");
    expect(modelTurn?.parts[0]).toMatchObject({ thoughtSignature: "sig-1", functionCall: { name: "addPet" } });
  });

  it("retries a 503 and then uses the fallback model", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request) => {
      const model = String(url).match(/models\/([^:]+)/)?.[1] || "";
      calls.push(model);
      if (model === "gemini-3.8-flash") return new Response("high demand", { status: 503 });
      return Response.json({
        candidates: [{ content: { parts: [{ text: "done" }] } }],
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 },
      });
    }) as typeof fetch;

    const result = await postGemini({
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      fallbackModel: "gemini-3.5-flash-lite",
      messages: [{ role: "user", content: "Task: list pets" }],
      tools: [],
      fetchImpl,
      sleepImpl: async () => {},
    });

    expect(calls).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash-lite"]);
    expect(result.usedFallback).toBe(true);
    expect(result.model).toBe("gemini-3.5-flash-lite");
    expect(result.content).toBe("done");
  });
});

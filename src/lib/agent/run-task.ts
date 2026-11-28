import { getConfig } from "@/lib/config";
import { ProviderError } from "@/lib/errors";
import { evaluateTask } from "@/lib/checks/evaluate";
import { planTask } from "@/lib/agent/plan";
import type { ChatMessage, LlmProvider } from "@/lib/agent/providers";
import { operationsToTools, selectToolsForTask, toolIndex } from "@/lib/agent/tools";
import { MockApi } from "@/lib/mock/server";
import type { ParsedSpec, StepRecord, TaskRunResult } from "@/lib/types";
import { redactArgs, truncateJson, truncateText } from "@/lib/util";

export async function runTask(input: {
  spec: ParsedSpec;
  task: string;
  provider: LlmProvider;
  timeoutMs?: number;
  stepTimeoutMs?: number;
  maxSteps?: number;
}): Promise<TaskRunResult> {
  const started = Date.now();
  const config = getConfig();
  const timeoutMs = input.timeoutMs ?? config.taskTimeoutMs;
  const stepTimeoutMs = input.stepTimeoutMs ?? config.stepTimeoutMs;
  const maxSteps = input.maxSteps ?? config.maxAgentSteps;
  const tools = selectToolsForTask(operationsToTools(input.spec), input.task);
  const mock = new MockApi(input.spec);
  const steps: StepRecord[] = [];
  const unknownTools: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let usedFallback = false;
  let finalText = "";
  let timedOut = false;
  const deadline = started + timeoutMs;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        "You complete a task by calling API tools. A mock of the API executes them and remembers resources you create.",
        "Call tools to do the work. Do not claim success without the tool results to back it.",
        "When a tool requires authToken, set it to apiproof-demo. The mock checks that a credential is present, not that it is a real secret.",
        "Copy ids from earlier tool responses. Do not invent an id when a previous response already returned one.",
        "When the task is finished, stop calling tools and reply with one short sentence.",
        "If you cannot finish, say what is missing.",
        "",
        "Operations:",
        toolIndex(tools),
      ].join("\n"),
    },
    { role: "user", content: `Task: ${input.task}` },
  ];

  try {
    for (let step = 0; step < maxSteps; step += 1) {
      const remaining = deadline - Date.now();
      if (remaining < 1_500) {
        timedOut = true;
        break;
      }
      const stepSignal = AbortSignal.timeout(Math.min(stepTimeoutMs, remaining));
      let completion;
      try {
        completion = await input.provider.complete(messages, tools, stepSignal);
      } catch (error) {
        if (isAbort(error) || stepSignal.aborted) {
          timedOut = true;
          break;
        }
        throw error;
      }
      promptTokens += completion.promptTokens;
      completionTokens += completion.completionTokens;
      if (completion.usedFallback) usedFallback = true;
      if (!completion.toolCalls.length) {
        finalText = completion.content.trim();
        if (finalText) steps.push({ index: steps.length, kind: "reasoning", reasoning: truncateText(finalText, 800) });
        break;
      }
      if (completion.content.trim()) {
        steps.push({ index: steps.length, kind: "reasoning", reasoning: truncateText(completion.content.trim(), 800) });
      }
      messages.push({
        role: "assistant",
        content: completion.content,
        toolCalls: completion.toolCalls,
        geminiParts: completion.geminiParts,
      });
      for (const call of completion.toolCalls) {
        const tool = tools.find((item) => item.name === call.name);
        if (!tool) {
          unknownTools.push(call.name);
          const payload = { error: "unknown_tool", message: `No operation is named ${call.name}. Use one of the provided tools.` };
          messages.push({ role: "tool", toolCallId: call.id, name: call.name, content: JSON.stringify(payload) });
          steps.push({
            index: steps.length,
            kind: "tool",
            toolName: call.name,
            args: redactArgs(call.arguments),
            status: 404,
            error: "Unknown tool",
            response: payload,
          });
          continue;
        }
        const result = mock.call(tool.operation, call.arguments);
        const response = truncateJson(result.response);
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(response),
        });
        steps.push({
          index: steps.length,
          kind: "tool",
          toolName: call.name,
          method: result.method,
          path: result.path,
          args: redactArgs(call.arguments),
          status: result.status,
          response,
        });
      }
    }
    if (timedOut) {
      return {
        status: "error",
        passed: null,
        failureMode: null,
        explanation:
          "This task ran out of time before the model finished. Each model call has its own time limit so a slow step can fall back instead of consuming the whole run. The steps above were not scored.",
        suggestion: null,
        steps,
        latencyMs: Date.now() - started,
        promptTokens,
        completionTokens,
        checkSource: "unscored",
        usedFallback,
        modelLabel: input.provider.label,
        error: "Timed out",
      };
    }
    const plan = planTask(input.task, input.spec.operations);
    const evaluation = await evaluateTask({
      task: input.task,
      plan,
      log: mock.log,
      finalText,
      unknownTools,
      provider: input.provider,
    });
    return {
      status: "done",
      passed: evaluation.passed,
      failureMode: evaluation.failureMode,
      explanation: evaluation.explanation,
      suggestion: evaluation.suggestion,
      steps,
      latencyMs: Date.now() - started,
      promptTokens: promptTokens + evaluation.promptTokens,
      completionTokens: completionTokens + evaluation.completionTokens,
      checkSource: evaluation.checkSource,
      usedFallback,
      modelLabel: input.provider.label,
    };
  } catch (error) {
    const aborted = isAbort(error);
    const quota = error instanceof ProviderError && error.status === 429;
    const overloaded = error instanceof ProviderError && error.status === 503;
    return {
      status: "error",
      passed: null,
      failureMode: quota ? "quota_exhausted" : null,
      explanation: aborted
        ? "This task ran out of time before the model finished. It was not scored."
        : quota
          ? `${input.provider.label} is out of free-tier quota after backoff and fallback. This is not a spec failure.`
          : overloaded
            ? `${input.provider.label} stayed under high demand after a retry and the fallback model. This was not scored.`
            : error instanceof Error
              ? error.message
              : "The model request failed.",
      suggestion: null,
      steps,
      latencyMs: Date.now() - started,
      promptTokens,
      completionTokens,
      checkSource: "unscored",
      usedFallback,
      modelLabel: input.provider.label,
      error: aborted ? "Timed out" : quota ? "Quota exhausted" : overloaded ? "Model overloaded" : "Model request failed",
    };
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

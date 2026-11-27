import type { LlmProvider } from "@/lib/agent/providers";
import type { TaskPlan } from "@/lib/agent/plan";
import { suggestFix } from "@/lib/checks/fixes";
import type { CallLogEntry, FailureMode, Operation, TaskRunResult } from "@/lib/types";
import { collectPrimitives, deepContains } from "@/lib/util";

export type Evaluation = Pick<
  TaskRunResult,
  "passed" | "failureMode" | "explanation" | "suggestion" | "checkSource" | "promptTokens" | "completionTokens"
>;

const GAVE_UP = /\b(cannot|can't|unable|not sure|don't know|do not know|insufficient|gave up|failed to)\b/i;
const ID_PARAM = /id|sid|number|uuid/i;

export async function evaluateTask(input: {
  task: string;
  plan: TaskPlan;
  log: CallLogEntry[];
  finalText: string;
  unknownTools: string[];
  provider?: LlmProvider;
}): Promise<Evaluation> {
  const deterministic = decide(input.task, input.plan, input.log, input.finalText, input.unknownTools);
  if (!("needsJudge" in deterministic)) return { ...deterministic, promptTokens: 0, completionTokens: 0 };
  if (!input.provider) {
    return {
      passed: false,
      failureMode: "gave_up",
      explanation: "The task could not be mapped to operations confidently, and no judge model was available.",
      suggestion: null,
      checkSource: "unscored",
      promptTokens: 0,
      completionTokens: 0,
    };
  }
  return judge(input.task, input.log, input.finalText, input.plan, input.provider);
}

function decide(
  task: string,
  plan: TaskPlan,
  log: CallLogEntry[],
  finalText: string,
  unknownTools: string[],
): Omit<Evaluation, "promptTokens" | "completionTokens"> | { needsJudge: true } {
  if (!plan.confident || plan.expected.length === 0) return { needsJudge: true };
  const problems: Problem[] = [];
  for (const expected of plan.expected) {
    const calls = log.filter((entry) => entry.method === expected.method.toUpperCase() && entry.pathTemplate === expected.path);
    if (calls.some((entry) => entry.status >= 200 && entry.status < 300)) continue;
    const last = calls[calls.length - 1];
    if (!last) {
      const mode: FailureMode = unknownTools.length ? "hallucinated_endpoint" : GAVE_UP.test(finalText) ? "gave_up" : "wrong_operation";
      problems.push({ mode, operation: expected });
      continue;
    }
    if (last.status === 401 || last.auth === "missing") problems.push({ mode: "auth_confusion", operation: expected, call: last });
    else if (last.errorCode === "missing_parameter") {
      problems.push({
        mode: ambiguous(expected, last.missingParameter) ? "ambiguous_parameter" : "missing_parameter",
        operation: expected,
        call: last,
        detail: last.missingParameter,
      });
    } else if (last.errorCode === "schema_mismatch" || last.status === 400) {
      problems.push({ mode: "schema_mismatch", operation: expected, call: last, detail: messageOf(last.response) });
    } else {
      problems.push({ mode: "wrong_operation", operation: expected, call: last });
    }
  }

  if (!problems.length) {
    const linkage = checkLinkage(task, plan.expected, log);
    if (linkage) problems.push(linkage);
    const literal = checkLiterals(task, log);
    if (literal) problems.push(literal);
  }

  if (!problems.length) {
    const called = plan.expected
      .map((operation) => `${operation.method.toUpperCase()} ${operation.path}`)
      .join(", then ");
    return {
      passed: true,
      failureMode: null,
      explanation: `The agent called ${called}, each returned success, and the ids lined up with the call log.`,
      suggestion: null,
      checkSource: "deterministic",
    };
  }

  const problem = problems[0];
  const other = log.find((entry) => entry.pathTemplate !== problem.operation.path);
  const related = other ? plan.expected.find((operation) => operation.path === other.pathTemplate) : undefined;
  return {
    passed: false,
    failureMode: problem.mode,
    explanation: explain(problem, finalText),
    suggestion: suggestFix({
      failureMode: problem.mode,
      operation: problem.operation,
      related,
      detail: problem.detail,
    }),
    checkSource: "deterministic",
  };
}

type Problem = {
  mode: FailureMode;
  operation: Operation;
  call?: CallLogEntry;
  detail?: string;
};

function explain(problem: Problem, finalText: string): string {
  const target = `${problem.operation.method.toUpperCase()} ${problem.operation.path}`;
  if (problem.mode === "auth_confusion") {
    return `${target} requires a credential. The call was rejected with 401 because no auth token was sent.`;
  }
  if (problem.mode === "missing_parameter") {
    return `${target} is missing required parameter "${problem.detail || "a required value"}".`;
  }
  if (problem.mode === "ambiguous_parameter") {
    return `${target} needs "${problem.detail}", and a similarly named parameter makes the right field unclear.`;
  }
  if (problem.mode === "schema_mismatch") {
    return `${target} rejected the body. ${problem.detail || "It did not match the schema."}`;
  }
  if (problem.mode === "unclear_id_linkage") {
    return `${target} was called with an id that does not appear in an earlier response, so the steps are not actually connected.`;
  }
  if (problem.mode === "gave_up") {
    return `The agent stopped before calling ${target}. ${finalText ? `It said: ${finalText.slice(0, 240)}` : "It did not explain a completed call sequence."}`;
  }
  if (problem.mode === "hallucinated_endpoint") {
    return `The agent called a tool that is not in the spec instead of ${target}.`;
  }
  return `The task needed ${target}, and that operation never succeeded.`;
}

function checkLinkage(task: string, expected: Operation[], log: CallLogEntry[]): Problem | null {
  const priorValues = new Set<string>();
  for (const operation of expected) {
    const call = log.find(
      (entry) =>
        entry.method === operation.method.toUpperCase() &&
        entry.pathTemplate === operation.path &&
        entry.status >= 200 &&
        entry.status < 300,
    );
    if (!call) continue;
    for (const parameter of operation.parameters) {
      if (parameter.in !== "path" || !ID_PARAM.test(parameter.name)) continue;
      const value = call.args[parameter.name];
      if (value == null) continue;
      const text = String(value);
      if (task.includes(text)) continue;
      if (priorValues.size && !priorValues.has(text)) {
        return { mode: "unclear_id_linkage", operation, call, detail: parameter.name };
      }
    }
    for (const value of collectPrimitives(call.response)) priorValues.add(value);
  }
  return null;
}

function checkLiterals(task: string, log: CallLogEntry[]): Problem | null {
  const wanted = [
    ...[...task.matchAll(/"([^"]{2,80})"|'([^']{2,80})'/g)].map((match) => match[1] || match[2]),
    ...[...task.matchAll(/\b(?:named|titled|called)\s+([A-Za-z][\w-]{1,40})/g)].map((match) => match[1]),
  ];
  if (!wanted.length) return null;
  const bodies = log.map((entry) => entry.args);
  const missing = wanted.filter((literal) => !bodies.some((body) => deepContains(body, literal)));
  if (!missing.length) return null;
  const operation = log[0];
  if (!operation) return null;
  return {
    mode: "missing_parameter",
    operation: {
      operationId: operation.operationId,
      method: operation.method.toLowerCase() as Operation["method"],
      path: operation.pathTemplate,
      pathKey: operation.pathTemplate,
      summary: operation.operationId,
      description: "",
      tags: [],
      parameters: [],
      responses: {},
      security: [],
      collection: "",
    },
    detail: missing[0],
  };
}

function ambiguous(operation: Operation, missing?: string): boolean {
  if (!missing) return false;
  const names = operation.parameters.map((parameter) => parameter.name.toLowerCase());
  const needle = missing.toLowerCase();
  return names.some((name) => name !== needle && (name.includes(needle) || needle.includes(name)));
}

function messageOf(response: unknown): string | undefined {
  if (response && typeof response === "object" && "message" in response && typeof response.message === "string") {
    return response.message.slice(0, 240);
  }
  return undefined;
}

async function judge(
  task: string,
  log: CallLogEntry[],
  finalText: string,
  plan: TaskPlan,
  provider: LlmProvider,
): Promise<Evaluation> {
  const lines = log.map((entry) => `${entry.method} ${entry.path} -> ${entry.status}`);
  const haystack = `${lines.join("\n")}\n${JSON.stringify(log.map((entry) => ({ method: entry.method, path: entry.path, status: entry.status, args: entry.args, response: entry.response })))}\n${finalText}`;
  const prompt = [
    `Task: ${task}`,
    "Call log lines:",
    lines.join("\n") || "(no tool calls)",
    `Agent final text: ${finalText || "(none)"}`,
    "Reply with JSON only: {\"pass\": boolean, \"failureMode\": string, \"explanation\": string, \"evidence\": string[]}.",
    "evidence must be exact substrings copied from the call log lines or the final text.",
    `failureMode must be one of: wrong_operation, missing_parameter, ambiguous_parameter, unclear_id_linkage, auth_confusion, schema_mismatch, gave_up, hallucinated_endpoint.`,
  ].join("\n");
  const completion = await provider.complete(
    [
      {
        role: "system",
        content:
          "You are judging an API agent. Pass only if the call log shows the task was actually completed. Every claim must cite an exact substring from the log lines.",
      },
      { role: "user", content: prompt },
    ],
    [],
  );
  const parsed = parseJudge(completion.content);
  const evidence = (parsed.evidence || []).map((item) => item.trim()).filter((item) => item.length >= 6);
  const verified = evidence.some((item) => haystack.includes(item));
  if (!verified) {
    return {
      passed: false,
      failureMode: "judge_unverified",
      explanation: "The judge did not cite a substring that appears in the call log, so this task was not marked passed.",
      suggestion: suggestFix({ failureMode: "gave_up", operation: plan.expected[0] }),
      checkSource: "judge",
      promptTokens: completion.promptTokens,
      completionTokens: completion.completionTokens,
    };
  }
  const failureMode = parsed.pass ? null : normalizeMode(parsed.failureMode);
  return {
    passed: Boolean(parsed.pass),
    failureMode,
    explanation: parsed.explanation || (parsed.pass ? "The judge passed this task and cited the call log." : "The judge failed this task and cited the call log."),
    suggestion: parsed.pass ? null : suggestFix({ failureMode: failureMode || "gave_up", operation: plan.expected[0] }),
    checkSource: "judge",
    promptTokens: completion.promptTokens,
    completionTokens: completion.completionTokens,
  };
}

function parseJudge(content: string): { pass?: boolean; failureMode?: string; explanation?: string; evidence?: string[] } {
  const match = content.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[0]) as {
      pass?: boolean;
      failureMode?: string;
      explanation?: string;
      evidence?: string[];
    };
    return parsed;
  } catch {
    return {};
  }
}

function normalizeMode(value: string | undefined): FailureMode {
  const allowed: FailureMode[] = [
    "wrong_operation",
    "missing_parameter",
    "ambiguous_parameter",
    "unclear_id_linkage",
    "auth_confusion",
    "schema_mismatch",
    "gave_up",
    "hallucinated_endpoint",
  ];
  return allowed.includes(value as FailureMode) ? (value as FailureMode) : "gave_up";
}

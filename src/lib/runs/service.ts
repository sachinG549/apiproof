import { getConfig } from "@/lib/config";
import { UserError } from "@/lib/errors";
import type { ResultRecord, RunRecord, Store } from "@/lib/db/store";
import { getStore } from "@/lib/db";
import { planTask } from "@/lib/agent/plan";
import { listProviders, providerNotice, type LlmProvider } from "@/lib/agent/providers";
import { runTask } from "@/lib/agent/run-task";
import { freezeSpec } from "@/lib/spec/compact";
import { parseSpec } from "@/lib/spec/parse";
import { limitOperations } from "@/lib/spec/trim";
import type { ParsedSpec, PublicReport, TaskRunResult } from "@/lib/types";
import { dayKey, hashIp, newId, sha256, stableStringify } from "@/lib/util";

export async function createRun(input: {
  specText: string;
  tasks: string[];
  ip?: string;
  store?: Store;
  providers?: LlmProvider[];
  skipRateLimit?: boolean;
  bypassCache?: boolean;
  noticeExtra?: string;
}): Promise<{ id: string; cached: boolean }> {
  const config = getConfig();
  if (input.specText.length > config.maxSpecBytes) {
    throw new UserError(`That spec is larger than the ${config.maxSpecBytes} byte limit.`);
  }
  const tasks = normalizeTasks(input.tasks);
  const parsed = freezeSpec(limitOperations(parseSpec(input.specText), tasks, config.maxOperations));
  const providers = input.providers?.length ? input.providers : listProviders();
  if (!providers.length) {
    throw new UserError("Add GROQ_API_KEY or GEMINI_API_KEY before starting a run. APIProof does not call real third-party APIs, but it does need a model to attempt the tasks.");
  }
  const store = input.store || getStore();
  const cacheKey = sha256(
    [
      stableStringify(parsed.document),
      tasks.map((task) => task.trim().replace(/\s+/g, " ").toLowerCase()).join("\n"),
      providers.map((provider) => provider.id).sort().join(","),
    ].join("\n---\n"),
  );
  if (!input.bypassCache) {
    const cached = await store.findCached(cacheKey);
    if (cached) return { id: cached.id, cached: true };
  }
  if (!input.skipRateLimit) {
    await enforceRateLimit(store, input.ip || "local");
  }
  const id = newId();
  const notice = [providerNotice(providers), parsed.trimNote, input.noticeExtra].filter(Boolean).join(" ");
  const providerMode = modeFor(providers);
  const run: RunRecord = {
    id,
    createdAt: new Date().toISOString(),
    specHash: sha256(stableStringify(parsed.document)),
    specTitle: parsed.title,
    specVersion: parsed.version,
    openapi: parsed.openapi,
    operationCount: parsed.operations.length,
    trimmed: Boolean(parsed.trimmedFrom),
    trimNote: parsed.trimNote || null,
    specJson: parsed.document,
    tasks,
    status: "pending",
    cacheKey,
    ipHash: input.ip ? hashIp(input.ip, config.rateLimitSalt) : null,
    notice: notice || null,
    providerMode,
    error: null,
  };
  const results: ResultRecord[] = [];
  providers.forEach((provider) => {
    tasks.forEach((task, taskIndex) => {
      results.push({
        id: newId(),
        runId: id,
        modelId: provider.id,
        modelLabel: provider.label,
        taskIndex,
        taskText: task,
        status: "pending",
        passed: null,
        failureMode: null,
        explanation: null,
        suggestion: null,
        steps: [],
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        checkSource: null,
        usedFallback: false,
        error: null,
        startedAt: null,
      });
    });
  });
  await store.createRun(run, results);
  return { id, cached: false };
}

export async function advanceRun(id: string, store: Store = getStore(), providers?: LlmProvider[]): Promise<PublicReport> {
  const run = await store.getRun(id);
  if (!run) throw new UserError("That run does not exist.", 404);
  if (run.status === "complete" || run.status === "error") return toReport(run, await store.listResults(id), false);
  await store.reclaimStale(id, 120_000);
  await store.markRun(id, "running");
  const available = providers || listProviders();
  const byId = new Map(available.map((provider) => [provider.id, provider]));
  const claimed: ResultRecord[] = [];
  const modelIds = [...new Set((await store.listResults(id)).map((result) => result.modelId))];
  for (const modelId of modelIds) {
    const next = await store.claimNext(id, modelId);
    if (next) claimed.push(next);
  }
  if (!claimed.length) {
    const next = await store.claimNext(id);
    if (next) claimed.push(next);
  }
  const spec = parseSpec(run.specJson);
  await Promise.all(claimed.map((result) => executeClaim(store, spec, result, byId.get(result.modelId))));
  const results = await store.listResults(id);
  const finished = results.every((result) => result.status === "done" || result.status === "error");
  if (finished) await store.markRun(id, "complete");
  const fresh = await store.getRun(id);
  return toReport(fresh || run, results, false);
}

async function executeClaim(
  store: Store,
  spec: ParsedSpec,
  result: ResultRecord,
  provider?: LlmProvider,
): Promise<void> {
  if (!provider) {
    await store.saveResult(result.id, {
      status: "error",
      passed: null,
      explanation: `${result.modelLabel} is no longer configured, so this task was not scored.`,
      error: "Provider unavailable",
      checkSource: "unscored",
    });
    return;
  }
  const outcome: TaskRunResult = await runTask({ spec, task: result.taskText, provider });
  await store.saveResult(result.id, {
    status: outcome.status,
    modelLabel: outcome.modelLabel,
    passed: outcome.passed,
    failureMode: outcome.failureMode,
    explanation: outcome.explanation,
    suggestion: outcome.suggestion,
    steps: outcome.steps,
    latencyMs: outcome.latencyMs,
    promptTokens: outcome.promptTokens,
    completionTokens: outcome.completionTokens,
    checkSource: outcome.checkSource,
    usedFallback: outcome.usedFallback,
    error: outcome.error || null,
  });
}

export async function getReport(id: string, store: Store = getStore()): Promise<PublicReport | null> {
  const run = await store.getRun(id);
  if (!run) return null;
  const results = await store.listResults(id);
  return toReport(run, results, false);
}

export async function saveFeedback(input: {
  runId: string;
  useful: boolean;
  comment?: string;
  store?: Store;
}): Promise<void> {
  const store = input.store || getStore();
  const run = await store.getRun(input.runId);
  if (!run) throw new UserError("That run does not exist.", 404);
  const comment = (input.comment || "").trim().slice(0, 1000);
  await store.addFeedback({
    id: newId(),
    runId: input.runId,
    useful: input.useful,
    comment: comment || null,
    createdAt: new Date().toISOString(),
  });
}

export function normalizeTasks(tasks: unknown): string[] {
  const config = getConfig();
  if (!Array.isArray(tasks)) throw new UserError(`Add between ${config.minTasks} and ${config.maxTasks} tasks.`);
  const clean = tasks.map((task) => String(task ?? "").trim()).filter(Boolean);
  if (clean.length < config.minTasks || clean.length > config.maxTasks) {
    throw new UserError(`Add between ${config.minTasks} and ${config.maxTasks} tasks.`);
  }
  if (clean.some((task) => task.length > config.maxTaskChars)) {
    throw new UserError(`Each task must be ${config.maxTaskChars} characters or fewer.`);
  }
  return clean;
}

async function enforceRateLimit(store: Store, ip: string): Promise<void> {
  const config = getConfig();
  const day = dayKey();
  const globalCount = await store.bumpRate("global", day);
  if (globalCount > config.rateLimitGlobal) {
    throw new UserError(
      `The public daily limit of ${config.rateLimitGlobal} runs has been reached. Try again tomorrow.`,
      429,
    );
  }
  const ipCount = await store.bumpRate(`ip:${hashIp(ip, config.rateLimitSalt)}`, day);
  if (ipCount > config.rateLimitPerIp) {
    throw new UserError(`This network has used its ${config.rateLimitPerIp} runs for today. Try again tomorrow.`, 429);
  }
}

function modeFor(providers: LlmProvider[]): RunRecord["providerMode"] {
  const kinds = new Set(providers.map((provider) => provider.kind));
  if (kinds.size === 1 && kinds.has("stub")) return "stub";
  if (kinds.has("stub")) return "partial";
  return "live";
}

export function toReport(run: RunRecord, results: ResultRecord[], cached: boolean): PublicReport {
  const models = [...new Map(results.map((result) => [result.modelId, result.modelLabel])).entries()];
  return {
    run: {
      id: run.id,
      createdAt: run.createdAt,
      specTitle: run.specTitle,
      specVersion: run.specVersion,
      openapi: run.openapi,
      operationCount: run.operationCount,
      trimmed: run.trimmed,
      trimNote: run.trimNote,
      tasks: run.tasks,
      status: run.status,
      notice: run.notice,
      providerMode: run.providerMode,
      cached,
    },
    results: results.map((result) => ({
      id: result.id,
      modelId: result.modelId,
      modelLabel: result.modelLabel,
      taskIndex: result.taskIndex,
      taskText: result.taskText,
      status: result.status,
      passed: result.passed,
      failureMode: result.failureMode,
      explanation: result.explanation,
      suggestion: result.suggestion,
      steps: result.steps,
      latencyMs: result.latencyMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      checkSource: result.checkSource,
      usedFallback: result.usedFallback,
      error: result.error,
    })),
    summary: {
      models: models.map(([modelId, modelLabel]) => summarize(modelId, modelLabel, results)),
    },
  };
}

function summarize(modelId: string, fallbackLabel: string, results: ResultRecord[]): PublicReport["summary"]["models"][number] {
  const rows = results.filter((result) => result.modelId === modelId);
  const scored = rows.filter((result) => result.passed != null);
  const latencies = rows.map((result) => result.latencyMs).filter((value): value is number => value != null);
  return {
    modelId,
    modelLabel: rows.find((result) => result.modelLabel)?.modelLabel || fallbackLabel,
    passed: rows.filter((result) => result.passed === true).length,
    failed: rows.filter((result) => result.passed === false).length,
    unscored: rows.length - scored.length,
    total: rows.length,
    promptTokens: rows.reduce((sum, result) => sum + (result.promptTokens || 0), 0),
    completionTokens: rows.reduce((sum, result) => sum + (result.completionTokens || 0), 0),
    avgLatencyMs: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : null,
  };
}

export function explainPlan(spec: ParsedSpec, task: string): ReturnType<typeof planTask> {
  return planTask(task, spec.operations);
}

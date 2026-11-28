import type { StepRecord, Suggestion } from "@/lib/types";

export type RunStatus = "pending" | "running" | "complete" | "error";
export type ResultStatus = "pending" | "running" | "done" | "error";
export type ProviderMode = "live" | "stub" | "partial";

export type RunRecord = {
  id: string;
  createdAt: string;
  specHash: string;
  specTitle: string;
  specVersion: string;
  openapi: string;
  operationCount: number;
  trimmed: boolean;
  trimNote: string | null;
  specJson: Record<string, unknown>;
  tasks: string[];
  status: RunStatus;
  cacheKey: string;
  ipHash: string | null;
  notice: string | null;
  providerMode: ProviderMode;
  error: string | null;
};

export type ResultRecord = {
  id: string;
  runId: string;
  modelId: string;
  modelLabel: string;
  taskIndex: number;
  taskText: string;
  status: ResultStatus;
  passed: boolean | null;
  failureMode: string | null;
  explanation: string | null;
  suggestion: Suggestion | null;
  steps: StepRecord[];
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  checkSource: string | null;
  usedFallback: boolean;
  error: string | null;
  startedAt: string | null;
};

export type FeedbackRecord = {
  id: string;
  runId: string;
  useful: boolean;
  comment: string | null;
  createdAt: string;
};

export type StatsSnapshot = {
  runs: number;
  liveRuns: number;
  uniqueSpecs: number;
  feedbackCount: number;
  usefulCount: number;
  storage: "memory" | "postgres";
};

export type GalleryLink = { slug: string; runId: string; updatedAt: string };

export interface Store {
  kind: "memory" | "postgres";
  createRun(run: RunRecord, results: ResultRecord[]): Promise<void>;
  getRun(id: string): Promise<RunRecord | null>;
  findCached(cacheKey: string): Promise<RunRecord | null>;
  listByCachePrefix(prefix: string): Promise<RunRecord[]>;
  listResults(runId: string): Promise<ResultRecord[]>;
  claimNext(runId: string, modelId?: string): Promise<ResultRecord | null>;
  reclaimStale(runId: string, olderThanMs: number): Promise<void>;
  saveResult(id: string, patch: Partial<ResultRecord>): Promise<void>;
  markRun(id: string, status: RunStatus, error?: string | null): Promise<void>;
  addFeedback(entry: FeedbackRecord): Promise<void>;
  stats(): Promise<StatsSnapshot>;
  bumpRate(key: string, day: string): Promise<number>;
  upsertGallery(slug: string, runId: string): Promise<void>;
  listGallery(): Promise<GalleryLink[]>;
}

type MemoryState = {
  runs: Map<string, RunRecord>;
  results: Map<string, ResultRecord>;
  feedback: FeedbackRecord[];
  rates: Map<string, number>;
  gallery: Map<string, GalleryLink>;
};

export function createMemoryStore(): Store {
  const state: MemoryState = {
    runs: new Map(),
    results: new Map(),
    feedback: [],
    rates: new Map(),
    gallery: new Map(),
  };

  return {
    kind: "memory",
    async createRun(run, results) {
      state.runs.set(run.id, run);
      for (const result of results) state.results.set(result.id, result);
    },
    async getRun(id) {
      return state.runs.get(id) || null;
    },
    async findCached(cacheKey) {
      for (const run of state.runs.values()) {
        if (run.cacheKey === cacheKey && run.status === "complete") return run;
      }
      return null;
    },
    async listByCachePrefix(prefix) {
      return [...state.runs.values()]
        .filter((run) => run.cacheKey.startsWith(prefix))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
    async listResults(runId) {
      return [...state.results.values()]
        .filter((result) => result.runId === runId)
        .sort((a, b) => a.taskIndex - b.taskIndex || a.modelId.localeCompare(b.modelId));
    },
    async claimNext(runId, modelId) {
      const result = [...state.results.values()]
        .filter((item) => item.runId === runId && item.status === "pending" && (!modelId || item.modelId === modelId))
        .sort((a, b) => a.taskIndex - b.taskIndex || a.modelId.localeCompare(b.modelId))[0];
      if (!result) return null;
      result.status = "running";
      result.startedAt = new Date().toISOString();
      return result;
    },
    async reclaimStale(runId, olderThanMs) {
      const cutoff = Date.now() - olderThanMs;
      for (const result of state.results.values()) {
        if (result.runId !== runId || result.status !== "running" || !result.startedAt) continue;
        if (Date.parse(result.startedAt) < cutoff) {
          result.status = "pending";
          result.startedAt = null;
        }
      }
    },
    async saveResult(id, patch) {
      const current = state.results.get(id);
      if (!current) return;
      state.results.set(id, { ...current, ...patch, id: current.id, runId: current.runId });
    },
    async markRun(id, status, error) {
      const run = state.runs.get(id);
      if (!run) return;
      run.status = status;
      if (error !== undefined) run.error = error;
    },
    async addFeedback(entry) {
      state.feedback.push(entry);
    },
    async stats() {
      const runs = [...state.runs.values()];
      return {
        runs: runs.length,
        liveRuns: runs.filter((run) => run.providerMode === "live").length,
        uniqueSpecs: new Set(runs.map((run) => run.specHash)).size,
        feedbackCount: state.feedback.length,
        usefulCount: state.feedback.filter((item) => item.useful).length,
        storage: "memory",
      };
    },
    async bumpRate(key, day) {
      const id = `${key}|${day}`;
      const next = (state.rates.get(id) || 0) + 1;
      state.rates.set(id, next);
      return next;
    },
    async upsertGallery(slug, runId) {
      state.gallery.set(slug, { slug, runId, updatedAt: new Date().toISOString() });
    },
    async listGallery() {
      return [...state.gallery.values()];
    },
  };
}

const globalStore = globalThis as typeof globalThis & { __apiproofMemory?: Store };

export function getMemoryStore(): Store {
  if (!globalStore.__apiproofMemory) globalStore.__apiproofMemory = createMemoryStore();
  return globalStore.__apiproofMemory;
}

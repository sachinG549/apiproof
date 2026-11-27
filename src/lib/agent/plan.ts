import type { HttpMethod, Operation } from "@/lib/types";

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "its", "into", "then",
  "using", "use", "their", "them", "was", "were", "are", "have", "has", "just", "after",
  "before", "onto", "per", "via", "all", "new", "a", "an", "of", "to", "in", "on", "by",
]);

const KEEP_SHORT = new Set(["id", "sid", "url"]);

const VERBS: Record<HttpMethod, string[]> = {
  post: ["create", "add", "new", "place", "register", "submit", "post", "insert", "send", "make", "open"],
  put: ["replace", "update", "edit", "change", "modify", "set"],
  patch: ["update", "edit", "change", "modify", "patch"],
  delete: ["delete", "remove", "destroy", "cancel"],
  get: ["get", "fetch", "list", "find", "retrieve", "show", "read", "search", "view", "lookup"],
};

const VERB_WORDS = new Set(Object.values(VERBS).flat());

export type RankedOperation = { operation: Operation; score: number };

export type TaskPlan = {
  task: string;
  stages: string[];
  expected: Operation[];
  confidence: number;
  confident: boolean;
};

export function planTask(task: string, operations: Operation[]): TaskPlan {
  const stages = splitStages(task);
  const expected: Operation[] = [];
  let confidence = 0.34;
  for (const stage of stages) {
    const ranked = rankOperations(stage, operations).filter((item) => item.score > 0);
    const best = ranked[0];
    const second = ranked[1];
    if (!best || best.score < 3) {
      confidence -= 0.18;
      continue;
    }
    const margin = second ? best.score - second.score : best.score;
    if (second && margin < 0.75 && second.operation.method === best.operation.method) confidence -= 0.08;
    else confidence += 0.28;
    expected.push(best.operation);
  }
  if (expected.length === stages.length && expected.length > 0) confidence += 0.12;
  confidence = Math.max(0, Math.min(1, confidence));
  return {
    task,
    stages,
    expected,
    confidence,
    confident: confidence >= 0.62 && expected.length > 0,
  };
}

export function splitStages(task: string): string[] {
  const parts = task
    .split(/\bthen\b|;/i)
    .map((part) => part.trim().replace(/^[,\s]+|[,\s]+$/g, ""))
    .filter(Boolean);
  return parts.length ? parts : [task];
}

export function rankOperations(stage: string, operations: Operation[]): RankedOperation[] {
  const words = tokenize(stage);
  const wordSet = new Set(words);
  const hinted = new Set<HttpMethod>();
  for (const [method, verbs] of Object.entries(VERBS) as [HttpMethod, string[]][]) {
    if (verbs.some((verb) => wordSet.has(verb))) hinted.add(method);
  }
  return operations
    .map((operation) => ({ operation, score: scoreOperation(stage, words, hinted, operation) }))
    .sort((a, b) => b.score - a.score);
}

function scoreOperation(stage: string, words: string[], hinted: Set<HttpMethod>, operation: Operation): number {
  let score = 0;
  if (hinted.has(operation.method)) score += 2;
  else if (hinted.size) score -= 0.75;
  if (/\b(id|identifier|sid|number)\b/i.test(stage) && operation.itemParam) score += 2.2;
  const bag = tokenize([operation.path, operation.summary, operation.operationId, operation.tags.join(" ")].join(" "));
  const bagSet = new Set(bag);
  for (const word of words) {
    if (bagSet.has(word)) score += 1.25;
  }
  score += objectBonus(stage, operation);
  return score;
}

function objectBonus(stage: string, operation: Operation): number {
  const words = stage.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const verbAt = words.findIndex((word) => VERB_WORDS.has(word));
  const window = words.slice(verbAt + 1, verbAt + 4);
  const segments = operation.path
    .split("/")
    .map((segment) => segment.replace(/\.json$/i, ""))
    .filter((segment) => segment && !segment.startsWith("{") && !/^\d+$/.test(segment) && segment.length > 2);
  let bonus = 0;
  for (const segment of segments) {
    const stem = stemWord(segment);
    if (window.some((word) => stemWord(word) === stem)) bonus += 2.6;
    else if (words.some((word) => stemWord(word) === stem)) bonus += 0.8;
  }
  return bonus;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(stemWord)
    .filter((word) => (word.length > 2 || KEEP_SHORT.has(word)) && !STOP.has(word));
}

function stemWord(word: string): string {
  const lower = word.toLowerCase();
  if (lower.endsWith("ies") && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith("s") && !lower.endsWith("ss") && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

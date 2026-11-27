import type { Operation, ParsedSpec } from "@/lib/types";
import { isRecord } from "@/lib/util";
import { rankOperations } from "@/lib/agent/plan";
import { parseSpec } from "@/lib/spec/parse";

const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options"]);

export function trimDocument(document: unknown, keepPath: (path: string) => boolean): {
  document: Record<string, unknown>;
  kept: number;
  total: number;
} {
  if (!isRecord(document)) throw new Error("Spec document was not an object.");
  const copy = structuredClone(document) as Record<string, unknown>;
  const paths = isRecord(copy.paths) ? copy.paths : {};
  const total = countOperations(paths);
  const nextPaths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(paths)) {
    if (keepPath(path)) nextPaths[path] = item;
  }
  copy.paths = nextPaths;
  const refs = new Set<string>();
  collectRefs(nextPaths, copy, refs, []);
  pruneComponents(copy, refs);
  return { document: copy, kept: countOperations(nextPaths), total };
}

export function limitOperations(spec: ParsedSpec, tasks: string[], maxOps: number): ParsedSpec {
  if (spec.operations.length <= maxOps) return spec;
  const selected = selectOperations(spec.operations, tasks, maxOps);
  const keep = new Set(selected.map((operation) => `${operation.method} ${operation.path}`));
  const filtered = filterOperations(spec.document, keep);
  const reparsed = parseSpec(filtered);
  const note = `Trimmed from ${spec.operations.length} operations to ${reparsed.operations.length} so the agent stays inside the context and time budget.`;
  return {
    ...reparsed,
    warnings: [...spec.warnings, note],
    convertedFrom: spec.convertedFrom,
    trimmedFrom: spec.operations.length,
    trimNote: note,
  };
}

function selectOperations(operations: Operation[], tasks: string[], maxOps: number): Operation[] {
  const scores = new Map<string, number>();
  for (const operation of operations) scores.set(operation.operationId, 0);
  const corpus = tasks.length ? tasks : operations.map((operation) => operation.summary);
  for (const task of corpus) {
    for (const ranked of rankOperations(task, operations)) {
      scores.set(ranked.operation.operationId, (scores.get(ranked.operation.operationId) || 0) + ranked.score);
    }
  }
  const ordered = [...operations].sort(
    (a, b) => (scores.get(b.operationId) || 0) - (scores.get(a.operationId) || 0),
  );
  const chosen: Operation[] = [];
  const ids = new Set<string>();
  const add = (operation?: Operation) => {
    if (!operation || ids.has(operation.operationId) || chosen.length >= maxOps) return;
    ids.add(operation.operationId);
    chosen.push(operation);
  };
  for (const operation of ordered) {
    if (chosen.length >= maxOps) break;
    add(operation);
    const siblings = operations.filter((candidate) => candidate.collection === operation.collection);
    add(siblings.find((candidate) => candidate.method === "post" && !candidate.itemParam));
    add(siblings.find((candidate) => candidate.method === "get" && candidate.itemParam));
    add(siblings.find((candidate) => candidate.method === "get" && !candidate.itemParam));
  }
  return chosen;
}

function filterOperations(document: Record<string, unknown>, keep: Set<string>): Record<string, unknown> {
  const copy = structuredClone(document);
  const paths = isRecord(copy.paths) ? copy.paths : {};
  for (const [path, item] of Object.entries(paths)) {
    if (!isRecord(item)) continue;
    for (const method of [...METHODS]) {
      if (isRecord(item[method]) && !keep.has(`${method} ${path}`)) delete item[method];
    }
    const remaining = Object.keys(item).some((key) => METHODS.has(key));
    if (!remaining) delete paths[path];
  }
  const refs = new Set<string>();
  collectRefs(paths, copy, refs, []);
  pruneComponents(copy, refs);
  return copy;
}

function countOperations(paths: Record<string, unknown>): number {
  let count = 0;
  for (const item of Object.values(paths)) {
    if (!isRecord(item)) continue;
    for (const method of METHODS) if (isRecord(item[method])) count += 1;
  }
  return count;
}

function collectRefs(node: unknown, root: unknown, refs: Set<string>, stack: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, root, refs, stack);
    return;
  }
  if (!isRecord(node)) return;
  if (typeof node.$ref === "string" && node.$ref.startsWith("#/")) {
    if (!refs.has(node.$ref)) {
      refs.add(node.$ref);
      if (!stack.includes(node.$ref)) {
        const target = pointer(root, node.$ref);
        if (target) collectRefs(target, root, refs, [...stack, node.$ref]);
      }
    }
  }
  for (const value of Object.values(node)) collectRefs(value, root, refs, stack);
}

function pointer(root: unknown, ref: string): unknown {
  let current: unknown = root;
  for (const part of ref.slice(2).split("/")) {
    if (!isRecord(current)) return undefined;
    current = current[part.replace(/~1/g, "/").replace(/~0/g, "~")];
  }
  return current;
}

function pruneComponents(document: Record<string, unknown>, refs: Set<string>): void {
  if (isRecord(document.components)) {
    for (const section of ["schemas", "parameters", "requestBodies", "responses", "headers"]) {
      const bag = document.components[section];
      if (!isRecord(bag)) continue;
      for (const name of Object.keys(bag)) {
        if (!refs.has(`#/components/${section}/${encodePointer(name)}`) && !refs.has(`#/components/${section}/${name}`)) {
          delete bag[name];
        }
      }
    }
  }
  if (isRecord(document.definitions)) {
    for (const name of Object.keys(document.definitions)) {
      if (!refs.has(`#/definitions/${name}`) && !refs.has(`#/definitions/${encodePointer(name)}`)) {
        delete document.definitions[name];
      }
    }
  }
}

function encodePointer(name: string): string {
  return name.replace(/~/g, "~0").replace(/\//g, "~1");
}

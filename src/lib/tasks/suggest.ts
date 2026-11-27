import type { LlmProvider } from "@/lib/agent/providers";
import type { Operation, ParsedSpec } from "@/lib/types";

export function suggestTasksHeuristic(spec: ParsedSpec, limit = 5): string[] {
  const tasks: string[] = [];
  const used = new Set<string>();
  const push = (task: string) => {
    if (tasks.length >= limit || used.has(task)) return;
    used.add(task);
    tasks.push(task);
  };

  for (const operation of spec.operations) {
    if (operation.method !== "post" || operation.itemParam) continue;
    const noun = nounFor(operation);
    const follow = spec.operations.find(
      (candidate) => candidate.collection === operation.collection && candidate.method === "get" && candidate.itemParam,
    );
    if (follow) {
      push(`Create a ${noun}, then fetch it using the id from the create response.`);
    } else {
      push(`Create a ${noun}.`);
    }
  }

  for (const operation of spec.operations) {
    if (operation.method === "get" && !operation.itemParam) {
      push(`List ${nounFor(operation)} using ${operation.method.toUpperCase()} ${operation.path}.`);
    }
  }

  for (const operation of spec.operations) {
    if (operation.method === "delete" && operation.itemParam) {
      push(`Create a ${nounFor(operation)}, then delete it.`);
    }
  }

  for (const operation of spec.operations) {
    if (operation.security.length) {
      push(`Call "${operation.summary}" and include the credential the operation requires.`);
      break;
    }
  }

  for (const operation of spec.operations) {
    push(`${operation.summary}.`);
  }

  return tasks.slice(0, limit);
}

export async function suggestTasks(spec: ParsedSpec, provider?: LlmProvider): Promise<{ tasks: string[]; source: "model" | "heuristic" }> {
  const fallback = suggestTasksHeuristic(spec);
  if (!provider || provider.kind === "stub") return { tasks: fallback, source: "heuristic" };
  try {
    const catalog = spec.operations
      .slice(0, 40)
      .map((operation) => `${operation.method.toUpperCase()} ${operation.path} — ${operation.summary}`)
      .join("\n");
    const completion = await provider.complete(
      [
        {
          role: "system",
          content:
            "You propose evaluation tasks for an API spec. Reply with JSON only: {\"tasks\": string[]}. Write 5 tasks a person could ask an agent. Prefer tasks that create a resource and then fetch it. Use only operations in the list. Do not invent endpoints.",
        },
        { role: "user", content: `API: ${spec.title}\n${catalog}` },
      ],
      [],
    );
    const match = completion.content.match(/\{[\s\S]*\}/);
    if (!match) return { tasks: fallback, source: "heuristic" };
    const parsed = JSON.parse(match[0]) as { tasks?: unknown };
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks.map((task) => String(task).trim()).filter((task) => task.length > 8) : [];
    if (tasks.length < 3) return { tasks: fallback, source: "heuristic" };
    return { tasks: tasks.slice(0, 8), source: "model" };
  } catch {
    return { tasks: fallback, source: "heuristic" };
  }
}

function nounFor(operation: Operation): string {
  const segment = operation.collection
    .split("/")
    .map((part) => part.replace(/\.json$/i, ""))
    .filter((part) => part && !part.startsWith("{") && !/^\d/.test(part))
    .pop();
  if (!segment) return "resource";
  return segment.replace(/[_-]+/g, " ");
}

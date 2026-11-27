import { neon } from "@neondatabase/serverless";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";
import type { GalleryLink, ResultRecord, RunRecord, StatsSnapshot, Store } from "@/lib/db/store";
import type { StepRecord, Suggestion } from "@/lib/types";

export function createPostgresStore(databaseUrl: string): Store {
  const sqlClient = neon(databaseUrl);
  const db = drizzle(sqlClient, { schema });

  return {
    kind: "postgres",
    async createRun(run, results) {
      await db.insert(schema.runs).values({
        ...run,
        createdAt: new Date(run.createdAt),
      });
      if (results.length) {
        await db.insert(schema.taskResults).values(
          results.map((result) => ({
            ...result,
            startedAt: result.startedAt ? new Date(result.startedAt) : null,
          })),
        );
      }
    },
    async getRun(id) {
      const rows = await db.select().from(schema.runs).where(eq(schema.runs.id, id)).limit(1);
      return rows[0] ? mapRun(rows[0]) : null;
    },
    async findCached(cacheKey) {
      const rows = await db
        .select()
        .from(schema.runs)
        .where(and(eq(schema.runs.cacheKey, cacheKey), eq(schema.runs.status, "complete")))
        .limit(1);
      return rows[0] ? mapRun(rows[0]) : null;
    },
    async listResults(runId) {
      const rows = await db.select().from(schema.taskResults).where(eq(schema.taskResults.runId, runId));
      return rows.map(mapResult).sort((a, b) => a.taskIndex - b.taskIndex || a.modelId.localeCompare(b.modelId));
    },
    async claimNext(runId, modelId) {
      const rows = await sqlClient`
        WITH next AS (
          SELECT id FROM task_results
          WHERE run_id = ${runId}
            AND status = 'pending'
            AND (${modelId ?? null}::text IS NULL OR model_id = ${modelId ?? null})
          ORDER BY task_index, model_id
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        )
        UPDATE task_results AS t
        SET status = 'running', started_at = NOW()
        FROM next
        WHERE t.id = next.id
        RETURNING t.*
      `;
      const row = rows[0];
      return row ? mapResultRow(row) : null;
    },
    async reclaimStale(runId, olderThanMs) {
      await sqlClient`
        UPDATE task_results
        SET status = 'pending', started_at = NULL
        WHERE run_id = ${runId}
          AND status = 'running'
          AND started_at IS NOT NULL
          AND EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000 > ${olderThanMs}
      `;
    },
    async saveResult(id, patch) {
      await db
        .update(schema.taskResults)
        .set({
          modelLabel: patch.modelLabel,
          status: patch.status,
          passed: patch.passed,
          failureMode: patch.failureMode,
          explanation: patch.explanation,
          suggestion: patch.suggestion,
          steps: patch.steps,
          latencyMs: patch.latencyMs,
          promptTokens: patch.promptTokens,
          completionTokens: patch.completionTokens,
          checkSource: patch.checkSource,
          usedFallback: patch.usedFallback,
          error: patch.error,
          startedAt: patch.startedAt ? new Date(patch.startedAt) : undefined,
        })
        .where(eq(schema.taskResults.id, id));
    },
    async markRun(id, status, error) {
      await db
        .update(schema.runs)
        .set({ status, ...(error !== undefined ? { error } : {}) })
        .where(eq(schema.runs.id, id));
    },
    async addFeedback(entry) {
      await db.insert(schema.feedback).values({ ...entry, createdAt: new Date(entry.createdAt) });
    },
    async stats() {
      const [runRow] = await db
        .select({
          runs: sql<number>`count(*)::int`,
          liveRuns: sql<number>`count(*) filter (where provider_mode = 'live')::int`,
          uniqueSpecs: sql<number>`count(distinct spec_hash)::int`,
        })
        .from(schema.runs);
      const [feedbackRow] = await db
        .select({
          feedbackCount: sql<number>`count(*)::int`,
          usefulCount: sql<number>`count(*) filter (where useful)::int`,
        })
        .from(schema.feedback);
      return {
        runs: runRow?.runs || 0,
        liveRuns: runRow?.liveRuns || 0,
        uniqueSpecs: runRow?.uniqueSpecs || 0,
        feedbackCount: feedbackRow?.feedbackCount || 0,
        usefulCount: feedbackRow?.usefulCount || 0,
        storage: "postgres",
      } satisfies StatsSnapshot;
    },
    async bumpRate(key, day) {
      const rows = await sqlClient`
        INSERT INTO rate_buckets (bucket_key, day, count)
        VALUES (${key}, ${day}, 1)
        ON CONFLICT (bucket_key, day)
        DO UPDATE SET count = rate_buckets.count + 1
        RETURNING count
      `;
      return Number(rows[0]?.count || 0);
    },
    async upsertGallery(slug, runId) {
      await db
        .insert(schema.galleryEntries)
        .values({ slug, runId, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: schema.galleryEntries.slug,
          set: { runId, updatedAt: new Date() },
        });
    },
    async listGallery() {
      const rows = await db.select().from(schema.galleryEntries);
      return rows.map(
        (row): GalleryLink => ({
          slug: row.slug,
          runId: row.runId,
          updatedAt: toIso(row.updatedAt),
        }),
      );
    },
  };
}

function mapRun(row: typeof schema.runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    createdAt: toIso(row.createdAt),
    specHash: row.specHash,
    specTitle: row.specTitle,
    specVersion: row.specVersion,
    openapi: row.openapi,
    operationCount: row.operationCount,
    trimmed: row.trimmed,
    trimNote: row.trimNote,
    specJson: row.specJson,
    tasks: row.tasks,
    status: row.status as RunRecord["status"],
    cacheKey: row.cacheKey,
    ipHash: row.ipHash,
    notice: row.notice,
    providerMode: row.providerMode as RunRecord["providerMode"],
    error: row.error,
  };
}

function mapResult(row: typeof schema.taskResults.$inferSelect): ResultRecord {
  return {
    id: row.id,
    runId: row.runId,
    modelId: row.modelId,
    modelLabel: row.modelLabel,
    taskIndex: row.taskIndex,
    taskText: row.taskText,
    status: row.status as ResultRecord["status"],
    passed: row.passed,
    failureMode: row.failureMode,
    explanation: row.explanation,
    suggestion: row.suggestion,
    steps: row.steps || [],
    latencyMs: row.latencyMs,
    promptTokens: row.promptTokens,
    completionTokens: row.completionTokens,
    checkSource: row.checkSource,
    usedFallback: row.usedFallback,
    error: row.error,
    startedAt: row.startedAt ? toIso(row.startedAt) : null,
  };
}

function mapResultRow(row: Record<string, unknown>): ResultRecord {
  return {
    id: String(row.id),
    runId: String(row.run_id),
    modelId: String(row.model_id),
    modelLabel: String(row.model_label),
    taskIndex: Number(row.task_index),
    taskText: String(row.task_text),
    status: String(row.status) as ResultRecord["status"],
    passed: row.passed == null ? null : Boolean(row.passed),
    failureMode: row.failure_mode == null ? null : String(row.failure_mode),
    explanation: row.explanation == null ? null : String(row.explanation),
    suggestion: (row.suggestion as Suggestion | null) ?? null,
    steps: (row.steps as StepRecord[]) || [],
    latencyMs: row.latency_ms == null ? null : Number(row.latency_ms),
    promptTokens: row.prompt_tokens == null ? null : Number(row.prompt_tokens),
    completionTokens: row.completion_tokens == null ? null : Number(row.completion_tokens),
    checkSource: row.check_source == null ? null : String(row.check_source),
    usedFallback: Boolean(row.used_fallback),
    error: row.error == null ? null : String(row.error),
    startedAt: row.started_at ? toIso(row.started_at) : null,
  };
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return new Date(String(value)).toISOString();
}

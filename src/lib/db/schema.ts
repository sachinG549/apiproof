import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { StepRecord, Suggestion } from "@/lib/types";

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  specHash: text("spec_hash").notNull(),
  specTitle: text("spec_title").notNull(),
  specVersion: text("spec_version").notNull(),
  openapi: text("openapi").notNull(),
  operationCount: integer("operation_count").notNull(),
  trimmed: boolean("trimmed").notNull().default(false),
  trimNote: text("trim_note"),
  specJson: jsonb("spec_json").$type<Record<string, unknown>>().notNull(),
  tasks: jsonb("tasks").$type<string[]>().notNull(),
  status: text("status").notNull(),
  cacheKey: text("cache_key").notNull(),
  ipHash: text("ip_hash"),
  notice: text("notice"),
  providerMode: text("provider_mode").notNull(),
  error: text("error"),
});

export const taskResults = pgTable("task_results", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  modelId: text("model_id").notNull(),
  modelLabel: text("model_label").notNull(),
  taskIndex: integer("task_index").notNull(),
  taskText: text("task_text").notNull(),
  status: text("status").notNull(),
  passed: boolean("passed"),
  failureMode: text("failure_mode"),
  explanation: text("explanation"),
  suggestion: jsonb("suggestion").$type<Suggestion | null>(),
  steps: jsonb("steps").$type<StepRecord[]>().notNull(),
  latencyMs: integer("latency_ms"),
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  checkSource: text("check_source"),
  usedFallback: boolean("used_fallback").notNull().default(false),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
});

export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  useful: boolean("useful").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rateBuckets = pgTable(
  "rate_buckets",
  {
    bucketKey: text("bucket_key").notNull(),
    day: text("day").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.bucketKey, table.day] })],
);

export const galleryEntries = pgTable("gallery_entries", {
  slug: text("slug").primaryKey(),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

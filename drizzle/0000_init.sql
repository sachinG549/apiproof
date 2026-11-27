CREATE TABLE IF NOT EXISTS "runs" (
  "id" text PRIMARY KEY NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "spec_hash" text NOT NULL,
  "spec_title" text NOT NULL,
  "spec_version" text NOT NULL,
  "openapi" text NOT NULL,
  "operation_count" integer NOT NULL,
  "trimmed" boolean DEFAULT false NOT NULL,
  "trim_note" text,
  "spec_json" jsonb NOT NULL,
  "tasks" jsonb NOT NULL,
  "status" text NOT NULL,
  "cache_key" text NOT NULL,
  "ip_hash" text,
  "notice" text,
  "provider_mode" text NOT NULL,
  "error" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_results" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "runs"("id") ON DELETE cascade,
  "model_id" text NOT NULL,
  "model_label" text NOT NULL,
  "task_index" integer NOT NULL,
  "task_text" text NOT NULL,
  "status" text NOT NULL,
  "passed" boolean,
  "failure_mode" text,
  "explanation" text,
  "suggestion" jsonb,
  "steps" jsonb NOT NULL,
  "latency_ms" integer,
  "prompt_tokens" integer,
  "completion_tokens" integer,
  "check_source" text,
  "used_fallback" boolean DEFAULT false NOT NULL,
  "error" text,
  "started_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
  "id" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "runs"("id") ON DELETE cascade,
  "useful" boolean NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_buckets" (
  "bucket_key" text NOT NULL,
  "day" text NOT NULL,
  "count" integer NOT NULL,
  CONSTRAINT "rate_buckets_pk" PRIMARY KEY("bucket_key","day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gallery_entries" (
  "slug" text PRIMARY KEY NOT NULL,
  "run_id" text NOT NULL REFERENCES "runs"("id") ON DELETE cascade,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_cache_key_idx" ON "runs" ("cache_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_results_run_idx" ON "task_results" ("run_id");

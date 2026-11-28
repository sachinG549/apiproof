import { timingSafeEqual } from "crypto";
import { UserError } from "@/lib/errors";
import { listProviders, type LlmProvider } from "@/lib/agent/providers";
import type { Store } from "@/lib/db/store";
import { getStore } from "@/lib/db";
import { GALLERY_SOURCES } from "@/lib/gallery/sources";
import { loadGallerySpec } from "@/lib/gallery/load";
import { advanceRun, createRun } from "@/lib/runs/service";
import { getConfig } from "@/lib/config";

export type SeedStep = {
  done: boolean;
  session: string;
  slug: string | null;
  runId: string | null;
  status: string | null;
  completedSpecs: string[];
  remainingSpecs: string[];
};

export function assertAdminRequest(request: Request): void {
  const expected = getConfig().adminToken;
  if (!expected) throw new UserError("Set ADMIN_TOKEN before seeding the gallery.", 401);
  const header = request.headers.get("authorization") || "";
  const provided = header.replace(/^Bearer\s+/i, "").trim() || request.headers.get("x-admin-token")?.trim() || "";
  if (!safeEqual(provided, expected)) throw new UserError("Admin token was rejected.", 401);
}

export function sanitizeSession(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(trimmed)) return null;
  return trimmed;
}

export async function seedGalleryStep(input: { session: string; store?: Store; providers?: LlmProvider[] }): Promise<SeedStep> {
  const session = sanitizeSession(input.session);
  if (!session) throw new UserError("Pass a session id of 4 to 40 letters, numbers, dashes, or underscores.");
  const store = input.store || getStore();
  const providers = input.providers || liveProviders();
  const prefix = `gallery-seed:${session}:`;
  const runs = await store.listByCachePrefix(prefix);
  const active = runs.find((run) => run.status === "pending" || run.status === "running");
  if (active) {
    const report = await advanceRun(active.id, store, providers);
    const slug = slugFromKey(active.cacheKey, prefix);
    if (report.run.status === "complete" && slug) await store.upsertGallery(slug, active.id);
    return snapshot(session, store, prefix, slug, active.id, report.run.status);
  }

  const completed = new Set(runs.filter((run) => run.status === "complete").map((run) => slugFromKey(run.cacheKey, prefix)));
  const next = GALLERY_SOURCES.find((source) => !completed.has(source.slug));
  if (!next) {
    return {
      done: true,
      session,
      slug: null,
      runId: null,
      status: "complete",
      completedSpecs: GALLERY_SOURCES.map((source) => source.slug),
      remainingSpecs: [],
    };
  }

  const loaded = loadGallerySpec(next.slug);
  const created = await createRun({
    specText: loaded.text,
    tasks: loaded.source.tasks,
    ip: "gallery-seed",
    store,
    providers,
    skipRateLimit: true,
    bypassCache: true,
    noticeExtra: loaded.source.note,
    cacheKey: `${prefix}${next.slug}`,
  });
  const report = await advanceRun(created.id, store, providers);
  if (report.run.status === "complete") await store.upsertGallery(next.slug, created.id);
  return snapshot(session, store, prefix, next.slug, created.id, report.run.status);
}

function liveProviders(): LlmProvider[] {
  const providers = listProviders().filter((provider) => provider.kind !== "stub");
  if (!providers.length) {
    throw new UserError("Gallery seed needs GROQ_API_KEY or GEMINI_API_KEY on the server. Stub results are not stored.");
  }
  return providers;
}

async function snapshot(
  session: string,
  store: Store,
  prefix: string,
  slug: string | null,
  runId: string | null,
  status: string | null,
): Promise<SeedStep> {
  const runs = await store.listByCachePrefix(prefix);
  const completedSpecs = runs
    .filter((run) => run.status === "complete")
    .map((run) => slugFromKey(run.cacheKey, prefix))
    .filter((item): item is string => Boolean(item));
  const remainingSpecs = GALLERY_SOURCES.map((source) => source.slug).filter((item) => !completedSpecs.includes(item));
  return {
    done: remainingSpecs.length === 0,
    session,
    slug,
    runId,
    status,
    completedSpecs,
    remainingSpecs,
  };
}

function slugFromKey(cacheKey: string, prefix: string): string | null {
  if (!cacheKey.startsWith(prefix)) return null;
  const slug = cacheKey.slice(prefix.length);
  return GALLERY_SOURCES.some((source) => source.slug === slug) ? slug : null;
}

function safeEqual(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

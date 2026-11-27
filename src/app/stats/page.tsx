import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Stats" };

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const config = getConfig();
  const { token } = await searchParams;
  if (config.adminToken && token !== config.adminToken) {
    return (
      <div className="mx-auto max-w-xl px-5 py-16">
        <h1 className="font-serif text-4xl">Stats are locked</h1>
        <p className="mt-3 text-sm leading-6">
          ADMIN_TOKEN is set. Open this page with <span className="font-mono">?token=</span> set to that value. Comments are not shown here either way.
        </p>
      </div>
    );
  }

  let stats: Awaited<ReturnType<ReturnType<typeof getStore>["stats"]>> | null = null;
  let error: string | null = null;
  try {
    stats = await getStore().stats();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Could not read stats.";
  }
  const feedbackRate = stats && stats.runs ? Math.round((stats.feedbackCount / stats.runs) * 100) : 0;
  const usefulRate = stats && stats.feedbackCount ? Math.round((stats.usefulCount / stats.feedbackCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs uppercase tracking-[0.16em] text-pine">Product metrics</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Stats</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
        Runs, unique specs, and feedback. These are counts from the database
        {stats ? ` (${stats.storage})` : ""}. Live model runs are listed separately from stub previews.
        {config.adminToken ? "" : " ADMIN_TOKEN is not set, so this aggregate page is public."}
      </p>
      {error ? <p className="mt-6 text-sm text-clay">{error}</p> : null}
      {stats ? (
        <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Runs", String(stats.runs)],
            ["Live model runs", String(stats.liveRuns)],
            ["Unique specs", String(stats.uniqueSpecs)],
            ["Feedback", `${stats.feedbackCount} responses · ${feedbackRate}% of runs`],
            ["Marked useful", stats.feedbackCount ? `${usefulRate}% of responses` : "No responses yet"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line bg-card p-5">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted">{label}</dt>
              <dd className="mt-2 font-serif text-3xl tracking-tight">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

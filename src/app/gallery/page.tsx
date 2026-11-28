import type { Metadata } from "next";
import Link from "next/link";
import { getStore } from "@/lib/db";
import { loadGalleryCatalog } from "@/lib/gallery/load";
import { getReport } from "@/lib/runs/service";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryPage() {
  const catalog = loadGalleryCatalog();
  let links: { slug: string; runId: string }[] = [];
  try {
    links = await getStore().listGallery();
  } catch {
    links = [];
  }
  const bySlug = new Map(links.map((link) => [link.slug, link.runId]));

  const cards = await Promise.all(
    catalog.map(async ({ source, spec }) => {
      const runId = bySlug.get(source.slug);
      const report = runId ? await getReport(runId).catch(() => null) : null;
      return { source, spec, report };
    }),
  );
  const measured = cards.filter((card) => card.report).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <p className="text-xs uppercase tracking-[0.16em] text-pine">Public specs</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Gallery</h1>
      <p className="mt-4 max-w-2xl text-sm leading-6">
        Nine public OpenAPI documents, each with a fixed task list. Large specs are trimmed and the trim is written on the card.
        {measured === 0
          ? " No measured run is stored yet. POST /api/admin/gallery/seed on the deployed app fills these cards from the server's model keys. Nothing here is a placeholder score."
          : ` ${measured} of ${cards.length} have a measured run.`}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {cards.map(({ source, spec, report }) => (
          <article key={source.slug} className="flex flex-col rounded-lg border border-line bg-card p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-serif text-2xl">{source.name}</h2>
              <span className="text-xs text-muted">{spec.operations.length} ops</span>
            </div>
            <p className="mt-2 text-sm leading-6">{source.description}</p>
            <p className="mt-2 text-xs leading-5 text-muted">{source.note}</p>
            <a href={source.sourceUrl} className="mt-2 truncate text-xs text-pine">
              {source.sourceUrl}
            </a>
            {report ? (
              <div className="mt-4 space-y-1 text-sm">
                {report.summary.models.map((model) => {
                  const decided = model.passed + model.failed;
                  const rate = decided ? Math.round((model.passed / decided) * 100) : null;
                  return (
                    <p key={model.modelId}>
                      {model.modelLabel}: {rate == null ? "not scored" : `${rate}%`} ({model.passed}/{decided || model.total})
                    </p>
                  );
                })}
                <Link href={`/r/${report.run.id}`} className="mt-2 inline-block text-pine">
                  Open report
                </Link>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">Not run yet.</p>
            )}
            <ol className="mt-4 list-decimal space-y-1 pl-4 text-sm text-muted">
              {source.tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </div>
  );
}

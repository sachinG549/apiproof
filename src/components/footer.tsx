import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
        <p>APIProof measures task success. It never calls your real API and never edits the spec.</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/about">How scoring works</Link>
          <Link href="/gallery">Public specs</Link>
          <a href="https://github.com/sachinG549/apiproof">Source on GitHub</a>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-8 text-sm text-muted">
        <p>APIProof measures task success. It never calls your real API and never edits the spec.</p>
        <div className="flex gap-4">
          <Link href="/about">How success is judged</Link>
          <Link href="/gallery">Public specs</Link>
        </div>
      </div>
    </footer>
  );
}

import Link from "next/link";

export function Header() {
  return (
    <header className="border-b border-line/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
        <Link href="/" className="flex items-center gap-2 font-serif text-2xl tracking-tight">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-pine font-sans text-sm font-semibold text-card">
            AP
          </span>
          APIProof
        </Link>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link href="/gallery" className="hover:text-pine">
            Gallery
          </Link>
          <Link href="/about" className="hover:text-pine">
            About
          </Link>
          <Link href="/stats" className="hover:text-pine">
            Stats
          </Link>
          <Link href="/new" className="rounded-full bg-ink px-4 py-2 text-card hover:bg-pine-deep">
            Run a spec
          </Link>
        </nav>
      </div>
    </header>
  );
}

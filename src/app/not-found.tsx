import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-5 py-20">
      <h1 className="font-serif text-4xl">That page is not here.</h1>
      <p className="mt-3 text-sm">
        <Link href="/" className="text-pine">
          Back to the start
        </Link>
      </p>
    </div>
  );
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
  description: "Why APIProof measures task success, how a pass is decided, and what the product does not do.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs uppercase tracking-[0.16em] text-pine">About</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Why task success</h1>
      <div className="mt-8 space-y-8 text-[17px] leading-8">
        <section>
          <h2 className="font-serif text-2xl">The problem</h2>
          <p className="mt-2">
            An OpenAPI document can lint cleanly and still be a poor tool for an agent. The operation exists, the schema is valid, and the model still calls the wrong path, drops a required field, or invents an id. A static score never sees that, because it never asks a model to do a job.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">How a run is scored</h2>
          <p className="mt-2">
            Each task is mapped to operations from the words in the sentence. When that mapping is confident, the check is deterministic: the expected calls returned success, required parameters were present, a quoted name showed up in a request, and an id used later already appeared in an earlier response. When the mapping is weak, the same model acts as a judge and has to quote the call log. A pass without a matching quote is rejected.
          </p>
          <p className="mt-3">
            A fail is labeled: wrong operation, missing or ambiguous parameter, unclear id linkage, auth confusion, schema mismatch, a made-up endpoint, or the agent gave up. Quota, timeout, and overload are unscored. They are not treated as a problem in the spec.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">What this version does not do</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>It does not call the real API. The mock is in memory for one run.</li>
            <li>It does not require an account. A run is a link.</li>
            <li>It does not edit the spec. A suggestion names a method and a path.</li>
            <li>It compares the providers configured on the server, usually Groq and Gemini.</li>
            <li>Specs over the operation cap are trimmed, and the trim is written on the report.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Limits</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The mock stores resources and checks that a required credential is present. It does not run business rules the spec never wrote down.</li>
            <li>A pass means the agent navigated the spec. It does not mean a production integration works.</li>
            <li>Free-tier quotas run out. That model is marked unscored and the other model still finishes.</li>
            <li>Fetching a spec URL blocks private addresses after a DNS lookup. It does not pin the later connection to that IP.</li>
            <li>Gallery specs are subsets of public documents. Each card says what was kept and links to the source.</li>
          </ul>
        </section>
        <p>
          <a className="text-pine" href="https://github.com/sachinG549/apiproof">
            Source on GitHub
          </a>
        </p>
      </div>
    </article>
  );
}

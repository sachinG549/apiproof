import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-2xl px-5 py-12">
      <p className="text-xs uppercase tracking-[0.16em] text-pine">Case notes</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Why task success</h1>
      <div className="mt-8 space-y-8 text-[17px] leading-8">
        <section>
          <h2 className="font-serif text-2xl">The problem</h2>
          <p className="mt-2">
            An OpenAPI document can lint cleanly and still be a bad tool for an agent. The operation exists, the schema is valid, and the model still calls the wrong path, drops a required field, or invents an id. A static score never sees that, because it never asks a model to do a job.
          </p>
          <p className="mt-4 rounded-md border border-gold bg-gold/20 px-4 py-3 text-sm leading-6">
            TODO for Sachin: add one or two sentences on why you started this, in your own words. You were a technical writer and you are aiming at associate product manager roles. Say that yourself. Do not leave this placeholder in a public post.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Why task success beats a static score</h2>
          <p className="mt-2">
            A static score answers “does this document follow the rules?” Task success answers “given this document, can an agent finish the job?” Those come apart in ordinary places: two operations with similar summaries, a path parameter named differently from the response field, a security scheme declared once at the top and never mentioned again. APIProof keeps the spec, gives the operations to the model as tools, and checks the mock’s call log.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">What v1 leaves out</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>No calls to the real API. The mock is in memory for one run.</li>
            <li>No accounts. A run is a link.</li>
            <li>No automatic edits. A suggestion names a path. A person decides.</li>
            <li>Two providers, Groq and Gemini, and only when their keys are set.</li>
            <li>Specs over the operation cap are trimmed and the trim is disclosed.</li>
            <li>Webhooks, callbacks, and long-running jobs are out. The mock answers immediately.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-serif text-2xl">How success is judged</h2>
          <p className="mt-2">
            Each task is mapped to operations by the verbs and nouns in the sentence. When that mapping is confident, the check is deterministic: the expected calls returned success, required parameters were present, a quoted name showed up in a request, and an id used later already appeared in an earlier response. When the mapping is weak, the same model acts as a judge and must quote a line from the call log. A pass without a matching quote is rejected.
          </p>
          <p className="mt-3">
            Failures are labeled: wrong operation, missing or ambiguous parameter, unclear id linkage, auth confusion, schema mismatch, hallucinated endpoint, or the agent gave up. Quota and timeouts are not scored as spec failures.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">The metric</h2>
          <p className="mt-2">
            The numbers worth watching are on <a className="text-pine" href="/stats">/stats</a>: runs, unique specs, and how often people answer “was this useful?” There is no user count on this page because there is not one to report.
          </p>
          <p className="mt-4 rounded-md border border-gold bg-gold/20 px-4 py-3 text-sm leading-6">
            TODO for Sachin: when people have used this, add what you learned from the first reports. Until then, leave the number out. Do not invent a count.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Limitations</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>The mock stores resources, checks that required auth is present, and builds schema-shaped responses. It does not run business rules the spec never wrote down.</li>
            <li>A pass means the agent navigated the spec. It does not mean a production integration works.</li>
            <li>Free-tier quotas run out. The run says so and continues with the other model when it can.</li>
            <li>Fetching a spec URL blocks private addresses after a DNS lookup. It does not pin the later connection to that IP, so a rebinding race is still possible.</li>
            <li>Gallery specs are subsets. The card says what was kept and links to the source document.</li>
          </ul>
        </section>
      </div>
    </article>
  );
}

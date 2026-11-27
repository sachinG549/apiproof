import Link from "next/link";
import { ReportView } from "@/components/report-view";
import { SAMPLE_REPORT } from "@/lib/sample-report";

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto grid max-w-6xl items-end gap-10 px-5 py-16 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-pine">Task success, not a document score</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.02] tracking-tight sm:text-6xl">
            Your API scored 82 on agent-readiness.
            <span className="mt-2 block text-clay">The agent still failed a basic task.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8">
            Static linters score how a spec looks. APIProof hands the spec to an agent, runs the task against a mock of your API, and records whether the job got done.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/new" className="rounded-full bg-ink px-5 py-3 text-sm text-card">
              Test a spec
            </Link>
            <Link href="/example" className="rounded-full border border-ink px-5 py-3 text-sm">
              See a report layout
            </Link>
            <Link href="/gallery" className="rounded-full px-5 py-3 text-sm text-pine">
              Public gallery
            </Link>
          </div>
        </div>
        <div className="rounded-lg border border-line bg-card p-5 shadow-[8px_8px_0_#1c1612]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">What a miss looks like</p>
              <p className="mt-2 font-serif text-2xl">Create a customer, then fetch their invoice.</p>
            </div>
            <span className="stamp px-2 py-1 text-[11px] text-clay">Failed task</span>
          </div>
          <ol className="mt-5 space-y-2 font-mono text-xs">
            <li className="rounded-md bg-paper px-3 py-2">POST /customers → 201 · id cus_1001</li>
            <li className="rounded-md bg-paper px-3 py-2">GET /invoices/cus_demo → 404</li>
          </ol>
          <p className="mt-4 text-sm leading-6">
            The spec never said that <span className="font-mono">customer.id</span> is the value for the next call. The score stayed high. The task did not.
          </p>
        </div>
      </section>

      <section className="border-y border-line bg-card/70">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-12 md:grid-cols-3">
          {[
            ["Bring a spec", "Paste JSON or YAML, upload a file, or give a public URL. Swagger 2.0 is converted. Friendly errors when it is not a spec."],
            ["Name the tasks", "Write 3 to 10 jobs, or ask for suggestions grounded in the operations you actually defined. You can edit every one."],
            ["Compare two models", "Groq and Gemini each attempt the tasks against the same mock. You get a pass rate, the trace, and a spec change you make yourself."],
          ].map(([title, body], index) => (
            <div key={title}>
              <p className="font-mono text-xs text-pine">0{index + 1}</p>
              <h2 className="mt-2 font-serif text-2xl">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="font-serif text-3xl tracking-tight">A score answers a different question</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.14em] text-muted">
                <th className="py-3 font-medium">Question</th>
                <th className="py-3 font-medium">Static score</th>
                <th className="py-3 font-medium">APIProof</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Does the document parse and look consistent?", "Yes", "Yes, first"],
                ["Did an agent pick the right operation?", "Unknown", "Recorded"],
                ["Did it carry an id from create to fetch?", "Unknown", "Checked against the call log"],
                ["Did auth confuse it?", "Unknown", "401s are classified"],
                ["Who edits the spec?", "A human, usually later", "A human. APIProof only suggests."],
              ].map((row) => (
                <tr key={row[0]} className="border-b border-line/80">
                  {row.map((cell) => (
                    <td key={cell} className="py-3 pr-4 align-top">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-ink text-card">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <p className="text-xs uppercase tracking-[0.16em] text-gold">Report layout</p>
          <h2 className="mt-2 font-serif text-4xl text-card">The page you can share</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-sand">
            Each run has a URL. The picture below is a drawing of that page, labeled as an illustration. Measured runs live in the gallery after the seed job, and on your own report links.
          </p>
          <div className="mt-8 overflow-hidden rounded-lg bg-paper text-ink">
            <ReportView report={SAMPLE_REPORT} illustrative />
          </div>
        </div>
      </section>
    </div>
  );
}

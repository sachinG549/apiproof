import Link from "next/link";
import { PetstoreLaunch } from "@/components/petstore-launch";

const steps = [
  ["Paste a spec", "Give a public OpenAPI URL, upload a file, or paste JSON or YAML. Swagger 2.0 is converted. You do not need a key or credentials for that API."],
  ["Pick the tasks", "Write 3 to 10 jobs in plain language, or use suggestions based on the operations in the spec. You can edit every one."],
  ["Read the report", "Agents try each task on a mock built from the spec. No real calls are made. You get a shareable page: pass, fail, or unscored, plus the trace."],
];

const faqs = [
  ["Do I need an API key?", "No. You do not need credentials for the API you are testing. Agents call a mock built from the spec, so nothing is sent to the real service."],
  ["Is my spec stored?", "The trimmed spec is saved with the run so the report can be opened again. APIProof never edits the document."],
  ["Which models run?", "The public app runs Groq and Gemini for you. You do not bring your own keys. If one model is unavailable, the report says so and still shows the other."],
  ["What are the limits?", "3 to 10 tasks, a size cap on the spec, and a daily cap on new runs. A repeat of the same spec, tasks, and models reuses a finished report and does not count."],
  ["What does it cost?", "The public app is free. If a model cannot finish, that attempt is marked unscored and the report says why."],
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <p className="text-xs uppercase tracking-[0.18em] text-pine">OpenAPI, tested with an agent</p>
        <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.05] tracking-tight sm:text-6xl">
          Can an AI agent actually complete a task with your API?
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8">
          APIProof runs tasks against a mock of your OpenAPI spec and records whether the agent finished the job. A linter only scores how the document looks.
        </p>
        <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <Link href="/new" className="rounded-full bg-ink px-5 py-3 text-sm text-card">
            Test your spec
          </Link>
          <PetstoreLaunch className="rounded-full border border-ink px-5 py-3 text-sm disabled:opacity-50" />
        </div>
        <p className="mt-4 max-w-2xl text-sm text-muted">
          Petstore is one click. No account, and no API key for the service you are testing. Agents run against a mock, so no real calls are made.
        </p>
      </section>

      <section className="border-y border-line bg-card/70" aria-labelledby="how-heading">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h2 id="how-heading" className="font-serif text-3xl tracking-tight">
            How it works
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            {steps.map(([title, body], index) => (
              <li key={title}>
                <p className="font-mono text-xs text-pine">Step {index + 1}</p>
                <h3 className="mt-2 font-serif text-2xl">{title}</h3>
                <p className="mt-2 text-sm leading-6">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-2" aria-labelledby="score-heading">
        <div>
          <h2 id="score-heading" className="font-serif text-3xl tracking-tight">
            What the score means
          </h2>
          <p className="mt-4 text-sm leading-7">
            A pass means the agent called the operations the task needed, with valid parameters, and reused ids from earlier responses. A fail means it did not. Unscored means that attempt could not be scored. The report names the reason. It is not a fault in your API.
          </p>
          <p className="mt-3 text-sm leading-7">
            The report also names the path that confused the agent. APIProof does not change the spec.
          </p>
          <Link href="/example" className="mt-4 inline-block text-sm text-pine">
            Open the sample report layout
          </Link>
        </div>
        <div className="rounded-lg border border-line bg-card p-5 shadow-[8px_8px_0_#1c1612]">
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Sample preview · not a measured run</p>
          <p className="mt-3 font-serif text-2xl">Create a customer, then fetch their invoice.</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md bg-paper px-3 py-3">
              <dt className="text-muted">Model A</dt>
              <dd className="mt-1 font-serif text-3xl text-clay">Fail</dd>
              <dd className="text-xs text-muted">Unclear id linkage</dd>
            </div>
            <div className="rounded-md bg-paper px-3 py-3">
              <dt className="text-muted">Model B</dt>
              <dd className="mt-1 font-serif text-3xl text-pine">Pass</dd>
              <dd className="text-xs text-muted">Id reused from the create call</dd>
            </div>
          </dl>
          <ol className="mt-4 space-y-2 font-mono text-xs">
            <li className="rounded-md bg-paper px-3 py-2">POST /customers → 201 · id cus_1001</li>
            <li className="rounded-md bg-paper px-3 py-2">GET /invoices/cus_demo → 404</li>
          </ol>
        </div>
      </section>

      <section className="border-t border-line bg-card/40" aria-labelledby="gallery-heading">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <h2 id="gallery-heading" className="font-serif text-3xl tracking-tight">
            Gallery
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-7">
            Example reports on well-known public APIs, including Stripe, GitHub, and Slack. Each one uses a trimmed public spec and a fixed set of tasks. The reports are refreshed weekly.
          </p>
          <Link href="/gallery" className="mt-4 inline-block text-sm text-pine">
            Browse the gallery
          </Link>
        </div>
      </section>

      <section className="border-t border-line" aria-labelledby="faq-heading">
        <div className="mx-auto max-w-3xl px-5 py-14">
          <h2 id="faq-heading" className="font-serif text-3xl tracking-tight">
            Questions
          </h2>
          <div className="mt-6 divide-y divide-line border-y border-line">
            {faqs.map(([question, answer]) => (
              <details key={question} className="py-4">
                <summary className="text-base font-medium">{question}</summary>
                <p className="mt-2 text-sm leading-6 text-muted">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

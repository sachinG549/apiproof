"use client";

import { useState } from "react";

export function FeedbackForm({ runId }: { runId: string }) {
  const [useful, setUseful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(value: boolean) {
    setUseful(value);
    setError(null);
    const response = await fetch(`/api/runs/${runId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ useful: value, comment }),
    });
    const body = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(body.error || "Could not save that.");
      return;
    }
    setDone(true);
  }

  return (
    <section className="mt-10 rounded-lg border border-line bg-card px-5 py-5">
      <h2 className="font-serif text-2xl">Was this useful?</h2>
      <p className="mt-1 text-sm text-muted">A yes or no is the metric. A comment is optional and stays off the public stats page.</p>
      {done ? (
        <p className="mt-4 text-sm text-pine">Saved. Thank you.</p>
      ) : (
        <>
          <div className="mt-4 flex gap-2">
            <button type="button" className={`rounded-full px-4 py-2 text-sm ${useful === true ? "bg-pine text-card" : "bg-sand"}`} onClick={() => submit(true)}>
              Yes
            </button>
            <button type="button" className={`rounded-full px-4 py-2 text-sm ${useful === false ? "bg-clay text-card" : "bg-sand"}`} onClick={() => submit(false)}>
              No
            </button>
          </div>
          <label className="mt-4 block text-sm">
            Comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1000}
              rows={3}
              className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2"
            />
          </label>
          {useful != null ? (
            <button type="button" className="mt-3 text-sm text-pine" onClick={() => submit(useful)}>
              Save comment
            </button>
          ) : null}
          {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
        </>
      )}
    </section>
  );
}

"use client";

import React, { useState } from "react";
import { Check, Copy, Plus } from "lucide-react";
import { Button } from "../ui/Primitives";

/**
 * Create-key form.
 *
 * The plaintext key is returned by the server action and held in component
 * state for exactly one render. It is never written to the database in
 * plaintext, never re-fetchable, and disappears on navigation — which is why
 * the copy affordance is prominent and the warning is explicit.
 */
export function NewKeyForm({ action }: { action: (formData: FormData) => Promise<string> }) {
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    try {
      setCreated(await action(formData));
      setCopied(false);
    } finally {
      setPending(false);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      // Clipboard is unavailable over plain HTTP on some browsers; the key is
      // still selectable on screen, so this is not worth surfacing as an error.
    }
  }

  return (
    <div className="space-y-3">
      <form action={submit} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="key-name" className="eyebrow mb-1 block">
            Name
          </label>
          <input
            id="key-name"
            name="name"
            required
            placeholder="Production server"
            className="h-9 w-full rounded-soft border border-hairline bg-canvas px-2.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
          />
        </div>
        <div>
          <label htmlFor="key-kind" className="eyebrow mb-1 block">
            Type
          </label>
          <select
            id="key-kind"
            name="kind"
            defaultValue="sk"
            className="h-9 rounded-soft border border-hairline bg-canvas px-2.5 text-xs text-ink outline-none focus:border-brand"
          >
            <option value="sk">Secret (sk_)</option>
            <option value="pk">Publishable (pk_)</option>
          </select>
        </div>
        <Button type="submit" size="md" disabled={pending}>
          <Plus size={13} /> Create
        </Button>
      </form>

      {created ? (
        <div className="rounded-soft border border-warn/40 bg-warn/10 p-3">
          <p className="text-2xs font-semibold text-warn">
            Copy this now — it will never be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="mono min-w-0 flex-1 truncate rounded bg-canvas px-2 py-1.5 text-2xs text-ink">
              {created}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

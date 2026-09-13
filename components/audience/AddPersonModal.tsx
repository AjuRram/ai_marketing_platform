"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X, Loader2 } from "lucide-react";
import { Button, Card, Badge } from "@/components/ui/Primitives";
import { addPersonAction } from "@/app/(app)/audience/actions";

export function AddPersonModal({ lists }: { lists: Array<{ slug: string; name: string }> }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [listSlug, setListSlug] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await addPersonAction({
        email,
        name: name || undefined,
        company: company || undefined,
        role: role || undefined,
        listSlug: listSlug || undefined,
      });

      setOpen(false);
      setName("");
      setEmail("");
      setCompany("");
      setRole("");
      setListSlug("");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="primary" size="sm" onClick={() => setOpen(true)} className="flex items-center gap-1.5">
        <UserPlus size={14} />
        <span>+ Add Member</span>
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-5 space-y-4 bg-surface border border-hairline shadow-2xl relative">
            <button
              onClick={() => setOpen(false)}
              className="absolute top-4 right-4 text-muted hover:text-ink text-sm font-bold"
            >
              <X size={16} />
            </button>

            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Badge tone="brand">AUDIENCE DASHBOARD</Badge>
              </div>
              <h3 className="text-lg font-bold text-ink">Add New Audience Member</h3>
              <p className="text-2xs text-muted">
                Add a new client or contact directly to your organization’s audience.
              </p>
            </div>

            {error && (
              <div className="p-2.5 rounded bg-warn/10 border border-warn/20 text-xs text-warn">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-2xs font-semibold text-muted mb-1">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sarah Connor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-hairline bg-raised text-xs text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  placeholder="sarah@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-hairline bg-raised text-xs text-ink focus:outline-none focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-2xs font-semibold text-muted mb-1">Company</label>
                  <input
                    type="text"
                    placeholder="Acme Corp"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full h-8 px-2.5 rounded border border-hairline bg-raised text-xs text-ink focus:outline-none focus:border-brand"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-semibold text-muted mb-1">Role / Title</label>
                  <input
                    type="text"
                    placeholder="Marketing Director"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full h-8 px-2.5 rounded border border-hairline bg-raised text-xs text-ink focus:outline-none focus:border-brand"
                  />
                </div>
              </div>

              <div>
                <label className="block text-2xs font-semibold text-muted mb-1">Add to List (Optional)</label>
                <select
                  value={listSlug}
                  onChange={(e) => setListSlug(e.target.value)}
                  className="w-full h-8 px-2.5 rounded border border-hairline bg-raised text-xs text-ink focus:outline-none focus:border-brand"
                >
                  <option value="">-- Select Audience List --</option>
                  {lists.map((l) => (
                    <option key={l.slug} value={l.slug}>
                      {l.name} ({l.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <Button variant="ghost" size="sm" type="button" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={loading}>
                  {loading ? <Loader2 size={14} className="animate-spin" /> : "Save Member"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

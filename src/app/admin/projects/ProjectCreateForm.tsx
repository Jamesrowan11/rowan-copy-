"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "../actions";
import { SERVICE_TYPES } from "@/lib/constants";

type Option = { id: string; name: string; role?: string };

export function ProjectCreateForm({
  clients,
  staff,
}: {
  clients: Option[];
  staff: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProject, { ok: false });

  if (state.ok && open) {
    // Close and refresh on success.
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-primary" onClick={() => setOpen(true)}>
        + New project
      </button>
    );
  }

  return (
    <form action={formAction} className="card w-full space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-600 text-navy">New project</h2>
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {state.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input" required />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="clientId">Client</label>
          <select id="clientId" name="clientId" className="input" required defaultValue="">
            <option value="" disabled>Choose a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="assigneeId">Assign to (optional)</label>
          <select id="assigneeId" name="assigneeId" className="input" defaultValue="">
            <option value="">Unassigned</option>
            <optgroup label="Admins">
              {staff.filter((s) => s.role === "ADMIN").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
            <optgroup label="Employees">
              {staff.filter((s) => s.role === "EMPLOYEE").map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Project type</label>
          <select id="type" name="type" className="input" defaultValue={SERVICE_TYPES[0]}>
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dueDate">Due date (optional)</label>
          <input id="dueDate" name="dueDate" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="quotedPrice">Quoted price ($)</label>
          <input id="quotedPrice" name="quotedPrice" type="number" min="0" step="1" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="revisionRoundsIncluded">Revision rounds included</label>
          <input id="revisionRoundsIncluded" name="revisionRoundsIncluded" type="number" min="0" step="1" defaultValue={1} className="input" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="scope">Scope / brief</label>
        <textarea id="scope" name="scope" rows={4} className="input" required />
      </div>

      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  Money,
  fmtDate,
  fmtDateTime,
} from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { DocumentUpload } from "@/components/portal/DocumentUpload";
import { StaffStatusControl } from "./StaffStatusControl";
import { addProjectNote, saveBrief, addClientNote } from "@/app/admin/actions";

export default async function StaffProjectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireRole("EMPLOYEE");
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { include: { brandVoiceProfile: true } },
      brief: true,
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });

  // Server-side access: employees only see their own assigned projects.
  // An unassigned id (or someone else's) returns not-found, not the data.
  if (!project || project.assigneeId !== me.id) notFound();

  const bvp = project.client.brandVoiceProfile;

  return (
    <>
      <div className="mb-4">
        <Link href="/staff" className="text-sm text-navy-500 hover:text-navy">← My projects</Link>
      </div>
      <PageHeader
        title={project.title}
        description={`${project.type} · ${project.client.name}`}
        action={<StatusBadge status={project.status} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Status</h2>
            <StaffStatusControl projectId={project.id} status={project.status} />
          </section>

          <section className="card p-5">
            <h2 className="mb-2 text-lg font-600 text-navy">Scope / brief</h2>
            <p className="whitespace-pre-wrap text-sm text-navy-700">{project.scope}</p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-navy-400">Due</dt><dd className="text-navy-700">{fmtDate(project.dueDate)}</dd></div>
              <div><dt className="text-navy-400">Quoted</dt><dd className="text-navy-700"><Money value={project.quotedPrice} /></dd></div>
              <div><dt className="text-navy-400">Revisions</dt><dd className="text-navy-700">{project.revisionRoundsUsed} / {project.revisionRoundsIncluded} used</dd></div>
            </dl>
          </section>

          {/* Intake brief */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Project brief / intake</h2>
            <ActionForm action={saveBrief} hidden={{ projectId: project.id }} submitText="Save brief" successText="Saved">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="audience" label="Audience" value={project.brief?.audience} />
                <Field name="goal" label="Goal" value={project.brief?.goal} />
                <Field name="tone" label="Tone" value={project.brief?.tone} />
                <Field name="avoid" label="Avoid" value={project.brief?.avoid} />
                <Field name="competitors" label="Competitors" value={project.brief?.competitors} />
                <Field name="links" label="Links" value={project.brief?.links} />
              </div>
              <Field name="mustInclude" label="Must-include points" value={project.brief?.mustInclude} />
            </ActionForm>
          </section>

          {/* Internal notes */}
          <section className="card p-5">
            <h2 className="text-lg font-600 text-navy">Project notes</h2>
            <p className="mb-3 text-xs text-navy-500">Visible to the team (and admin) — never to the client.</p>
            <ActionForm action={addProjectNote} hidden={{ projectId: project.id }} submitText="Add note" resetOnSuccess>
              <textarea name="body" rows={2} className="input" placeholder="Add a note…" required />
            </ActionForm>
            <ul className="mt-4 space-y-3">
              {project.notes.length === 0 && <li className="text-sm text-navy-400">No notes yet.</li>}
              {project.notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                  <p className="text-xs font-600 text-navy-600">{n.author.name} · {fmtDateTime(n.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 text-lg font-600 text-navy">Client</h2>
            <p className="text-sm font-600 text-navy">{project.client.name}</p>
            <p className="text-sm text-navy-500">{project.client.email}</p>
            {project.client.phone && <p className="text-sm text-navy-500">{project.client.phone}</p>}
          </section>

          {bvp && (
            <section className="card p-5">
              <h2 className="mb-2 text-lg font-600 text-navy">Brand voice</h2>
              <dl className="space-y-2 text-sm">
                {bvp.tone && <div><dt className="font-600 text-navy-600">Tone</dt><dd className="text-navy-600">{bvp.tone}</dd></div>}
                {bvp.keyTerms && <div><dt className="font-600 text-navy-600">Key terms</dt><dd className="text-navy-600">{bvp.keyTerms}</dd></div>}
                {bvp.bannedCliches && <div><dt className="font-600 text-red-600">Banned clichés</dt><dd className="text-navy-600">{bvp.bannedCliches}</dd></div>}
                {bvp.notes && <div><dt className="font-600 text-navy-600">Notes</dt><dd className="text-navy-600">{bvp.notes}</dd></div>}
              </dl>
            </section>
          )}

          <section className="card p-5">
            <h2 className="mb-2 text-lg font-600 text-navy">Client note</h2>
            <p className="mb-3 text-xs text-navy-500">Add an internal note about the client (admins can delete).</p>
            <ActionForm action={addClientNote} hidden={{ clientUserId: project.clientId }} submitText="Add" resetOnSuccess>
              <textarea name="body" rows={2} className="input" placeholder="Note about the client…" required />
            </ActionForm>
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Upload a draft</h2>
            <DocumentUpload clientId={project.clientId} projectId={project.id} />
            <ul className="mt-4 space-y-2">
              {project.documents.length === 0 && <li className="text-sm text-navy-400">No files yet.</li>}
              {project.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 p-2.5">
                  <a href={`/api/documents/${d.id}`} className="link truncate text-sm">{d.originalName}</a>
                  <span className="text-xs text-navy-400">{fmtDate(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function Field({ name, label, value }: { name: string; label: string; value?: string | null }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={value ?? ""} />
    </div>
  );
}

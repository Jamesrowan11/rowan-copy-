import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  Money,
  fmtDate,
  fmtDateTime,
  EmptyState,
} from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { DocumentUpload } from "@/components/portal/DocumentUpload";
import { PaymentForm } from "@/components/portal/PaymentForm";
import { StatusControl } from "./StatusControl";
import { QuotePanel } from "./QuotePanel";
import {
  updateProjectDetails,
  addProjectNote,
  deleteProjectNote,
  saveBrief,
  deleteDocument,
  markPaymentPaid,
  deletePayment,
} from "../../actions";
import { SERVICE_TYPES } from "@/lib/constants";

export default async function AdminProjectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      client: { include: { brandVoiceProfile: true } },
      assignee: true,
      brief: true,
      quote: { include: { lineItems: true } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      documents: { include: { uploader: true }, orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  const staff = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "EMPLOYEE"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });

  const bvp = project.client.brandVoiceProfile;

  return (
    <>
      <div className="mb-4">
        <Link href="/admin/projects" className="text-sm text-navy-500 hover:text-navy">
          ← All projects
        </Link>
      </div>
      <PageHeader
        title={project.title}
        description={`${project.type} · ${project.client.name}`}
        action={<StatusBadge status={project.status} />}
      />

      {project.status === "Cancelled" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Cancelled</strong>
          {project.cancelledAt ? ` on ${fmtDate(project.cancelledAt)}` : ""}:{" "}
          {project.cancelledReason}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column — status, details, brief, notes */}
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Status & pipeline</h2>
            <StatusControl projectId={project.id} status={project.status} />
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Details</h2>
            <ActionForm
              action={updateProjectDetails}
              hidden={{ id: project.id }}
              submitText="Save details"
              successText="Saved"
            >
              <div>
                <label className="label" htmlFor="title">Title</label>
                <input id="title" name="title" className="input" defaultValue={project.title} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="type">Type</label>
                  <select id="type" name="type" className="input" defaultValue={project.type}>
                    {SERVICE_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="assigneeId">Assignee</label>
                  <select id="assigneeId" name="assigneeId" className="input" defaultValue={project.assigneeId ?? ""}>
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
                  <label className="label" htmlFor="dueDate">Due date</label>
                  <input id="dueDate" name="dueDate" type="date" className="input"
                    defaultValue={project.dueDate ? project.dueDate.toISOString().slice(0, 10) : ""} />
                </div>
                <div>
                  <label className="label" htmlFor="quotedPrice">Quoted price ($)</label>
                  <input id="quotedPrice" name="quotedPrice" type="number" min="0" step="1" className="input"
                    defaultValue={project.quotedPrice ?? ""} />
                </div>
                <div>
                  <label className="label" htmlFor="revisionRoundsIncluded">Revision rounds included</label>
                  <input id="revisionRoundsIncluded" name="revisionRoundsIncluded" type="number" min="0" step="1" className="input"
                    defaultValue={project.revisionRoundsIncluded} />
                </div>
                <div className="flex items-end">
                  <p className="text-sm text-navy-500">
                    Revisions used: <strong>{project.revisionRoundsUsed}</strong> /{" "}
                    {project.revisionRoundsIncluded}
                  </p>
                </div>
              </div>
              <div>
                <label className="label" htmlFor="scope">Scope / brief</label>
                <textarea id="scope" name="scope" rows={4} className="input" defaultValue={project.scope} />
              </div>
            </ActionForm>
          </section>

          {/* Intake brief */}
          <section className="card p-5">
            <h2 className="mb-1 text-lg font-600 text-navy">Project brief / intake</h2>
            <p className="mb-3 text-xs text-navy-500">
              Structured brief so the writer has what they need.
            </p>
            <ActionForm action={saveBrief} hidden={{ projectId: project.id }} submitText="Save brief" successText="Saved">
              <div className="grid gap-3 sm:grid-cols-2">
                <BriefField name="audience" label="Target audience" value={project.brief?.audience} />
                <BriefField name="goal" label="Goal" value={project.brief?.goal} />
                <BriefField name="tone" label="Tone" value={project.brief?.tone} />
                <BriefField name="avoid" label="Words/phrases to avoid" value={project.brief?.avoid} />
                <BriefField name="competitors" label="Competitors" value={project.brief?.competitors} />
                <BriefField name="links" label="Links" value={project.brief?.links} />
              </div>
              <BriefField name="mustInclude" label="Must-include points" value={project.brief?.mustInclude} full />
            </ActionForm>
          </section>

          {/* Internal notes */}
          <section className="card p-5">
            <h2 className="text-lg font-600 text-navy">Internal notes</h2>
            <p className="mb-3 text-xs text-navy-500">Visible to the team only — never to the client.</p>
            <ActionForm action={addProjectNote} hidden={{ projectId: project.id }} submitText="Add note" resetOnSuccess>
              <textarea name="body" rows={2} className="input" placeholder="Add a note for the team…" required />
            </ActionForm>
            <ul className="mt-4 space-y-3">
              {project.notes.length === 0 && (
                <li className="text-sm text-navy-400">No notes yet.</li>
              )}
              {project.notes.map((n) => (
                <li key={n.id} className="rounded-lg border border-navy-100 bg-navy-50/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-600 text-navy-600">
                      {n.author.name} · {fmtDateTime(n.createdAt)}
                    </p>
                    <ConfirmButton
                      action={deleteProjectNote.bind(null, n.id)}
                      confirm="Delete this note?"
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{n.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Right column — client, brand voice, documents, payments, quote */}
        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 text-lg font-600 text-navy">Client</h2>
            <p className="text-sm font-600 text-navy">{project.client.name}</p>
            <p className="text-sm text-navy-500">{project.client.email}</p>
            {project.client.phone && <p className="text-sm text-navy-500">{project.client.phone}</p>}
            <Link href={`/admin/users/${project.client.id}`} className="link mt-2 inline-block text-sm">
              Manage client →
            </Link>
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

          <QuotePanel
            projectId={project.id}
            quote={project.quote ? {
              id: project.quote.id,
              title: project.quote.title,
              status: project.quote.status,
              notes: project.quote.notes,
              lineItems: project.quote.lineItems.map((li) => ({
                id: li.id, label: li.label, quantity: li.quantity, unitPrice: li.unitPrice,
              })),
            } : null}
          />

          {/* Documents */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Deliverables & documents</h2>
            <DocumentUpload clientId={project.clientId} projectId={project.id} />
            <ul className="mt-4 space-y-2">
              {project.documents.length === 0 && (
                <li className="text-sm text-navy-400">No files yet.</li>
              )}
              {project.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 p-2.5">
                  <div className="min-w-0">
                    <a href={`/api/documents/${d.id}`} className="link block truncate text-sm">
                      {d.originalName}
                    </a>
                    <p className="text-xs text-navy-400">
                      {d.kind} · {(d.size / 1024).toFixed(0)} KB · {fmtDate(d.createdAt)}
                    </p>
                  </div>
                  <ConfirmButton
                    action={deleteDocument.bind(null, d.id)}
                    confirm="Delete this file?"
                    className="text-xs text-red-500 hover:underline"
                  >
                    Delete
                  </ConfirmButton>
                </li>
              ))}
            </ul>
          </section>

          {/* Payments */}
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Payments</h2>
            <PaymentForm clientId={project.clientId} projectId={project.id} />
            <ul className="mt-4 space-y-2">
              {project.payments.length === 0 && (
                <li className="text-sm text-navy-400">No payment links yet.</li>
              )}
              {project.payments.map((p) => (
                <li key={p.id} className="rounded-lg border border-navy-100 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-600 text-navy">{p.description}</p>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-xs text-navy-500">
                    <Money value={p.amount} /> ·{" "}
                    <a href={p.stripeUrl} target="_blank" rel="noreferrer" className="link">link</a>
                  </p>
                  <div className="mt-2 flex gap-3">
                    {p.status !== "Paid" && (
                      <ConfirmButton action={markPaymentPaid.bind(null, p.id)} className="text-xs text-emerald-600 hover:underline">Mark paid</ConfirmButton>
                    )}
                    <ConfirmButton
                      action={deletePayment.bind(null, p.id)}
                      confirm="Delete this payment record?"
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </ConfirmButton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}

function BriefField({
  name,
  label,
  value,
  full,
}: {
  name: string;
  label: string;
  value?: string | null;
  full?: boolean;
}) {
  return (
    <div className={full ? "" : ""}>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="input" defaultValue={value ?? ""} />
    </div>
  );
}

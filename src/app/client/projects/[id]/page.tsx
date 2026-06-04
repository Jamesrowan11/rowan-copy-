import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import {
  PageHeader,
  StatusBadge,
  Money,
  fmtDate,
} from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { RevisionControls } from "./RevisionControls";
import { saveClientBrief } from "../../actions";

export default async function ClientProjectDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await requireRole("CLIENT");
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      brief: true,
      assignee: true,
      documents: { orderBy: { createdAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  // Server-side access: a client can only see their own project. Changing the
  // id to someone else's returns not-found, never the data.
  if (!project || project.clientId !== me.id) notFound();

  const canReview = ["Draft Delivered", "Revisions"].includes(project.status);
  const remaining = project.revisionRoundsIncluded - project.revisionRoundsUsed;

  return (
    <>
      <div className="mb-4">
        <Link href="/client" className="text-sm text-navy-500 hover:text-navy">← My projects</Link>
      </div>
      <PageHeader title={project.title} description={project.type} action={<StatusBadge status={project.status} />} />

      {project.status === "Cancelled" && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          This project was cancelled.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-2 text-lg font-600 text-navy">Summary</h2>
            <p className="whitespace-pre-wrap text-sm text-navy-700">{project.scope}</p>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-navy-400">Status</dt><dd className="text-navy-700">{project.status}</dd></div>
              <div><dt className="text-navy-400">Due</dt><dd className="text-navy-700">{fmtDate(project.dueDate)}</dd></div>
              <div><dt className="text-navy-400">Price</dt><dd className="text-navy-700"><Money value={project.quotedPrice} /></dd></div>
            </dl>
          </section>

          {canReview && (
            <section className="card border-accent/40 p-5">
              <h2 className="mb-2 text-lg font-600 text-navy">Review the draft</h2>
              <RevisionControls projectId={project.id} remaining={remaining} />
            </section>
          )}

          {/* Project brief / intake */}
          <section className="card p-5">
            <h2 className="mb-1 text-lg font-600 text-navy">Project brief</h2>
            <p className="mb-3 text-xs text-navy-500">
              Fill this in so your writer has exactly what they need. The more detail, the better the copy.
            </p>
            <ActionForm action={saveClientBrief} hidden={{ projectId: project.id }} submitText="Save brief" successText="Saved — thank you!">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field name="audience" label="Who's the audience?" value={project.brief?.audience} />
                <Field name="goal" label="What's the goal?" value={project.brief?.goal} />
                <Field name="tone" label="Tone / voice" value={project.brief?.tone} />
                <Field name="avoid" label="Words/phrases to avoid" value={project.brief?.avoid} />
                <Field name="competitors" label="Competitors" value={project.brief?.competitors} />
                <Field name="links" label="Helpful links" value={project.brief?.links} />
              </div>
              <Field name="mustInclude" label="Must-include points" value={project.brief?.mustInclude} />
            </ActionForm>
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Deliverables & documents</h2>
            {project.documents.length === 0 ? (
              <p className="text-sm text-navy-400">Nothing shared yet. We&apos;ll post drafts here.</p>
            ) : (
              <ul className="space-y-2">
                {project.documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg border border-navy-100 p-2.5">
                    <a href={`/api/documents/${d.id}`} className="link truncate text-sm" download>{d.originalName}</a>
                    <span className="text-xs text-navy-400">{fmtDate(d.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 text-lg font-600 text-navy">Payments</h2>
            {project.payments.length === 0 ? (
              <p className="text-sm text-navy-400">No payment links yet.</p>
            ) : (
              <ul className="space-y-2">
                {project.payments.map((p) => (
                  <li key={p.id} className="rounded-lg border border-navy-100 p-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-600 text-navy">{p.description}</p>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="mt-1 text-xs text-navy-500"><Money value={p.amount} /></p>
                    {p.status !== "Paid" && (
                      <a href={p.stripeUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm mt-2">
                        Pay now
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
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

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDate } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { CountedTextarea } from "@/components/portal/CountedTextarea";
import { saveTemplate, deleteTemplate } from "../actions";
import { TEMPLATE_CATEGORIES } from "@/lib/constants";

export default async function AdminTemplatesPage() {
  await requireAdmin();
  const templates = await prisma.template.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
    include: { author: true },
  });

  return (
    <>
      <PageHeader title="Template library" description="Reusable caption, email, and policy starting points for the team." />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="card h-fit p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">New template</h2>
          <ActionForm action={saveTemplate} submitText="Save template" successText="Saved" resetOnSuccess>
            <select name="category" className="input" defaultValue="caption">
              {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="title" className="input" placeholder="Title" required />
            <CountedTextarea name="body" rows={6} placeholder="Template body…" required />
          </ActionForm>
        </section>

        <section>
          {templates.length === 0 ? (
            <EmptyState>No templates yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <li key={t.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="badge bg-accent-soft text-accent-hover">{t.category}</span>
                      <h3 className="mt-1 font-600 text-navy">{t.title}</h3>
                    </div>
                    <ConfirmButton action={deleteTemplate.bind(null, t.id)} confirm="Delete this template?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-navy-700">{t.body}</pre>
                  <p className="mt-2 text-xs text-navy-400">{t.author?.name ?? "—"} · {fmtDate(t.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

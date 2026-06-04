import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { saveTemplate } from "@/app/admin/actions";
import { TEMPLATE_CATEGORIES } from "@/lib/constants";

export default async function StaffTemplatesPage() {
  await requireRole("EMPLOYEE");
  const templates = await prisma.template.findMany({
    orderBy: [{ category: "asc" }, { title: "asc" }],
  });

  return (
    <>
      <PageHeader title="Template library" description="Reusable starting points. Add your own for the team." />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="card h-fit p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">Add a template</h2>
          <ActionForm action={saveTemplate} submitText="Save" successText="Saved" resetOnSuccess>
            <select name="category" className="input" defaultValue="caption">
              {TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input name="title" className="input" placeholder="Title" required />
            <textarea name="body" rows={6} className="input" placeholder="Template body…" required />
          </ActionForm>
        </section>
        <section>
          {templates.length === 0 ? (
            <EmptyState>No templates yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <li key={t.id} className="card p-5">
                  <span className="badge bg-accent-soft text-accent-hover">{t.category}</span>
                  <h3 className="mt-1 font-600 text-navy">{t.title}</h3>
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-navy-700">{t.body}</pre>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

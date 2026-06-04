import { requireAdmin } from "@/lib/authz";
import { PageHeader } from "@/components/portal/ui";

export default async function AdminExportPage() {
  await requireAdmin();
  const exports = [
    { type: "clients", label: "Clients", desc: "All client accounts with plan status." },
    { type: "projects", label: "Projects", desc: "Every project with client, assignee, status, and price." },
    { type: "payments", label: "Payments", desc: "All payment links and their paid status." },
  ];
  return (
    <>
      <PageHeader title="Data export" description="Download a CSV backup of your records." />
      <div className="grid gap-4 sm:grid-cols-3">
        {exports.map((e) => (
          <div key={e.type} className="card p-6">
            <h2 className="text-lg font-600 text-navy">{e.label}</h2>
            <p className="mt-1 text-sm text-navy-600">{e.desc}</p>
            <a href={`/api/export?type=${e.type}`} className="btn-outline btn-sm mt-4" download>
              Download CSV
            </a>
          </div>
        ))}
      </div>
    </>
  );
}

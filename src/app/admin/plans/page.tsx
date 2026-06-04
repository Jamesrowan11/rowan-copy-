import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDate } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { saveMonthlyPlan } from "../actions";

export default async function AdminPlansPage() {
  await requireAdmin();
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT" },
    orderBy: { name: "asc" },
    include: { monthlyPlan: true },
  });

  const activeCount = clients.filter((c) => c.monthlyPlan?.active).length;

  return (
    <>
      <PageHeader
        title="Monthly plans"
        description={`$30/month hosting + upkeep. ${activeCount} active plan${activeCount === 1 ? "" : "s"}.`}
      />
      {clients.length === 0 ? (
        <EmptyState>No clients yet.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {clients.map((c) => (
            <div key={c.id} className="card p-5">
              <div className="mb-2 flex items-center justify-between">
                <Link href={`/admin/users/${c.id}`} className="font-600 text-navy hover:text-accent-hover">
                  {c.name}
                </Link>
                {c.monthlyPlan?.active ? (
                  <span className="badge bg-emerald-100 text-emerald-700">
                    Active · renews {fmtDate(c.monthlyPlan.renewalDate)}
                  </span>
                ) : (
                  <span className="badge bg-navy-100 text-navy-500">No active plan</span>
                )}
              </div>
              <ActionForm action={saveMonthlyPlan} hidden={{ clientId: c.id }} submitText="Save" successText="Saved" className="space-y-3">
                <label className="flex items-center gap-2 text-sm text-navy-700">
                  <input type="checkbox" name="active" defaultChecked={c.monthlyPlan?.active ?? false} className="rounded" />
                  Active plan
                </label>
                <input name="renewalDate" type="date" className="input"
                  defaultValue={c.monthlyPlan?.renewalDate ? c.monthlyPlan.renewalDate.toISOString().slice(0, 10) : ""} />
              </ActionForm>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

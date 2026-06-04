import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";

const EMAIL_STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-100 text-emerald-700",
  logged: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
};
import { ComposeEmail } from "@/components/portal/ComposeEmail";

export default async function AdminEmailsPage() {
  await requireAdmin();

  const [recipients, emails] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
    }),
    prisma.emailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Compose email"
        description="Send to portal users and/or typed addresses. Signature is appended automatically."
      />

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <ComposeEmail recipients={recipients} />

        <section>
          <h2 className="mb-3 text-lg font-600 text-navy">Sent email history</h2>
          {emails.length === 0 ? (
            <EmptyState>No emails sent yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {emails.map((e) => (
                <li key={e.id} className="card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-600 text-navy">{e.subject}</p>
                    <span className={`badge ${EMAIL_STATUS_STYLE[e.status] || "bg-navy-100 text-navy-600"}`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-navy-500">To: {e.to}</p>
                  <p className="mt-1 text-xs text-navy-400">
                    {e.sender ? e.sender.name : "System"} · {fmtDateTime(e.createdAt)} · {e.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

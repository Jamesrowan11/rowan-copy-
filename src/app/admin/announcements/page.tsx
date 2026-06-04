import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { ActionForm } from "@/components/portal/ActionForm";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { createAnnouncement, deleteAnnouncement } from "../actions";

export default async function AdminAnnouncementsPage() {
  await requireAdmin();
  const announcements = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });

  return (
    <>
      <PageHeader title="Announcements" description="Posted to the team. Employees see these on their dashboard." />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="card h-fit p-6">
          <h2 className="mb-3 text-lg font-600 text-navy">New announcement</h2>
          <ActionForm action={createAnnouncement} submitText="Post" successText="Posted" resetOnSuccess>
            <input name="title" className="input" placeholder="Title" required />
            <textarea name="body" rows={4} className="input" placeholder="What's the news?" required />
          </ActionForm>
        </section>

        <section>
          {announcements.length === 0 ? (
            <EmptyState>No announcements yet.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {announcements.map((a) => (
                <li key={a.id} className="card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-600 text-navy">{a.title}</h3>
                    <ConfirmButton action={deleteAnnouncement.bind(null, a.id)} confirm="Delete this announcement?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-navy-700">{a.body}</p>
                  <p className="mt-2 text-xs text-navy-400">{a.author.name} · {fmtDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

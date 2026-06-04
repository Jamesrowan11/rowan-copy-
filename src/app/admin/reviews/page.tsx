import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, EmptyState, StatusBadge, fmtDate } from "@/components/portal/ui";
import { ConfirmButton } from "@/components/portal/ConfirmButton";
import { toggleReviewFeatured, deleteReview } from "../actions";
import { ReviewRequestForm } from "./ReviewRequestForm";

export default async function AdminReviewsPage() {
  await requireAdmin();
  const [reviews, projects] = await Promise.all([
    prisma.review.findMany({ orderBy: { createdAt: "desc" }, include: { project: true } }),
    prisma.project.findMany({
      where: { status: { in: ["Approved", "Closed"] } },
      orderBy: { updatedAt: "desc" },
      include: { client: true },
    }),
  ]);

  return (
    <>
      <PageHeader title="Reviews & testimonials" description="Request reviews and feature the best ones on the marketing site." />

      <section className="card mb-6 p-6">
        <h2 className="mb-3 text-lg font-600 text-navy">Request a review</h2>
        <ReviewRequestForm projects={projects.map((p) => ({ id: p.id, title: p.title, clientName: p.client.name }))} />
      </section>

      {reviews.length === 0 ? (
        <EmptyState>No reviews yet.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-600 text-navy">
                    {r.authorName}{r.business ? ` · ${r.business}` : ""}
                    {r.rating ? <span className="ml-2 text-accent">{"★".repeat(r.rating)}</span> : null}
                  </p>
                  <p className="text-xs text-navy-400">
                    {r.project?.title ?? "—"} · {fmtDate(r.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.featured && <span className="badge bg-accent text-white">Featured</span>}
                  <StatusBadge status={r.status} />
                </div>
              </div>
              {r.body && <p className="mt-2 whitespace-pre-wrap text-sm text-navy-700">{r.body}</p>}
              <div className="mt-3 flex gap-3">
                {r.status !== "Requested" && (
                  <ConfirmButton action={toggleReviewFeatured.bind(null, r.id)} className="text-xs text-accent-hover hover:underline">
                    {r.featured ? "Unfeature" : "Feature on site"}
                  </ConfirmButton>
                )}
                <ConfirmButton action={deleteReview.bind(null, r.id)} confirm="Delete this review?" className="text-xs text-red-500 hover:underline">Delete</ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/authz";
import { PageHeader, StatusBadge, EmptyState, fmtDateTime } from "@/components/portal/ui";
import { InquiryActions } from "./InquiryActions";

export default async function InquiriesPage() {
  await requireAdmin();
  const inquiries = await prisma.inquiry.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <PageHeader
        title="Inquiries"
        description="Quote and contact requests from the website and the client portal."
      />

      {inquiries.length === 0 ? (
        <EmptyState>No inquiries yet.</EmptyState>
      ) : (
        <div className="space-y-4">
          {inquiries.map((i) => (
            <div key={i.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-600 text-navy">
                    {i.name}
                    {i.business ? (
                      <span className="text-navy-400"> · {i.business}</span>
                    ) : null}
                  </p>
                  <p className="text-sm text-navy-500">
                    <a href={`mailto:${i.email}`} className="link">{i.email}</a>
                    {i.phone ? ` · ${i.phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={i.status} />
                  <span className="badge bg-navy-100 text-navy-600">{i.serviceType}</span>
                </div>
              </div>

              <p className="mt-3 whitespace-pre-wrap text-sm text-navy-700">{i.message}</p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-navy-100 pt-3">
                <p className="text-xs text-navy-400">
                  {i.budget ? `Budget: ${i.budget} · ` : ""}
                  {i.source} · {fmtDateTime(i.createdAt)}
                </p>
                <InquiryActions
                  id={i.id}
                  status={i.status}
                  converted={i.status === "Converted"}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

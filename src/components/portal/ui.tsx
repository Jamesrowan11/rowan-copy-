import type { ProjectStatus } from "@/lib/constants";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-700 text-navy">{title}</h1>
        {description && <p className="mt-1 text-sm text-navy-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Inquiry: "bg-navy-100 text-navy-600",
  "Quote Sent": "bg-blue-100 text-blue-700",
  Accepted: "bg-indigo-100 text-indigo-700",
  "In Progress": "bg-amber-100 text-amber-700",
  "Draft Delivered": "bg-purple-100 text-purple-700",
  Revisions: "bg-orange-100 text-orange-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Closed: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
  // payment / quote
  Sent: "bg-blue-100 text-blue-700",
  Paid: "bg-emerald-100 text-emerald-700",
  Draft: "bg-navy-100 text-navy-600",
  Declined: "bg-red-100 text-red-700",
  New: "bg-amber-100 text-amber-700",
  Reviewed: "bg-blue-100 text-blue-700",
  Converted: "bg-emerald-100 text-emerald-700",
  Archived: "bg-navy-100 text-navy-500",
  // lead generator (Demo)
  Queued: "bg-navy-100 text-navy-600",
  Building: "bg-blue-100 text-blue-700",
  Ready: "bg-emerald-100 text-emerald-700",
  DeployFailed: "bg-orange-100 text-orange-700",
  Error: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] || "bg-navy-100 text-navy-600";
  return <span className={`badge ${cls}`}>{status}</span>;
}

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-navy-400">
        {label}
      </p>
      <p className="mt-1 font-heading text-3xl font-700 text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-navy-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-navy-200 bg-white p-8 text-center text-sm text-navy-500">
      {children}
    </div>
  );
}

export function Money({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-navy-400">—</span>;
  return <>${value.toLocaleString("en-US", { minimumFractionDigits: 0 })}</>;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type { ProjectStatus };

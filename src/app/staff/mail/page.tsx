import { requireRole } from "@/lib/authz";
import { PageHeader } from "@/components/portal/ui";
import { MailView } from "@/components/mail/MailView";

export const dynamic = "force-dynamic";

function norm(raw: Record<string, string | string[] | undefined>) {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v[0] : v;
  return out;
}

export default async function StaffMailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("EMPLOYEE");
  const sp = norm(await searchParams);
  return (
    <>
      <PageHeader title="Mail" description="Your work inbox — read and send, right from the portal." />
      <MailView user={user} basePath="/staff/mail" searchParams={sp} />
    </>
  );
}
